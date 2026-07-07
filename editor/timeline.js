// Neku Studio — Timeline panel: keyframe animation clips.
// Clips live in project.anims and play at runtime via game.playAnim(name).
// Scrubbing/preview mutates scene nodes transiently; a baseline snapshot is
// restored before anything is persisted so autosave never captures a pose.

import { sampleAnim } from '../engine/core.js';
import { Easing } from '../engine/math.js';

const ROW_H = 24, RULER_H = 20, PAD = 10;

export class TimelinePanel {
  constructor(container, ed) {
    this.ed = ed;
    this.current = null;      // anim name
    this.t = 0;               // playhead seconds
    this.previewing = false;
    this.selectedKey = null;  // { track, index }
    this.baseline = null;     // Map<"node.prop", value>

    container.innerHTML = `
      <div class="panel-tools">
        <select class="tl-anim" title="Animation clip"></select>
        <button class="tl-add" title="New animation">＋</button>
        <button class="tl-del" title="Delete animation">✕</button>
        <span class="sep"></span>
        <label class="dim-note">dur</label>
        <input class="tl-dur" type="number" step="0.1" min="0.1" style="width:56px" title="Duration (s)" />
        <label class="dim-note"><input class="tl-loop" type="checkbox" /> loop</label>
        <span class="sep"></span>
        <button class="tl-play accent" title="Preview">▶</button>
        <button class="tl-key" title="Keyframe all tracks at the playhead with current scene values">◆ Key</button>
        <button class="tl-track" title="Add a track for the selected node">＋ Track</button>
        <span class="flex"></span>
        <span class="tl-time dim-note">0.00s</span>
      </div>
      <div class="tl-body">
        <div class="tl-tracks"></div>
        <canvas class="tl-canvas"></canvas>
      </div>
      <div class="tl-keyedit" hidden>
        <span class="dim-note">key</span>
        <label>t</label><input class="tl-kt" type="number" step="0.05" style="width:64px" />
        <label>value</label><input class="tl-kv" type="number" step="any" style="width:80px" />
        <label>ease</label><select class="tl-ke">${Object.keys(Easing).map((e) => `<option>${e}</option>`).join('')}</select>
        <button class="tl-kdel danger">✕ key</button>
      </div>`;

    this.el = {};
    for (const k of ['anim', 'add', 'del', 'dur', 'loop', 'play', 'key', 'track', 'time', 'tracks', 'canvas', 'keyedit', 'kt', 'kv', 'ke', 'kdel'])
      this.el[k] = container.querySelector('.tl-' + k);
    this.ctx = this.el.canvas.getContext('2d');
    new ResizeObserver(() => this.repaint()).observe(this.el.canvas);

    this._wire();
    this._lastNow = performance.now();
  }

  anims() { return (this.ed.project.anims ||= {}); }
  def() { return this.current ? this.anims()[this.current] : null; }

  // Persist an anims mutation without baking the current scrub pose into the scene.
  mutate(fn) {
    this.restore();
    fn();
    this.ed.markDirty();
    this.apply();
  }

  snapshot() {
    const def = this.def();
    if (!def || this.baseline) return;
    this.baseline = new Map();
    for (const tr of def.tracks || []) {
      const node = this.ed.scene().root.find(tr.node) || (this.ed.scene().root.name === tr.node ? this.ed.scene().root : null);
      if (node) this.baseline.set(tr.node + '.' + tr.prop, node[tr.prop]);
    }
  }

  restore() {
    if (!this.baseline) return;
    for (const [key, v] of this.baseline) {
      const [nodeName, prop] = key.split('.');
      const node = this.ed.scene().root.find(nodeName) || (this.ed.scene().root.name === nodeName ? this.ed.scene().root : null);
      if (node) node[prop] = v;
    }
    this.baseline = null;
  }

  apply() {
    const def = this.def();
    if (!def) return;
    this.snapshot();
    sampleAnim(def, this.t, (name) => this.ed.scene().root.name === name ? this.ed.scene().root : this.ed.scene().root.find(name));
  }

  stopPreview() {
    this.previewing = false;
    this.el.play.textContent = '▶';
    this.restore();
    this.repaint();
  }

  // Called every editor frame.
  frame(now) {
    const dt = Math.min((now - this._lastNow) / 1000, 0.05);
    this._lastNow = now;
    if (this.previewing && this.def()) {
      const def = this.def();
      this.t += dt;
      if (this.t >= (def.duration || 1)) {
        if (this.el.loop.checked) this.t %= def.duration || 1;
        else { this.t = def.duration || 1; this.stopPreview(); return; }
      }
      this.apply();
      this.repaint();
    }
  }

