// CCE core — scene tree, scripting, tweens, timers, game loop.
//
// A game is a JSON project: scenes (trees of nodes), scripts (JS source),
// assets (data-URL images), settings. Scripts attach to nodes and declare
// plain functions as lifecycle hooks:
//
//   function ready() {}          // node entered the running scene
//   function update(dt) {}       // every frame, dt in seconds
//   function onPress() {}        // this Button was clicked/tapped
//   function onInput(e) {}       // raw pointer/keyboard events
//   function onSignal(name, d) {}// game.emit(name, data) from any script
//
// Inside a script, `self` is the node and `game` is the Game instance.

import { Easing, clamp, lerp, rand, randInt, pick } from './math.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { render2D, hitTest } from './renderer2d.js';
import { Renderer3D } from './renderer3d.js';

export const NODE_TYPES = {
  // 2D
  Node: { x: 0, y: 0 },
  Rect: { x: 0, y: 0, w: 100, h: 100, color: '#4a90d9', radius: 0, rotation: 0, opacity: 1 },
  Circle: { x: 0, y: 0, radius: 40, color: '#e2b714', opacity: 1 },
  Label: { x: 0, y: 0, text: 'Label', size: 24, color: '#ffffff', align: 'center', bold: false, opacity: 1 },
  Sprite: { x: 0, y: 0, asset: '', w: 0, h: 0, rotation: 0, opacity: 1 },
  Button: { x: 0, y: 0, w: 120, h: 48, text: 'Button', color: '#2d6a4f', textColor: '#ffffff', textSize: 20, radius: 10, opacity: 1 },
  Particles: { x: 0, y: 0, color: '#ffd700', gravity: 600, opacity: 1 },
  // 3D (is3D flag set in hydrate)
  Camera3D: { x: 0, y: 2, z: 6, tx: 0, ty: 0, tz: 0, fov: 55 },
  Light3D: { dx: 0.5, dy: 1, dz: 0.8, ambient: 0.35 },
  Mesh3D: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, shape: 'box', w: 1, h: 1, d: 1, radius: 0.5, color: '#e0b040' },
};

const IS_3D = new Set(['Camera3D', 'Light3D', 'Mesh3D']);

let nextId = 1;

export class GameNode {
  constructor(type, props = {}) {
    this.id = 'n' + nextId++;
    this.type = type;
    this.name = props.name || type;
    this.is3D = IS_3D.has(type);
    this.children = [];
    this.parent = null;
    this.script = props.script || null; // script file name
    this.visible = true;
    Object.assign(this, NODE_TYPES[type] || {}, props);
    if (type === 'Particles') this._particles = [];
  }

  addChild(node) {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  // Depth-first search by node name.
  find(name) {
    for (const c of this.children) {
      if (c.name === name) return c;
      const hit = c.find(name);
      if (hit) return hit;
    }
    return null;
  }

  destroy() {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
    this._dead = true;
  }

  // Particle burst (Particles nodes only).
  burst(count = 20, opts = {}) {
    if (!this._particles) return;
    const colors = opts.colors || [this.color || '#ffd700'];
    for (let i = 0; i < count; i++) {
      const a = opts.angle != null ? opts.angle + rand(-opts.spread ?? 0.5, opts.spread ?? 0.5) : rand(0, Math.PI * 2);
      const sp = rand(opts.minSpeed ?? 120, opts.maxSpeed ?? 420);
      this._particles.push({
        x: 0, y: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up ?? 200),
        size: rand(opts.minSize ?? 3, opts.maxSize ?? 7),
        color: pick(colors),
        life: rand(0.5, opts.life ?? 1.2),
        maxLife: opts.life ?? 1.2,
      });
    }
  }
}

// JSON node → GameNode tree.
export function hydrate(def) {
  const { children = [], type = 'Node', ...props } = def;
  const node = new GameNode(type, props);
  for (const c of children) node.addChild(hydrate(c));
  return node;
}

// GameNode tree → JSON (used by the editor to save).
export function serialize(node) {
  const out = { type: node.type, name: node.name };
  const defaults = NODE_TYPES[node.type] || {};
  for (const key of Object.keys(node)) {
    if (key.startsWith('_') || ['id', 'type', 'name', 'is3D', 'children', 'parent', 'script', 'visible'].includes(key)) continue;
    if (typeof node[key] === 'function') continue;
    if (node[key] !== defaults[key]) out[key] = node[key];
  }
  if (node.script) out.script = node.script;
  if (node.visible === false) out.visible = false;
  if (node.children.length) out.children = node.children.map(serialize);
  return out;
}

