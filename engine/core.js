// Neku core — scene tree, scripting, tweens, timers, physics, animation, FX.
//
// A game is a JSON project: scenes (trees of nodes), scripts (JS source),
// assets (data-URL images/models/audio), settings. Scripts attach to nodes
// and declare plain functions as lifecycle hooks:
//
//   function ready() {}              // node entered the running scene
//   function update(dt) {}           // every frame, dt in seconds
//   function onPress() {}            // this Button (2D) or Mesh3D was clicked
//   function onInput(e) {}           // raw pointer/keyboard events
//   function onSignal(name, d) {}    // game.emit(name, data) from any script
//   function onCollide(other, side) {} // physics contact (dynamic bodies)
//
// Inside a script, `self` is the node and `game` is the Game instance.
// 3D rendering (Three.js) loads dynamically only when a scene uses 3D nodes,
// so 2D-only games stay tiny.

import { Easing, clamp, lerp, rand, randInt, pick } from './math.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { render2D, hitTest } from './renderer2d.js';
import { Physics2D } from './physics2d.js';
import { ScreenFX } from './fx.js';

export const NODE_TYPES = {
  // --- 2D ---
  Node: { x: 0, y: 0 },
  Rect: { x: 0, y: 0, w: 100, h: 100, color: '#4a90d9', radius: 0, rotation: 0, opacity: 1 },
  Circle: { x: 0, y: 0, radius: 40, color: '#e2b714', opacity: 1 },
  Label: { x: 0, y: 0, text: 'Label', size: 24, color: '#ffffff', align: 'center', bold: false, opacity: 1 },
  Sprite: { x: 0, y: 0, asset: '', w: 0, h: 0, rotation: 0, opacity: 1, sheetCols: 1, sheetRows: 1, frame: 0, fps: 8, playing: false },
  Button: { x: 0, y: 0, w: 120, h: 48, text: 'Button', color: '#2d6a4f', textColor: '#ffffff', textSize: 20, radius: 10, opacity: 1 },
  Particles: { x: 0, y: 0, color: '#ffd700', gravity: 600, opacity: 1 },
  Tilemap: { x: 0, y: 0, tileset: '', tileW: 32, tileH: 32, cols: 10, rows: 8, tiles: [], collision: false, opacity: 1 },
  TextInput: {
    x: 0, y: 0, w: 220, h: 42, text: '', placeholder: 'type here…', size: 18,
    color: '#ffffff', bg: '#10231a', border: '#29e6c4', radius: 6, maxLength: 64, opacity: 1,
  },
  // --- 3D ---
  Node3D: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
  Camera3D: { x: 0, y: 2, z: 6, tx: 0, ty: 0, tz: 0, fov: 55, near: 0.1, far: 500 },
  Light3D: { x: 2, y: 4, z: 3, kind: 'directional', color: '#ffffff', intensity: 1, tx: 0, ty: 0, tz: 0 },
  Mesh3D: {
    x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1,
    shape: 'box', w: 1, h: 1, d: 1, radius: 0.5, model: '',
    color: '#cccccc', texture: '', metalness: 0.1, roughness: 0.75,
    emissive: '', emissiveIntensity: 1, opacity: 1, unlit: false, wireframe: false,
  },
  Screen3D: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, w: 2, h: 1.5, glow: 0.9 },
};

const IS_3D = new Set(['Node3D', 'Camera3D', 'Light3D', 'Mesh3D', 'Screen3D']);

let nextId = 1;

export class GameNode {
  constructor(type, props = {}) {
    this.id = 'n' + nextId++;
    this.type = type;
    this.name = props.name || type;
    this.is3D = IS_3D.has(type);
    this.children = [];
    this.parent = null;
    this.script = props.script || null;
    this.visible = true;
    Object.assign(this, NODE_TYPES[type] || {}, props);
    if (type === 'Particles') this._particles = [];
  }

  addChild(node) {
    node.parent = this;
    this.children.push(node);
    return node;
  }

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

