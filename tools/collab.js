#!/usr/bin/env node
// Neku co-op server — Team Create for Neku Studio.
// Zero dependencies: WebSocket (RFC 6455) implemented by hand on node:http.
//
//   npm run coop            # listens on ws://localhost:8348
//   node tools/collab.js --port 9000
//
// Rooms hold the latest project doc; everyone in a room edits it live.
// Protocol: see editor/collab.js.

import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8348;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const COLORS = ['#29e6c4', '#ff5c9e', '#ffcb47', '#4ade80', '#5fa8e0', '#c084fc', '#fb923c', '#f87171'];

const rooms = new Map(); // name -> { clients: Map<id, client>, doc, v }

function room(name) {
  if (!rooms.has(name)) rooms.set(name, { clients: new Map(), doc: null, v: 0 });
  return rooms.get(name);
}

// --- WebSocket framing ---------------------------------------------------

function encodeFrame(payload) {
  const data = Buffer.from(payload, 'utf8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

// Pull complete frames out of a growing buffer; returns [messages, rest].
function decodeFrames(buf, sock) {
  const messages = [];
  while (buf.length >= 2) {
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      len = Number(buf.readBigUInt64BE(2));
      off = 10;
    }
    const maskOff = off;
    if (masked) off += 4;
    if (buf.length < off + len) break;
    let payload = buf.subarray(off, off + len);
    if (masked) {
      const mask = buf.subarray(maskOff, maskOff + 4);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    if (opcode === 0x1) messages.push(payload.toString('utf8'));
    else if (opcode === 0x8) { sock.end(); return [messages, Buffer.alloc(0)]; }
    else if (opcode === 0x9) sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); // ping → pong
    buf = buf.subarray(off + len);
  }
  return [messages, buf];
}

// --- Server ----------------------------------------------------------------

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Neku co-op server. Connect from Neku Studio with the Co-op button.\n');
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return sock.end();
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const client = { id: randomUUID().slice(0, 8), sock, room: null, name: 'anon', color: COLORS[0], selName: null };
  let buf = Buffer.alloc(0);

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let messages;
    [messages, buf] = decodeFrames(buf, sock);
    for (const raw of messages) {
      let m;
      try { m = JSON.parse(raw); } catch { continue; }
      handle(client, m);
    }
  });
  sock.on('close', () => leave(client));
  sock.on('error', () => leave(client));
});

function send(client, obj) {
  try { client.sock.write(encodeFrame(JSON.stringify(obj))); } catch { /* gone */ }
}

function broadcast(r, obj, exceptId = null) {
  for (const c of r.clients.values()) if (c.id !== exceptId) send(c, obj);
}

function peerList(r) {
  return [...r.clients.values()].map((c) => ({ id: c.id, name: c.name, color: c.color, selName: c.selName }));
}

function handle(client, m) {
  if (m.t === 'hello') {
    const r = room(String(m.room || 'default'));
    client.room = r;
    client.name = String(m.name || 'anon').slice(0, 24);
    client.color = COLORS[r.clients.size % COLORS.length];
    r.clients.set(client.id, client);
    send(client, { t: 'welcome', id: client.id, color: client.color, peers: peerList(r), doc: r.doc, v: r.v });
    broadcast(r, { t: 'peers', peers: peerList(r) }, client.id);
    log(`${client.name} joined "${[...rooms.entries()].find(([, v]) => v === r)?.[0]}" (${r.clients.size} online)`);
    return;
  }
  const r = client.room;
  if (!r) return;
  if (m.t === 'doc') {
    r.doc = m.doc;
    r.v += 1;
    send(client, { t: 'ack', v: r.v });
    broadcast(r, { t: 'doc', doc: r.doc, v: r.v, from: client.id }, client.id);
  } else if (m.t === 'presence') {
    client.selName = m.selName || null;
    broadcast(r, { t: 'presence', id: client.id, name: client.name, color: client.color, selName: client.selName }, client.id);
  }
}

function leave(client) {
  const r = client.room;
  if (!r) return;
  r.clients.delete(client.id);
  broadcast(r, { t: 'peers', peers: peerList(r) });
  log(`${client.name} left (${r.clients.size} online)`);
}

const log = (msg) => console.log(`[neku coop] ${msg}`);

server.listen(port, () => {
  log(`listening on ws://localhost:${port}`);
  log('teammates on your network can use ws://YOUR-LAN-IP:' + port);
});