  refresh() {
    const names = Object.keys(this.anims());
    if (!names.includes(this.current)) this.current = names[0] || null;
    this.el.anim.innerHTML = names.map((n) => `<option${n === this.current ? ' selected' : ''}>${n}</option>`).join('') ||
      '<option value="">no animations</option>';
    const def = this.def();
    this.el.dur.value = def?.duration ?? 1;
    this.el.loop.checked = !!def?.loop;
    this._refreshTracks();
    this.repaint();
  }

  _refreshTracks() {
    const box = this.el.tracks;
    box.innerHTML = '';
    for (const tr of this.def()?.tracks || []) {
      const row = document.createElement('div');
      row.className = 'tl-trackrow';
      row.innerHTML = `<span>${tr.node}<b>.${tr.prop}</b></span><button title="Remove track">✕</button>`;
      row.querySelector('button').addEventListener('click', () => {
        this.mutate(() => {
          const def = this.def();
          def.tracks.splice(def.tracks.indexOf(tr), 1);
        });
        this.selectedKey = null;
        this.refresh();
      });
      box.appendChild(row);
    }
  }

  _timeToX(t) {
    const w = this.el.canvas.clientWidth - PAD * 2;
    return PAD + (t / (this.def()?.duration || 1)) * w;
  }

  _xToTime(x) {
    const w = this.el.canvas.clientWidth - PAD * 2;
    const d = this.def()?.duration || 1;
    return Math.max(0, Math.min(d, ((x - PAD) / w) * d));
  }