function compileScript(name, src) {
  const body = `"use strict";
${src}
;return {
  ready: typeof ready === 'function' ? ready : null,
  update: typeof update === 'function' ? update : null,
  onPress: typeof onPress === 'function' ? onPress : null,
  onInput: typeof onInput === 'function' ? onInput : null,
  onSignal: typeof onSignal === 'function' ? onSignal : null,
};`;
  try {
    return new Function('self', 'game', body);
  } catch (e) {
    console.error(`[cce] script "${name}" failed to compile: ${e.message}`);
    return null;
  }
}

export class Game {
  constructor(project, container) {
    this.project = project;
    this.container = container;
    const s = project.settings || {};
    this.width = s.width || 480;
    this.height = s.height || 720;
    this.background = s.background || '#111';
    this.time = 0;
    this.audio = new AudioEngine();
    this._tweens = [];
    this._timers = [];
    this._signals = new Map();
    this._running = false;

    // Stacked canvases: WebGL below, Canvas2D above (2D UI over 3D world).
    container.innerHTML = '';
    container.style.position = 'relative';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = this.width * dpr;
      c.height = this.height * dpr;
      Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      container.appendChild(c);
      return c;
    };
    this.glCanvas = mk();
    this.canvas2d = mk();
    this.dpr = dpr;
    this.ctx = this.canvas2d.getContext('2d');
    this.gl3d = new Renderer3D(this.glCanvas);
    // The scene background lives on the container so the transparent 2D
    // canvas never hides the 3D layer underneath it.
    container.style.background = this.background;
    this.input = new Input(this.canvas2d, this.width, this.height);

    // Decode data-URL image assets.
    this.assets = { images: {} };
    for (const [name, url] of Object.entries(project.assets || {})) {
      const img = new Image();
      img.src = url;
      this.assets.images[name] = img;
    }

    this._compiledScripts = {};
    for (const [name, src] of Object.entries(project.scripts || {})) {
      this._compiledScripts[name] = compileScript(name, src);
    }

