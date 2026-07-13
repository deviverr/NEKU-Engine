// Neku Studio co-op client — Team Create over WebSocket.
//
// Works against the hosted relay (Cloudflare, room code in the URL) and the
// zero-dep local server (tools/collab.js, room name in the hello message).
//
// Protocol v2 (JSON): the project doc syncs WITHOUT assets (small + frequent);
// assets sync separately in ≤256 KB chunks only when they change, so no frame
// exceeds relay message limits and keystrokes don't re-upload every sprite.
//
//   → hello {room?, name} · ← welcome {id, color, peers, doc, v}
//   ← asset {name, part, of, data}* · ← assetsDone
//   → doc {doc} · ← doc {doc, v, from} · ← ack {v}
//   → asset {name, part, of, data} · → assetDel {name}
//   → presence {selName} · ← presence {...} · ← peers {list}

export const DEFAULT_RELAY = 'wss://neku-coop.dedpul3000a.workers.dev';

const CHUNK = 256 * 1024;

// Room codes: unambiguous alphabet, NEKU-XXXX style.
export function makeRoomCode() {
  const AB = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += AB[b % AB.length];
  return s;
}

export function relayRoomUrl(relayBase, code) {
  return relayBase.replace(/\/+$/, '') + '/room/' + encodeURIComponent(code.toUpperCase());
}

export class CollabClient {
  constructor(handlers) {
    // handlers: { onSnapshot, onDoc, onPeers, onPresence, onStatus,
    //             onAsset(name, url), onAssetDel(name), onError(message) }
    this.h = handlers;
    this.ws = null;
    this.id = null;
    this.version = 0;
    this.room = null;      // { url, room, name } — remembered for reconnect
    this._docTimer = 0;
    this._pingTimer = 0;
    this._retryTimer = 0;
    this._retries = 0;
    this._manualClose = false;
    this._sentAssets = new Map();   // name -> url string last pushed/received
    this._incoming = new Map();     // name -> { parts: [], of }
  }

  get connected() {
    return this.ws?.readyState === 1;
  }

  connect({ url, room, name }) {
    this.disconnect(true);
    this.room = { url, room, name };
    this._manualClose = false;
    this._retries = 0;
    this._dial();
  }

  _dial() {
    const { url, room, name } = this.room;
    this.h.onStatus?.(this._retries ? 'reconnecting' : 'connecting');
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.h.onStatus?.('error');
      this.h.onError?.(e.message);
      return;
    }
    this.ws.onopen = () => {
      this._retries = 0;
      this._send({ t: 'hello', room, name });
      clearInterval(this._pingTimer);
      this._pingTimer = setInterval(() => {
        if (this.connected) this.ws.send('ping');
      }, 25000);
    };
    this.ws.onclose = () => {
      clearInterval(this._pingTimer);
      this.h.onPeers?.([]);
      if (this._manualClose) {
        this.h.onStatus?.('offline');
        return;
      }
      // Auto-reconnect with backoff; the server keeps the doc.
      const wait = Math.min(30000, 1000 * 2 ** Math.min(this._retries++, 5));
      this.h.onStatus?.('reconnecting');
      clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => this._dial(), wait);
    };
    this.ws.onerror = () => { /* onclose follows and handles retry */ };
    this.ws.onmessage = (ev) => {
      if (ev.data === 'pong') return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this._handle(m);
    };
  }

  _handle(m) {
    if (m.t === 'welcome') {
      this.id = m.id;
      this.color = m.color;
      this.version = m.v;
      this.h.onStatus?.('online');
      this.h.onPeers?.(m.peers);
      if (m.doc) this.h.onSnapshot?.(m.doc);
    } else if (m.t === 'doc') {
      if (m.from !== this.id && m.v > this.version) {
        this.version = m.v;
        this.h.onDoc?.(m.doc);
      }
    } else if (m.t === 'ack') {
      this.version = Math.max(this.version, m.v);
    } else if (m.t === 'peers') {
      this.h.onPeers?.(m.peers);
    } else if (m.t === 'presence') {
      this.h.onPresence?.(m);
    } else if (m.t === 'asset') {
      let buf = this._incoming.get(m.name);
      if (!buf || buf.of !== m.of) {
        buf = { parts: new Array(m.of).fill(null), of: m.of };
        this._incoming.set(m.name, buf);
      }
      buf.parts[m.part] = m.data;
      if (buf.parts.every((p) => p !== null)) {
        this._incoming.delete(m.name);
        const url = buf.parts.join('');
        this._sentAssets.set(m.name, url); // don't echo it back
        this.h.onAsset?.(m.name, url);
      }
    } else if (m.t === 'assetDel') {
      this._sentAssets.delete(m.name);
      this.h.onAssetDel?.(m.name);
    } else if (m.t === 'error') {
      this.h.onError?.(m.message);
    }
  }

  disconnect(silent = false) {
    this._manualClose = true;
    clearTimeout(this._retryTimer);
    clearInterval(this._pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch { /* already gone */ }
    }
    this.ws = null;
    this.id = null;
    this._sentAssets.clear();
    this._incoming.clear();
    if (!silent) this.h.onStatus?.('offline');
  }

  _send(obj) {
    if (this.connected) this.ws.send(JSON.stringify(obj));
  }

  // Debounced doc sync. getDoc() must return the project WITHOUT assets
  // (assets: {}); asset changes go through syncAssets().
  sendDoc(getDoc) {
    if (!this.connected) return;
    clearTimeout(this._docTimer);
    this._docTimer = setTimeout(() => this._send({ t: 'doc', doc: getDoc() }), 250);
  }

  // Diff current assets against what this client last sent/received and push
  // only the changes, chunked.
  syncAssets(assets) {
    if (!this.connected) return;
    for (const [name, url] of Object.entries(assets)) {
      if (this._sentAssets.get(name) === url) continue;
      this._sentAssets.set(name, url);
      const of = Math.max(1, Math.ceil(url.length / CHUNK));
      for (let i = 0; i < of; i++) {
        this._send({ t: 'asset', name, part: i, of, data: url.slice(i * CHUNK, (i + 1) * CHUNK) });
      }
    }
    for (const name of [...this._sentAssets.keys()]) {
      if (!(name in assets)) {
        this._sentAssets.delete(name);
        this._send({ t: 'assetDel', name });
      }
    }
  }

  sendPresence(selName) {
    this._send({ t: 'presence', selName });
  }
}
