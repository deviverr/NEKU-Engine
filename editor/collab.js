// Neku Studio co-op client — Team Create over WebSocket.
// Protocol (JSON): hello → welcome{id,color,peers,doc,v} · doc{doc,v,from}
// · presence{id,name,color,selName} · peers{list} · ack{v}

export class CollabClient {
  constructor(handlers) {
    this.h = handlers; // { onSnapshot, onDoc, onPeers, onPresence, onStatus }
    this.ws = null;
    this.id = null;
    this.version = 0;
    this._docTimer = 0;
  }

  get connected() {
    return this.ws?.readyState === 1;
  }

  connect({ url, room, name }) {
    this.disconnect();
    this.h.onStatus?.('connecting');
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.h.onStatus?.('error: ' + e.message);
      return;
    }
    this.ws.onopen = () => this._send({ t: 'hello', room, name });
    this.ws.onclose = () => {
      this.h.onStatus?.('offline');
      this.h.onPeers?.([]);
    };
    this.ws.onerror = () => this.h.onStatus?.('error');
    this.ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
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
      }
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.id = null;
  }

  _send(obj) {
    if (this.connected) this.ws.send(JSON.stringify(obj));
  }

  // Debounced whole-document sync (simple + robust for small teams; last
  // write wins on true simultaneous edits of the same field).
  sendDoc(getDoc) {
    if (!this.connected) return;
    clearTimeout(this._docTimer);
    this._docTimer = setTimeout(() => this._send({ t: 'doc', doc: getDoc() }), 250);
  }

  sendPresence(selName) {
    this._send({ t: 'presence', selName });
  }
}