  burst(count = 20, opts = {}) {
    if (!this._particles) return;
    const colors = opts.colors || [this.color || '#ffd700'];
    for (let i = 0; i < count; i++) {
      const a = opts.angle != null ? opts.angle + rand(-(opts.spread ?? 0.5), opts.spread ?? 0.5) : rand(0, Math.PI * 2);
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

export function hydrate(def) {
  const { children = [], type = 'Node', ...props } = def;
  const node = new GameNode(type, props);
  for (const c of children) node.addChild(hydrate(c));
  return node;
}

export function serialize(node) {
  const out = { type: node.type, name: node.name };
  const defaults = NODE_TYPES[node.type] || {};
  for (const key of Object.keys(node)) {
    if (key.startsWith('_') || ['id', 'type', 'name', 'is3D', 'children', 'parent', 'script', 'visible'].includes(key)) continue;
    if (typeof node[key] === 'function') continue;
    const v = node[key];
    if (Array.isArray(v) ? JSON.stringify(v) !== JSON.stringify(defaults[key]) : v !== defaults[key]) out[key] = v;
  }
  if (node.script) out.script = node.script;
  if (node.visible === false) out.visible = false;
  if (node.children.length) out.children = node.children.map(serialize);
  return out;
}

export function treeHas3D(node) {
  if (node.is3D || IS_3D.has(node.type)) return true;
  return (node.children || []).some(treeHas3D);
}

// Evaluate an animation clip at time t, writing values onto nodes.
// def: { duration, loop, tracks: [{ node, prop, keys: [{ t, v, ease }] }] }
// findNode: name -> node (or null). Shared by the runtime and the editor.
export function sampleAnim(def, t, findNode) {
  for (const track of def.tracks || []) {
    const node = findNode(track.node);
    const keys = track.keys;
    if (!node || !keys?.length) continue;
    let value;
    if (t <= keys[0].t) value = keys[0].v;
    else if (t >= keys[keys.length - 1].t) value = keys[keys.length - 1].v;
    else {
      let i = 0;
      while (i < keys.length - 1 && keys[i + 1].t < t) i++;
      const a = keys[i], b = keys[i + 1];
      const span = b.t - a.t || 1e-6;
      const k = (Easing[b.ease] || Easing.linear)((t - a.t) / span);
      value = a.v + (b.v - a.v) * k;
    }
    node[track.prop] = value;
  }
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
  onCollide: typeof onCollide === 'function' ? onCollide : null,
  onChange: typeof onChange === 'function' ? onChange : null,
  onSubmit: typeof onSubmit === 'function' ? onSubmit : null,
};`;
  try {
    return new Function('self', 'game', body);
  } catch (e) {
    console.error(`[neku] script "${name}" failed to compile: ${e.message}`);
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
    this.pixelated = !!s.pixelated;
    this.uiMode = s.uiMode || 'overlay'; // 'overlay' | 'screen3d'
    this.fx = s.fx || null;
    this.time = 0;
    this.audio = new AudioEngine();
    this.physics = new Physics2D(s.physics || {});
    this.anims = project.anims || {};
    this._activeAnims = [];
    this._tweens = [];
    this._timers = [];
    this._signals = new Map();
    this._running = false;
    this._focusInput = null; // focused TextInput node
    this.gl3d = null; // set async when the scene uses 3D

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.background = this.background;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const mk = (backing = true) => {
      const c = document.createElement('canvas');
      if (backing) { c.width = this.width * dpr; c.height = this.height * dpr; }
      Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      if (this.pixelated) c.style.imageRendering = 'pixelated';
      container.appendChild(c);
      return c;
    };
    this.glCanvas = mk(false); // Three.js manages its own backing size
    this.canvas2d = mk();
    this.ctx = this.canvas2d.getContext('2d');
    if (this.pixelated) this.ctx.imageSmoothingEnabled = false;
    if (this.fx?.crt) {
      this.fxCanvas = mk();
      this.screenFx = new ScreenFX(this.fxCanvas);
      this.glCanvas.style.visibility = 'hidden';
      this.canvas2d.style.visibility = 'hidden';
    }
    if (this.uiMode === 'screen3d') this.canvas2d.style.visibility = 'hidden';
    this._blank = document.createElement('canvas');
    this._blank.width = this._blank.height = 1;

    // Input listens on the topmost visible canvas.
    this.inputSurface = this.fxCanvas || this.canvas2d;
    this.input = new Input(this.inputSurface, this.width, this.height);
    this.input.beforeKey = (e) => {
      if (this._focusInput && ['Backspace', ' ', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
    };

    // Assets: data URLs. Images get an <img> for the 2D renderer; every
    // asset keeps its URL for Three loaders (textures, GLTF) and audio.
    this.assets = { images: {}, urls: {} };
    for (const [name, url] of Object.entries(project.assets || {})) {
      this.assets.urls[name] = url;
      if (url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
        const img = new Image();
        img.src = url;
        this.assets.images[name] = img;
      }
    }

    this._compiledScripts = {};
    for (const [name, src] of Object.entries(project.scripts || {})) {
      this._compiledScripts[name] = compileScript(name, src);
    }

    this.gotoScene(project.mainScene || project.scenes?.[0]?.name);
  }

  async _ensure3D() {
    if (this.gl3d || this._loading3d) return;
    this._loading3d = true;
    try {
      const { Render3D, THREE } = await import('./render3d.js');
      this.gl3d = new Render3D(this.glCanvas, { pixelated: this.pixelated });
      this.THREE = THREE; // escape hatch for advanced scripts
    } catch (e) {
      console.error('[neku] 3D failed to load: ' + e.message);
    }
  }

  gotoScene(name) {
    const def = (this.project.scenes || []).find((sc) => sc.name === name);
    if (!def) {
      console.error(`[neku] scene not found: "${name}"`);
      return;
    }
    this.sceneName = name;
    this.root = hydrate(def.root);
    if (treeHas3D(this.root)) this._ensure3D();
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
        console.error(`[neku] script "${node.script}" threw during setup: ${e.message}`);
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
      console.error('[neku] script error: ' + (e.stack || e.message));
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
    if (node.is3D) this._ensure3D();
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

  // Keyframe animation clips (authored in the Studio's Timeline panel).
  playAnim(name, { loop = null, onDone = null } = {}) {
    const def = this.anims[name];
    if (!def) {
      console.warn(`[neku] unknown animation: "${name}"`);
      return;
    }
    this.stopAnim(name);
    this._activeAnims.push({ name, def, t: 0, loop: loop ?? !!def.loop, onDone });
  }

  stopAnim(name) {
    this._activeAnims = this._activeAnims.filter((a) => a.name !== name);
  }

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
      try {
        this._update(dt);
        this._render();
      } catch (e) {
        console.error('[neku] frame error: ' + (e.stack || e.message));
      }
      this.input.endFrame();
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    this.input.destroy();
    this.gl3d?.dispose();
  }

  _update(dt) {
    for (const e of this.input.drainEvents()) {
      if (e.type === 'pointerdown' || e.type === 'pointermove' || e.type === 'pointerup') {
        this._pointer(e);
      }
      if (e.type === 'keydown' && this._focusInput) this._typeInto(this._focusInput, e.key);
      const walk = (n) => {
        if (n._hooks?.onInput) this._safely(() => n._hooks.onInput(e));
        for (const c of n.children) walk(c);
      };
      walk(this.root);
    }

    // Keyframe animations (before scripts so update() sees final values).
    for (const a of this._activeAnims) {
      a.t += dt;
      const dur = a.def.duration || 1;
      if (a.t >= dur) {
        if (a.loop) a.t %= dur;
        else {
          a.t = dur;
          a.done = true;
        }
      }
      sampleAnim(a.def, a.t, (name) => this.find(name));
      if (a.done && a.onDone) this._safely(a.onDone);
    }
    this._activeAnims = this._activeAnims.filter((a) => !a.done);

    for (const t of this._timers) {
      if (t.dead) continue;
      if (this.time >= t.at) {
        this._safely(t.fn);
        if (t.repeat) t.at += t.repeat;
        else t.dead = true;
      }
    }
    this._timers = this._timers.filter((t) => !t.dead);

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

    // Physics: dynamic bodies + collision signals.
    this.physics.step(this.root, dt, (a, b, side) => {
      if (a._hooks?.onCollide) this._safely(() => a._hooks.onCollide(b, side));
      if (b?._hooks?.onCollide) this._safely(() => b._hooks.onCollide(a, side === 'overlap' ? 'overlap' : opposite(side)));
    });

    // Scripts, sprite animation, particles.
    const walk = (n) => {
      if (n._dead) return;
      if (n.type === 'Sprite' && n.playing && (n.sheetCols > 1 || n.sheetRows > 1)) {
        n.frame = (n.frame + (n.fps || 8) * dt) % (n.sheetCols * n.sheetRows);
      }
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
    // 3D picking: clickable meshes + Screen3D UIs.
    if (this.gl3d) {
      const hit = this.gl3d.pick(e.x / this.width, e.y / this.height);
      if (hit) {
        if (hit.node.type === 'Screen3D' && hit.uv) {
          // Forward the hit into 2D UI space via the surface's UV coords.
          this._pointer2D({ type: e.type, x: hit.uv.x * this.width, y: (1 - hit.uv.y) * this.height });
          return;
        }
        if (e.type === 'pointerup') {
          if (hit.node._hooks?.onPress) this._safely(() => hit.node._hooks.onPress());
          this.emit('press3d', hit.node.name);
        }
      }
    }
    // Overlay 2D UI gets the raw pointer; in screen3d mode the 2D UI only
    // exists on 3D surfaces, so raw pointer events don't reach it directly.
    if (this.uiMode !== 'screen3d') this._pointer2D(e);
  }

  _typeInto(node, key) {
    const prev = node.text;
    if (key === 'Backspace') node.text = node.text.slice(0, -1);
    else if (key === 'Enter') {
      if (node._hooks?.onSubmit) this._safely(() => node._hooks.onSubmit());
      this.emit('submit', { name: node.name, text: node.text });
      return;
    } else if (key === 'Escape') {
      this._focusInput._focused = false;
      this._focusInput = null;
      return;
    } else if (key.length === 1 && node.text.length < (node.maxLength ?? 64)) {
      node.text += key;
    } else return;
    if (node.text !== prev) {
      if (node._hooks?.onChange) this._safely(() => node._hooks.onChange());
      this.emit('change', { name: node.name, text: node.text });
    }
  }

  _pointer2D(e) {
    let target = null;
    let inputTarget = null;
    const walk = (n) => {
      if (n.visible === false) return;
      if (n.type === 'Button' && (n.opacity ?? 1) > 0 && hitTest(n, e.x, e.y)) target = n;
      if (n.type === 'TextInput' && (n.opacity ?? 1) > 0 && hitTest(n, e.x, e.y)) inputTarget = n;
      for (const c of n.children) walk(c);
    };
    walk(this.root);

    if (e.type === 'pointerdown') {
      if (this._focusInput && this._focusInput !== inputTarget) this._focusInput._focused = false;
      this._focusInput = inputTarget;
      if (inputTarget) inputTarget._focused = true;
    }

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
    // 2D first so Screen3D's CanvasTexture picks up this frame's UI.
    render2D(this.ctx, this.root, this.assets, this.width, this.height, null, this.dpr);
    if (this.gl3d) this.gl3d.render(this.root, this.assets, this.width, this.height, this.canvas2d);
    if (this.screenFx) {
      this.screenFx.render(
        this.gl3d ? this.glCanvas : null,
        this.uiMode === 'screen3d' ? this._blank : this.canvas2d,
        this.time,
        this.fx,
        this.width * this.dpr,
        this.height * this.dpr
      );
    }
  }
}

function opposite(side) {
  return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side] || side;
}

export function startGame(project, container) {
  const game = new Game(project, container);
  game.start();
  return game;
}
