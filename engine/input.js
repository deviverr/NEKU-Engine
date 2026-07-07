// CCE input — pointer + keyboard, normalized to game canvas coordinates.

export class Input {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.pointer = { x: 0, y: 0, down: false };
    this.keys = new Set();
    this._justPressed = new Set();
    this._events = []; // drained by the game loop each frame
    this._listeners = [];

    const on = (target, type, fn) => {
      target.addEventListener(type, fn);
      this._listeners.push([target, type, fn]);
    };

    const toGame = (e) => {
      const r = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0] : e).clientX;
      const cy = (e.touches ? e.touches[0] : e).clientY;
      return {
        x: ((cx - r.left) / r.width) * this.width,
        y: ((cy - r.top) / r.height) * this.height,
      };
    };

    on(canvas, 'pointerdown', (e) => {
      const p = toGame(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.down = true;
      this._events.push({ type: 'pointerdown', x: p.x, y: p.y });
    });
    on(canvas, 'pointermove', (e) => {
      const p = toGame(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this._events.push({ type: 'pointermove', x: p.x, y: p.y });
    });
    on(window, 'pointerup', (e) => {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      const p = toGame(e);
      this._events.push({ type: 'pointerup', x: p.x, y: p.y });
    });
    on(window, 'keydown', (e) => {
      this.beforeKey?.(e); // game hook: e.g. preventDefault while a TextInput has focus
      if (!this.keys.has(e.key)) this._justPressed.add(e.key);
      this.keys.add(e.key);
      this._events.push({ type: 'keydown', key: e.key });
    });
    on(window, 'keyup', (e) => {
      this.keys.delete(e.key);
      this._events.push({ type: 'keyup', key: e.key });
    });
  }

  isDown(key) {
    return this.keys.has(key);
  }

  justPressed(key) {
    return this._justPressed.has(key);
  }

  drainEvents() {
    const ev = this._events;
    this._events = [];
    return ev;
  }

  endFrame() {
    this._justPressed.clear();
  }

  destroy() {
    for (const [t, type, fn] of this._listeners) t.removeEventListener(type, fn);
    this._listeners = [];
  }
}
