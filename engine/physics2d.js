// Neku 2D physics server — arcade physics: velocity, gravity, AABB collision.
// Not a rigid-body simulator; it's the classic platformer/arcade model:
// dynamic bodies move and collide against static bodies (axis-separated
// resolve) and overlap-test against each other (signals only).
//
// Node props: body: 'dynamic' | 'static' | 'area', vx, vy, gravityScale,
// bounce (0..1), colliderW/colliderH (default node bounds).
// Script hook: function onCollide(other, side) {}   side: 'top|bottom|left|right|overlap'

export class Physics2D {
  constructor(settings = {}) {
    this.gravity = settings.gravity ?? 900; // px/s²
  }

  _bounds(n, wp) {
    const w = n.colliderW ?? n.w ?? (n.radius ? n.radius * 2 : 32);
    const h = n.colliderH ?? n.h ?? (n.radius ? n.radius * 2 : 32);
    return { x: wp.x - w / 2, y: wp.y - h / 2, w, h };
  }

  // World position ignoring rotation (arcade model: physics bodies don't rotate).
  _worldPos(n) {
    let x = 0, y = 0;
    for (let p = n; p; p = p.parent) { x += p.x || 0; y += p.y || 0; }
    return { x, y };
  }

  step(root, dt, emit) {
    const dynamics = [], statics = [], areas = [];
    const walk = (n) => {
      if (n._dead || n.visible === false) return;
      if (n.body === 'dynamic') dynamics.push(n);
      else if (n.body === 'static') statics.push(n);
      else if (n.body === 'area') areas.push(n);
      if (n.type === 'Tilemap' && n.collision) statics.push(n); // handled specially
      for (const c of n.children) walk(c);
    };
    walk(root);

    // Substep so fast bodies can't tunnel through thin colliders: no body may
    // move more than MAX_MOVE px per substep (a breakout ball at 430 px/s on a
    // laggy 50 ms frame would otherwise skip clean through a 14 px paddle).
    const MAX_MOVE = 6;
    let fastest = 0;
    for (const n of dynamics) {
      const g = this.gravity * (n.gravityScale ?? 1) * dt;
      fastest = Math.max(fastest, Math.abs(n.vx || 0), Math.abs((n.vy || 0) + g));
    }
    const steps = Math.min(12, Math.max(1, Math.ceil((fastest * dt) / MAX_MOVE)));
    const h = dt / steps;

    for (let s = 0; s < steps; s++) {
      for (const n of dynamics) {
        if (n._dead) continue;
        n.vx = n.vx || 0;
        n.vy = (n.vy || 0) + this.gravity * (n.gravityScale ?? 1) * h;
        if (s === 0) n._grounded = false;

        // X axis
        n.x += n.vx * h;
        this._resolveAxis(n, statics, 'x', emit);
        // Y axis
        n.y += n.vy * h;
        this._resolveAxis(n, statics, 'y', emit);
      }
    }

    // Overlap events (areas + other dynamics), once per frame
    for (const n of dynamics) {
      if (n._dead) continue;
      const a = this._bounds(n, this._worldPos(n));
      for (const other of [...areas, ...dynamics]) {
        if (other === n || other._dead) continue;
        const b = this._bounds(other, this._worldPos(other));
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          emit(n, other, 'overlap');
        }
      }
    }
  }

  _tiles(map, region) {
    // Static AABBs from solid tilemap cells intersecting `region`.
    const wp = this._worldPos(map);
    const tw = map.tileW || 32, th = map.tileH || 32;
    const originX = wp.x - ((map.cols || 0) * tw) / 2;
    const originY = wp.y - ((map.rows || 0) * th) / 2;
    const boxes = [];
    const c0 = Math.max(0, Math.floor((region.x - originX) / tw) - 1);
    const c1 = Math.min((map.cols || 0) - 1, Math.floor((region.x + region.w - originX) / tw) + 1);
    const r0 = Math.max(0, Math.floor((region.y - originY) / th) - 1);
    const r1 = Math.min((map.rows || 0) - 1, Math.floor((region.y + region.h - originY) / th) + 1);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if ((map.tiles?.[r * map.cols + c] ?? -1) >= 0)
          boxes.push({ x: originX + c * tw, y: originY + r * th, w: tw, h: th, node: map });
    return boxes;
  }

  _resolveAxis(n, statics, axis, emit) {
    const wp = this._worldPos(n);
    const a = this._bounds(n, wp);
    let boxes = [];
    for (const s of statics) {
      if (s._dead) continue; // destroyed mid-frame (e.g. a breakout brick)
      if (s.type === 'Tilemap') boxes.push(...this._tiles(s, a));
      else {
        const b = this._bounds(s, this._worldPos(s));
        b.node = s;
        boxes.push(b);
      }
    }
    for (const b of boxes) {
      if (!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)) continue;
      if (axis === 'x') {
        const push = n.vx > 0 ? b.x - (a.x + a.w) : b.x + b.w - a.x;
        n.x += push;
        a.x += push;
        const side = n.vx > 0 ? 'right' : 'left';
        n.vx = -n.vx * (n.bounce ?? 0);
        // Bounce first, notify after: onCollide sees the post-bounce state and
        // anything it sets (e.g. a paddle angling the ball back) is final.
        emit(n, b.node, side);
      } else {
        const push = n.vy > 0 ? b.y - (a.y + a.h) : b.y + b.h - a.y;
        n.y += push;
        a.y += push;
        const side = n.vy > 0 ? 'bottom' : 'top';
        if (n.vy > 0) n._grounded = true;
        n.vy = -n.vy * (n.bounce ?? 0);
        // Rest-snap stops micro-bouncing on floors — but only for bodies that
        // gravity pulls; a zero-g bounce ball must keep its speed.
        if (Math.abs(n.vy) < 20 && (n.gravityScale ?? 1) !== 0) n.vy = 0;
        emit(n, b.node, side);
      }
    }
  }
}
