// Neku Studio — 2D scene viewport: pan/zoom, pick, drag-move, tilemap
// painting, live peer selection outlines.

import { drawNode } from '../engine/renderer2d.js';

export class Viewport2D {
  constructor(container, ed) {
    this.ed = ed; // editor context: project, scene(), sel, select(), markDirty(), peers, paint
    this.cam = { x: 40, y: 40, zoom: 1 };
    container.innerHTML = '';
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    for (const c of [this.canvas, this.overlay]) {
      Object.assign(c.style, { position: 'absolute', inset: '0' });
      container.appendChild(c);
    }
    this.ctx = this.canvas.getContext('2d');
    this.octx = this.overlay.getContext('2d');
    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
    this._bindInput();
  }

  _resize() {
    const r = this.container.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.max(1, r.width * dpr);
      c.height = Math.max(1, r.height * dpr);
      c.style.width = r.width + 'px';
      c.style.height = r.height + 'px';
    }
  }

  toGame(e) {
    const r = this.container.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.cam.x) / this.cam.zoom,
      y: (e.clientY - r.top - this.cam.y) / this.cam.zoom,
    };
  }

  worldPos(node) {
    let x = 0, y = 0, sx = 1, sy = 1;
    const chain = [];
    for (let n = node; n; n = n.parent) chain.push(n);
    for (let i = chain.length - 1; i >= 0; i--) {
      const n = chain[i];
      x += (n.x || 0) * sx;
      y += (n.y || 0) * sy;
      sx *= n.scaleX ?? 1;
      sy *= n.scaleY ?? 1;
    }
    return { x, y, sx, sy };
  }

  bounds(n) {
    switch (n.type) {
      case 'Rect': case 'Button': case 'Sprite':
        return { w: n.w || 40, h: n.h || 40 };
      case 'Circle':
        return { w: n.radius * 2, h: n.radius * 2 };
      case 'Tilemap':
        return { w: (n.cols || 1) * (n.tileW || 32), h: (n.rows || 1) * (n.tileH || 32) };
      case 'Label': {
        this.ctx.font = `${n.bold ? 'bold ' : ''}${n.size || 16}px ${n.font || 'system-ui'}`;
        return { w: Math.max(20, this.ctx.measureText(n.text ?? '').width), h: (n.size || 16) * 1.3 };
      }
      default:
        return { w: 30, h: 30 };
    }
  }

  pick(gx, gy) {
    let hit = null;
    const walk = (n) => {
      if (n.visible === false) return;
      if (!n.is3D && n.parent) {
        const wp = this.worldPos(n);
        const b = this.bounds(n);
        if (Math.abs(gx - wp.x) <= (b.w / 2) * Math.abs(wp.sx) + 2 && Math.abs(gy - wp.y) <= (b.h / 2) * Math.abs(wp.sy) + 2) hit = n;
      }
      for (const c of n.children) walk(c);
    };
    walk(this.ed.scene().root);
    return hit;
  }

  _paintTile(g) {
    const map = this.ed.sel;
    if (!map || map.type !== 'Tilemap') return false;
    const wp = this.worldPos(map);
    const tw = map.tileW || 32, th = map.tileH || 32;
    const c = Math.floor((g.x - (wp.x - (map.cols * tw) / 2)) / tw);
    const r = Math.floor((g.y - (wp.y - (map.rows * th) / 2)) / th);
    if (c < 0 || c >= map.cols || r < 0 || r >= map.rows) return false;
    if (!Array.isArray(map.tiles)) map.tiles = [];
    map.tiles[r * map.cols + c] = this.ed.paint.tile;
    return true;
  }

  _bindInput() {
    const ov = this.overlay;
    ov.style.pointerEvents = 'auto';
    let drag = null;

    ov.addEventListener('pointerdown', (e) => {
      ov.setPointerCapture(e.pointerId);
      const g = this.toGame(e);
      if (this.ed.paint.active && this.ed.sel?.type === 'Tilemap') {
        if (e.button === 2 || e.shiftKey) this.ed.paint.tile = -1;
        this._paintTile(g);
        drag = { paint: true };
        return;
      }
      const hit = this.pick(g.x, g.y);
      if (hit) {
        this.ed.select(hit);
        drag = { node: hit, startX: hit.x || 0, startY: hit.y || 0, gx: g.x, gy: g.y, moved: false };
      } else {
        this.ed.select(null);
        drag = { pan: true, sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y };
      }
    });

    ov.addEventListener('contextmenu', (e) => e.preventDefault());

    ov.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.paint) {
        this._paintTile(this.toGame(e));
      } else if (drag.pan) {
        this.cam.x = drag.cx + (e.clientX - drag.sx);
        this.cam.y = drag.cy + (e.clientY - drag.sy);
      } else {
        const g = this.toGame(e);
        const wp = drag.node.parent ? this.worldPos(drag.node.parent) : { sx: 1, sy: 1 };
        let nx = drag.startX + (g.x - drag.gx) / (wp.sx || 1);
        let ny = drag.startY + (g.y - drag.gy) / (wp.sy || 1);
        if (e.shiftKey) { nx = Math.round(nx / 10) * 10; ny = Math.round(ny / 10) * 10; }
        drag.node.x = Math.round(nx);
        drag.node.y = Math.round(ny);
        drag.moved = true;
        this.ed.refreshInspector();
      }
    });

    ov.addEventListener('pointerup', () => {
      if (drag && (drag.paint || (!drag.pan && drag.moved))) this.ed.markDirty();
      drag = null;
    });

    ov.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.container.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const z0 = this.cam.zoom;
      this.cam.zoom = Math.min(6, Math.max(0.1, this.cam.zoom * Math.exp(-e.deltaY * 0.0012)));
      this.cam.x = mx - ((mx - this.cam.x) / z0) * this.cam.zoom;
      this.cam.y = my - ((my - this.cam.y) / z0) * this.cam.zoom;
    }, { passive: false });
  }

  render() {
    const ed = this.ed;
    if (!ed.project) return;
    const dpr = this.dpr, cam = this.cam;
    const { width: W, height: H, background } = ed.project.settings;
    const root = ed.scene().root;
    const ctx = this.ctx, octx = this.octx;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
    if (ed.project.settings.pixelated) ctx.imageSmoothingEnabled = false;
    drawNode(ctx, root, ed.assets, 1);

    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    octx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
    const style = getComputedStyle(document.body);
    const accent = style.getPropertyValue('--accent').trim() || '#29e6c4';
    const line = 'rgba(128,128,160,0.12)';
    octx.strokeStyle = line;
    octx.lineWidth = 1 / cam.zoom;
    for (let x = 0; x <= W; x += 40) this._line(octx, x, 0, x, H);
    for (let y = 0; y <= H; y += 40) this._line(octx, 0, y, W, y);
    octx.strokeStyle = accent;
    octx.lineWidth = 2 / cam.zoom;
    octx.strokeRect(0, 0, W, H);
    octx.fillStyle = accent;
    octx.font = `${11 / cam.zoom}px var(--mono), monospace`;
    octx.fillText(`${W}×${H}`, 4 / cam.zoom, -6 / cam.zoom);

    // Peer selections (co-op).
    for (const peer of ed.peers.values()) {
      const node = peer.selName && this._findByName(root, peer.selName);
      if (!node || node.is3D) continue;
      this._outline(octx, node, peer.color, cam.zoom, peer.name);
    }
    // Local selection.
    if (ed.sel && !ed.sel._dead && !ed.sel.is3D && ed.sel.parent) {
      this._outline(octx, ed.sel, '#5fa8e0', cam.zoom, null);
    }
    // Tilemap paint cursor grid.
    if (ed.paint.active && ed.sel?.type === 'Tilemap') {
      const map = ed.sel;
      const wp = this.worldPos(map);
      const tw = map.tileW || 32, th = map.tileH || 32;
      octx.strokeStyle = accent;
      octx.lineWidth = 1 / cam.zoom;
      octx.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
      for (let c = 0; c <= map.cols; c++)
        this._line(octx, wp.x - (map.cols * tw) / 2 + c * tw, wp.y - (map.rows * th) / 2, wp.x - (map.cols * tw) / 2 + c * tw, wp.y + (map.rows * th) / 2);
      for (let r = 0; r <= map.rows; r++)
        this._line(octx, wp.x - (map.cols * tw) / 2, wp.y - (map.rows * th) / 2 + r * th, wp.x + (map.cols * tw) / 2, wp.y - (map.rows * th) / 2 + r * th);
      octx.setLineDash([]);
    }
  }

  _findByName(root, name) {
    return root.name === name ? root : root.find(name);
  }

  _outline(octx, node, color, zoom, label) {
    const wp = this.worldPos(node);
    const b = this.bounds(node);
    octx.strokeStyle = color;
    octx.lineWidth = 2 / zoom;
    octx.strokeRect(wp.x - (b.w / 2) * wp.sx, wp.y - (b.h / 2) * wp.sy, b.w * wp.sx, b.h * wp.sy);
    octx.fillStyle = color;
    octx.font = `${10 / zoom}px monospace`;
    octx.fillText(label || node.name, wp.x - (b.w / 2) * wp.sx, wp.y - (b.h / 2) * wp.sy - 5 / zoom);
  }

  _line(c, x1, y1, x2, y2) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
}