    this.gotoScene(project.mainScene || project.scenes?.[0]?.name);
  }

  gotoScene(name) {
    const def = (this.project.scenes || []).find((sc) => sc.name === name);
    if (!def) {
      console.error(`[cce] scene not found: "${name}"`);
      return;
    }
    this.sceneName = name;
    this.root = hydrate(def.root);
    this._tweens = [];
    this._timers = [];
    this._pendingReady = [];
    this._bindScripts(this.root);
    for (const fn of this._pendingReady) this._safely(fn);
    this._pendingReady = null;
  }

  _bindScripts(node) {
    if (node.script && this._compiledScripts[node.script]) {
      try {
        node._hooks = this._compiledScripts[node.script](node, this);
      } catch (e) {
        console.error(`[cce] script "${node.script}" threw during setup: ${e.message}`);
        node._hooks = null;
      }
      if (node._hooks?.ready) {
        const fn = () => node._hooks.ready();
        if (this._pendingReady) this._pendingReady.push(fn);
        else this._safely(fn);
      }
    }
    for (const c of node.children) this._bindScripts(c);
  }

  _safely(fn) {
    try {
      fn();
    } catch (e) {
      console.error('[cce] script error: ' + (e.stack || e.message));
    }
  }

  // --- Script-facing API ---

  find(name) {
    return this.root.name === name ? this.root : this.root.find(name);
  }

  spawn(parent, type, props = {}) {
    const p = typeof parent === 'string' ? this.find(parent) : parent || this.root;
    const node = new GameNode(type, props);
    p.addChild(node);
    if (props.script) {
      this._pendingReady = null;
      this._bindScripts(node);
    }
    return node;
  }

  tween(target, to, { duration = 0.4, easing = 'quadOut', delay = 0, onDone = null } = {}) {
    const tw = { target, to, from: {}, t: -delay, duration, ease: Easing[easing] || Easing.quadOut, onDone, done: false };
    for (const k of Object.keys(to)) tw.from[k] = target[k] ?? 0;
    this._tweens.push(tw);
    return tw;
  }

  after(seconds, fn) {
    const t = { at: this.time + seconds, fn, repeat: 0 };
    this._timers.push(t);
    return () => (t.dead = true);
  }

  every(seconds, fn) {
    const t = { at: this.time + seconds, fn, repeat: seconds };
    this._timers.push(t);
    return () => (t.dead = true);
  }

  emit(name, data) {
    const walk = (n) => {
      if (n._hooks?.onSignal) this._safely(() => n._hooks.onSignal(name, data));
      for (const c of n.children) walk(c);
    };
    walk(this.root);
    for (const fn of this._signals.get(name) || []) this._safely(() => fn(data));
  }

  on(name, fn) {
    if (!this._signals.has(name)) this._signals.set(name, []);
    this._signals.get(name).push(fn);
  }

  // Handy re-exports so scripts don't need imports.
  rand = rand;
  randInt = randInt;
  pick = pick;
  clamp = clamp;
  lerp = lerp;

  // --- Loop ---

  start() {
    this._running = true;
    let last = performance.now();
    const frame = (now) => {
      if (!this._running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.time += dt;
      this._update(dt);
      this._render();
      this.input.endFrame();
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    this.input.destroy();
  }

  _update(dt) {
    // Input events: button hit-testing + raw event hooks.
    for (const e of this.input.drainEvents()) {
      if (e.type === 'pointerdown' || e.type === 'pointermove' || e.type === 'pointerup') {
        this._pointer(e);
      }
      const walk = (n) => {
        if (n._hooks?.onInput) this._safely(() => n._hooks.onInput(e));
        for (const c of n.children) walk(c);
      };
      walk(this.root);
    }

    // Timers.
    for (const t of this._timers) {
      if (t.dead) continue;
      if (this.time >= t.at) {
        this._safely(t.fn);
        if (t.repeat) t.at += t.repeat;
        else t.dead = true;
      }
    }
    this._timers = this._timers.filter((t) => !t.dead);

    // Tweens.
    for (const tw of this._tweens) {
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = tw.duration <= 0 ? 1 : Math.min(tw.t / tw.duration, 1);
      const e = tw.ease(k);
      for (const key of Object.keys(tw.to)) tw.target[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) {
        tw.done = true;
        if (tw.onDone) this._safely(tw.onDone);
      }
    }
    this._tweens = this._tweens.filter((t) => !t.done);

    // Scripts + particles.
    const walk = (n) => {
      if (n._dead) return;
      if (n._hooks?.update) this._safely(() => n._hooks.update(dt));
      if (n._particles) {
        for (const p of n._particles) {
          p.life -= dt;
          p.vy += (n.gravity ?? 600) * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        n._particles = n._particles.filter((p) => p.life > 0);
      }
      for (const c of [...n.children]) walk(c);
    };
    walk(this.root);
  }

  _pointer(e) {
    // Find topmost interactive Button under the pointer.
    let target = null;
    const walk = (n) => {
      if (n.visible === false) return;
      if (n.type === 'Button' && (n.opacity ?? 1) > 0 && hitTest(n, e.x, e.y)) target = n; // later in tree = on top
      for (const c of n.children) walk(c);
    };
    walk(this.root);

    const clearHover = (n) => {
      if (n.type === 'Button') n._hover = false;
      for (const c of n.children) clearHover(c);
    };

    if (e.type === 'pointermove') {
      clearHover(this.root);
      if (target) target._hover = true;
    } else if (e.type === 'pointerdown') {
      if (target) {
        target._pressed = true;
        this._pressTarget = target;
      }
    } else if (e.type === 'pointerup') {
      const pt = this._pressTarget;
      if (pt) {
        pt._pressed = false;
        if (pt === target) {
          this.audio.play(pt.sound || 'click');
          if (pt._hooks?.onPress) this._safely(() => pt._hooks.onPress());
          this.emit('button', pt.name);
        }
      }
      this._pressTarget = null;
    }
  }

  _render() {
    if (this.gl3d?.gl) this.gl3d.render(this.root, this.width, this.height);
    render2D(this.ctx, this.root, this.assets, this.width, this.height, null, this.dpr);
  }
}

// Boot a project inside a DOM element. Returns the Game (call .stop() to kill).
export function startGame(project, container) {
  const game = new Game(project, container);
  game.start();
  return game;
}
