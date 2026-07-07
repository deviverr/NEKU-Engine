// Neku 3D physics server — rigid bodies via cannon-es (vendored).
// Loaded dynamically only when a scene has Mesh3D nodes with body3d set,
// so games without 3D physics never ship it.
//
// Mesh3D props: body3d: 'dynamic' | 'static', mass (default 1), friction,
// restitution (bounciness). Dynamic bodies drive the node's position and
// rotation; scripts read/write velocity via game.physics3d helpers.
// Script hook: function onCollide(other, side) — side is '3d'.

import * as CANNON from '../vendor/cannon.js';

const DEG = Math.PI / 180;

export class Physics3D {
  constructor(settings = {}) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, settings.gravity3d ?? -9.82, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.bodies = new Map(); // node.id -> { body, node, key }
    this._collisions = []; // [{a, b}] queued per step
  }

  _shape(n) {
    switch (n.shape) {
      case 'sphere':
        return new CANNON.Sphere(n.radius ?? 0.5);
      case 'cylinder':
      case 'cone':
        return new CANNON.Cylinder(n.radius ?? 0.5, n.shape === 'cone' ? 0.01 : n.radius ?? 0.5, n.h ?? 1, 12);
      case 'plane': {
        // finite ground slab (a true infinite plane surprises people)
        return new CANNON.Box(new CANNON.Vec3((n.w ?? 2) / 2, 0.05, (n.d ?? 2) / 2));
      }
      default:
        return new CANNON.Box(new CANNON.Vec3(((n.w ?? 1) * (n.sx ?? 1)) / 2, ((n.h ?? 1) * (n.sy ?? 1)) / 2, ((n.d ?? 1) * (n.sz ?? 1)) / 2));
    }
  }

  _key(n) {
    return [n.body3d, n.shape, n.w, n.h, n.d, n.radius, n.mass, n.friction, n.restitution, n.sx, n.sy, n.sz].join('|');
  }

  sync(root) {
    const seen = new Set();
    const walk = (n) => {
      if (n._dead) return;
      if (n.type === 'Mesh3D' && (n.body3d === 'dynamic' || n.body3d === 'static')) {
        seen.add(n.id);
        let entry = this.bodies.get(n.id);
        const key = this._key(n);
        if (!entry || entry.key !== key) {
          if (entry) this.world.removeBody(entry.body);
          const body = new CANNON.Body({
            mass: n.body3d === 'dynamic' ? (n.mass ?? 1) : 0,
            shape: this._shape(n),
            material: new CANNON.Material({ friction: n.friction ?? 0.3, restitution: n.restitution ?? 0.2 }),
            position: new CANNON.Vec3(n.x || 0, n.y || 0, n.z || 0),
          });
          body.quaternion.setFromEuler((n.rx || 0) * DEG, (n.ry || 0) * DEG, (n.rz || 0) * DEG);
          body.addEventListener('collide', (e) => this._collisions.push({ a: n, bBody: e.body }));
          this.world.addBody(body);
          entry = { body, node: n, key };
          this.bodies.set(n.id, entry);
        }
        // Static bodies follow the node (editor moves, moving platforms).
        if (n.body3d === 'static') {
          entry.body.position.set(n.x || 0, n.y || 0, n.z || 0);
          entry.body.quaternion.setFromEuler((n.rx || 0) * DEG, (n.ry || 0) * DEG, (n.rz || 0) * DEG);
        }
      }
      for (const c of n.children) walk(c);
    };
    walk(root);
    for (const [id, entry] of this.bodies) {
      if (!seen.has(id)) {
        this.world.removeBody(entry.body);
        this.bodies.delete(id);
      }
    }
  }

  step(root, dt, emit) {
    this.sync(root);
    this._collisions.length = 0;
    this.world.step(1 / 60, dt, 3);

    // Write dynamic body transforms back to the scene tree.
    for (const { body, node } of this.bodies.values()) {
      if (body.mass <= 0) continue;
      node.x = body.position.x;
      node.y = body.position.y;
      node.z = body.position.z;
      const e = new CANNON.Vec3();
      body.quaternion.toEuler(e);
      node.rx = e.x / DEG;
      node.ry = e.y / DEG;
      node.rz = e.z / DEG;
    }

    // Collision hooks (deduped per step).
    const fired = new Set();
    for (const { a, bBody } of this._collisions) {
      let bNode = null;
      for (const entry of this.bodies.values()) if (entry.body === bBody) bNode = entry.node;
      const pairKey = a.id + '|' + (bNode?.id || 'x');
      if (fired.has(pairKey)) continue;
      fired.add(pairKey);
      emit(a, bNode, '3d');
    }
  }

  // --- script helpers (exposed as game.physics3d) ---

  impulse(node, x, y, z) {
    const b = this.bodies.get(node.id)?.body;
    b?.applyImpulse(new CANNON.Vec3(x, y, z), b.position);
  }

  setVelocity(node, x, y, z) {
    const b = this.bodies.get(node.id)?.body;
    if (b) b.velocity.set(x, y, z);
  }

  velocity(node) {
    const v = this.bodies.get(node.id)?.body?.velocity;
    return v ? { x: v.x, y: v.y, z: v.z } : { x: 0, y: 0, z: 0 };
  }
}

export { CANNON };
