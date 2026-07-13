// Neku co-op relay — Cloudflare Worker + Durable Object.
//
// The hosted version of tools/collab.js: each co-op room is one Durable
// Object holding the latest project doc (chunked in SQLite) and its assets.
// Anyone with the room code can join from the web or desktop Studio.
//
// Protocol (JSON text frames, shared with tools/collab.js — see editor/collab.js):
//   → hello    { name }                       first message after connect
//   ← welcome  { id, color, peers, doc, v }   doc has assets: {} — assets follow
//   ← asset    { name, part, of, data }       stored assets, chunked
//   ← assetsDone {}
//   → doc      { doc }                        project WITHOUT assets (LWW)
//   ← doc      { doc, v, from } · ← ack { v }
//   → asset    { name, part, of, data }       one changed asset, chunked
//   → assetDel { name }
//   → presence { selName }                    ← presence { id, name, color, selName }
//   ← peers    { peers }
//   → "ping" (raw)                            ← "pong" (auto, no DO wake-up)
//
// Deploy:  cd relay && npx wrangler deploy
// Rooms self-clean 7 days after the last edit.

import { DurableObject } from 'cloudflare:workers';

const COLORS = ['#29e6c4', '#ff5c9e', '#ffcb47', '#4ade80', '#5fa8e0', '#c084fc', '#fb923c', '#f87171'];
const MAX_CLIENTS = 8;
const MAX_DOC_BYTES = 8 * 1024 * 1024;    // project sans assets
const MAX_ASSET_BYTES = 48 * 1024 * 1024; // all assets in a room combined
const CHUNK_ROWS = 900 * 1024;            // stay under SQLite's 2 MB value cap
const ROOM_TTL_MS = 7 * 24 * 3600 * 1000;

export class NekuRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.docCache = null; // string | null — avoids re-reading chunks per edit
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS doc_chunks (i INTEGER PRIMARY KEY, data TEXT)`);
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS assets (name TEXT, part INTEGER, of INTEGER, data TEXT, PRIMARY KEY (name, part))`
      );
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Neku co-op room. Connect from Neku Studio.', { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= MAX_CLIENTS) {
      return new Response('room full', { status: 503 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  _meta(k, fallback = null) {
    const row = this.ctx.storage.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return row ? row.v : fallback;
  }

  _setMeta(k, v) {
    this.ctx.storage.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
  }

  _doc() {
    if (this.docCache === null) {
      const rows = this.ctx.storage.sql.exec('SELECT data FROM doc_chunks ORDER BY i').toArray();
      this.docCache = rows.length ? rows.map((r) => r.data).join('') : '';
    }
    return this.docCache;
  }

  _saveDoc(str) {
    this.docCache = str;
    this.ctx.storage.sql.exec('DELETE FROM doc_chunks');
    for (let i = 0; i * CHUNK_ROWS < str.length; i++) {
      this.ctx.storage.sql.exec('INSERT INTO doc_chunks (i, data) VALUES (?, ?)', i, str.slice(i * CHUNK_ROWS, (i + 1) * CHUNK_ROWS));
    }
  }

  _touch() {
    // Rooms clean themselves up after a week of silence.
    this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'room expired');
    await this.ctx.storage.deleteAll();
    this.docCache = null;
  }

  _peers() {
    return this.ctx.getWebSockets().map((ws) => {
      const a = ws.deserializeAttachment() || {};
      return { id: a.id, name: a.name, color: a.color, selName: a.selName || null };
    }).filter((p) => p.id);
  }

  _broadcast(obj, exceptId = null) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.id && a.id !== exceptId) {
        try { ws.send(msg); } catch { /* closing */ }
      }
    }
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return;
    let m;
    try { m = JSON.parse(message); } catch { return; }
    const a = ws.deserializeAttachment() || {};

    if (m.t === 'hello') {
      const taken = new Set(this._peers().map((p) => p.color));
      const attach = {
        id: crypto.randomUUID().slice(0, 8),
        name: String(m.name || 'anon').slice(0, 24),
        color: COLORS.find((c) => !taken.has(c)) || COLORS[this.ctx.getWebSockets().length % COLORS.length],
        selName: null,
      };
      ws.serializeAttachment(attach);
      const doc = this._doc();
      ws.send(JSON.stringify({
        t: 'welcome',
        id: attach.id,
        color: attach.color,
        peers: this._peers(),
        doc: doc ? JSON.parse(doc) : null,
        v: +this._meta('v', 0),
      }));
      // Assets stream after the welcome so no single frame exceeds limits.
      for (const row of this.ctx.storage.sql.exec('SELECT name, part, of, data FROM assets ORDER BY name, part').toArray()) {
        ws.send(JSON.stringify({ t: 'asset', name: row.name, part: row.part, of: row.of, data: row.data }));
      }
      ws.send(JSON.stringify({ t: 'assetsDone' }));
      this._broadcast({ t: 'peers', peers: this._peers() }, attach.id);
      this._touch();
      return;
    }

    if (!a.id) return; // hello first

    if (m.t === 'doc') {
      const str = JSON.stringify(m.doc ?? null);
      if (str.length > MAX_DOC_BYTES) {
        ws.send(JSON.stringify({ t: 'error', message: 'project too large for co-op sync' }));
        return;
      }
      this._saveDoc(str);
      const v = +this._meta('v', 0) + 1;
      this._setMeta('v', v);
      ws.send(JSON.stringify({ t: 'ack', v }));
      this._broadcast({ t: 'doc', doc: m.doc, v, from: a.id }, a.id);
      this._touch();
    } else if (m.t === 'asset') {
      const name = String(m.name || '').slice(0, 200);
      if (!name || typeof m.data !== 'string') return;
      const part = m.part | 0, of = Math.max(1, m.of | 0);
      const total = this.ctx.storage.sql.exec('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM assets').one().n;
      if (total + m.data.length > MAX_ASSET_BYTES) {
        ws.send(JSON.stringify({ t: 'error', message: 'room asset storage is full' }));
        return;
      }
      if (part === 0) this.ctx.storage.sql.exec('DELETE FROM assets WHERE name = ?', name);
      this.ctx.storage.sql.exec(
        'INSERT INTO assets (name, part, of, data) VALUES (?, ?, ?, ?) ON CONFLICT(name, part) DO UPDATE SET of = excluded.of, data = excluded.data',
        name, part, of, m.data
      );
      this._broadcast({ t: 'asset', name, part, of, data: m.data }, a.id);
      this._touch();
    } else if (m.t === 'assetDel') {
      const name = String(m.name || '');
      this.ctx.storage.sql.exec('DELETE FROM assets WHERE name = ?', name);
      this._broadcast({ t: 'assetDel', name }, a.id);
      this._touch();
    } else if (m.t === 'presence') {
      a.selName = m.selName ? String(m.selName).slice(0, 100) : null;
      ws.serializeAttachment(a);
      this._broadcast({ t: 'presence', id: a.id, name: a.name, color: a.color, selName: a.selName }, a.id);
    }
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.id) this._broadcast({ t: 'peers', peers: this._peers().filter((p) => p.id !== a.id) }, a.id);
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9-]{3,32})$/);
    if (m) {
      return env.NEKU_ROOM.getByName(m[1].toUpperCase()).fetch(request);
    }
    return new Response(
      'Neku co-op relay >w<\n\nHost or join a session from Neku Studio (Co-op button).\nhttps://github.com/deviverr/NEKU-Engine\n',
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  },
};