  repaint() {
    const c = this.el.canvas;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.body);
    const col = (v) => css.getPropertyValue(v).trim();
    ctx.clearRect(0, 0, w, h);
    const def = this.def();
    if (!def) {
      ctx.fillStyle = col('--dim');
      ctx.font = '11px monospace';
      ctx.fillText('create an animation with ＋, add tracks, scrub, press ◆ Key', PAD, 30);
      return;
    }
    // ruler
    ctx.fillStyle = col('--bg3');
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.fillStyle = col('--dim');
    ctx.font = '9px monospace';
    const dur = def.duration || 1;
    const stepT = dur > 4 ? 1 : dur > 1.5 ? 0.5 : 0.1;
    for (let t = 0; t <= dur + 1e-6; t += stepT) {
      const x = this._timeToX(t);
      ctx.fillRect(x, RULER_H - 5, 1, 5);
      ctx.fillText(t.toFixed(1), x + 2, RULER_H - 7);
    }
    // rows + keys
    (def.tracks || []).forEach((tr, i) => {
      const y = RULER_H + i * ROW_H;
      ctx.fillStyle = i % 2 ? 'rgba(128,128,160,0.05)' : 'transparent';
      ctx.fillRect(0, y, w, ROW_H);
      for (let k = 0; k < (tr.keys || []).length; k++) {
        const key = tr.keys[k];
        const x = this._timeToX(key.t), cy = y + ROW_H / 2;
        const selected = this.selectedKey && this.selectedKey.track === tr && this.selectedKey.index === k;
        ctx.fillStyle = selected ? col('--accent2') : col('--accent');
        ctx.save();
        ctx.translate(x, cy);
        ctx.rotate(Math.PI / 4);
        const s = selected ? 5.5 : 4;
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      }
    });
    // playhead
    const px = this._timeToX(this.t);
    ctx.strokeStyle = col('--warn');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    this.el.time.textContent = this.t.toFixed(2) + 's';
  }

  _keyAt(x, y) {
    const def = this.def();
    if (!def) return null;
    const row = Math.floor((y - RULER_H) / ROW_H);
    const tr = def.tracks?.[row];
    if (!tr) return null;
    for (let i = 0; i < (tr.keys || []).length; i++) {
      if (Math.abs(this._timeToX(tr.keys[i].t) - x) < 7) return { track: tr, index: i };
    }
    return null;
  }

  _selectKey(sel) {
    this.selectedKey = sel;
    this.el.keyedit.hidden = !sel;
    if (sel) {
      const key = sel.track.keys[sel.index];
      this.el.kt.value = key.t;
      this.el.kv.value = key.v;
      this.el.ke.value = key.ease || 'linear';
    }
    this.repaint();
  }

  _wire() {
    const c = this.el.canvas;
    let dragKey = null;

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = this._keyAt(x, y);
      if (hit) {
        this._selectKey(hit);
        dragKey = hit;
      } else {
        this._selectKey(null);
        this.t = this._xToTime(x);
        this.stopPreviewOnly();
        this.apply();
        this.repaint();
        dragKey = 'scrub';
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!dragKey) return;
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (dragKey === 'scrub') {
        this.t = this._xToTime(x);
        this.apply();
      } else {
        dragKey.track.keys[dragKey.index].t = Math.round(this._xToTime(x) * 100) / 100;
      }
      this.repaint();
    });
    c.addEventListener('pointerup', () => {
      if (dragKey && dragKey !== 'scrub') {
        this.mutate(() => dragKey.track.keys.sort((a, b) => a.t - b.t));
        this._selectKey(null);
      }
      dragKey = null;
    });
    c.addEventListener('dblclick', (e) => {
      // double-click a row: key that track at this time with the node's current value
      const r = c.getBoundingClientRect();
      const y = e.clientY - r.top;
      const def = this.def();
      const tr = def?.tracks?.[Math.floor((y - RULER_H) / ROW_H)];
      if (!tr) return;
      const t = Math.round(this._xToTime(e.clientX - r.left) * 100) / 100;
      this._addKey(tr, t);
    });

    this.el.anim.addEventListener('change', () => {
      this.stopPreview();
      this.current = this.el.anim.value || null;
      this.t = 0;
      this._selectKey(null);
      this.refresh();
    });
    this.el.add.addEventListener('click', () => {
      const name = prompt('Animation name', 'anim' + (Object.keys(this.anims()).length + 1));
      if (!name) return;
      this.mutate(() => { this.anims()[name] ||= { duration: 1, loop: false, tracks: [] }; });
      this.current = name;
      this.refresh();
    });
    this.el.del.addEventListener('click', () => {
      if (!this.current || !confirm(`Delete animation "${this.current}"?`)) return;
      this.stopPreview();
      this.mutate(() => delete this.anims()[this.current]);
      this.current = null;
      this.refresh();
    });
    this.el.dur.addEventListener('change', () => this.mutate(() => { if (this.def()) this.def().duration = Math.max(0.1, +this.el.dur.value || 1); }) || this.repaint());
    this.el.loop.addEventListener('change', () => this.mutate(() => { if (this.def()) this.def().loop = this.el.loop.checked; }));
    this.el.play.addEventListener('click', () => {
      if (this.previewing) return this.stopPreview();
      if (!this.def()) return;
      this.previewing = true;
      this.el.play.textContent = '⏹';
      if (this.t >= (this.def().duration || 1)) this.t = 0;
    });
    this.el.track.addEventListener('click', () => {
      const node = this.ed.sel;
      if (!node) return alert('Select a node first.');
      const prop = prompt(`Property of "${node.name}" to animate (number props: x y z rotation opacity scaleX ry …)`, node.is3D ? 'ry' : 'x');
      if (!prop) return;
      if (typeof node[prop] !== 'number') return alert(`"${prop}" is not a numeric property of ${node.name}.`);
      if (!this.current) {
        this.mutate(() => { this.anims()['anim1'] ||= { duration: 1, loop: false, tracks: [] }; });
        this.current = 'anim1';
      }
      this.mutate(() => this.def().tracks.push({ node: node.name, prop, keys: [{ t: 0, v: node[prop], ease: 'linear' }] }));
      this.refresh();
    });
    this.el.key.addEventListener('click', () => {
      const def = this.def();
      if (!def?.tracks?.length) return alert('Add a track first (＋ Track with a node selected).');
      for (const tr of def.tracks) this._addKey(tr, Math.round(this.t * 100) / 100, true);
      this.mutate(() => {});
      this.repaint();
    });
    this.el.kt.addEventListener('change', () => this._editKey((k) => { k.t = Math.max(0, +this.el.kt.value || 0); }));
    this.el.kv.addEventListener('change', () => this._editKey((k) => { k.v = +this.el.kv.value || 0; }));
    this.el.ke.addEventListener('change', () => this._editKey((k) => { k.ease = this.el.ke.value; }));
    this.el.kdel.addEventListener('click', () => {
      const sel = this.selectedKey;
      if (!sel) return;
      this.mutate(() => sel.track.keys.splice(sel.index, 1));
      this._selectKey(null);
    });
  }

  stopPreviewOnly() {
    if (this.previewing) {
      this.previewing = false;
      this.el.play.textContent = '▶';
    }
  }

  _addKey(tr, t, silent = false) {
    const root = this.ed.scene().root;
    const node = root.name === tr.node ? root : root.find(tr.node);
    if (!node) return;
    const v = Math.round((node[tr.prop] ?? 0) * 1000) / 1000;
    const existing = tr.keys.find((k) => Math.abs(k.t - t) < 0.02);
    const doIt = () => {
      if (existing) existing.v = v;
      else {
        tr.keys.push({ t, v, ease: 'quadOut' });
        tr.keys.sort((a, b) => a.t - b.t);
      }
    };
    silent ? doIt() : this.mutate(doIt);
    this.repaint();
  }

  _editKey(fn) {
    const sel = this.selectedKey;
    if (!sel) return;
    this.mutate(() => {
      fn(sel.track.keys[sel.index]);
      sel.track.keys.sort((a, b) => a.t - b.t);
    });
    this.repaint();
  }
}
