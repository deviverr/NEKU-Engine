// Neku Studio — 3D scene viewport: orbit camera, click-to-select, real
// move/rotate/scale gizmos (W/E/R), snapping, focus (F), and editor markers
// for cameras and lights so non-mesh nodes are visible and pickable.

import { Render3D, THREE } from '../engine/render3d.js';
import { OrbitControls, TransformControls } from '../vendor/three.js';
import { render2D } from '../engine/renderer2d.js';

const DEG = Math.PI / 180;

export class Viewport3D {
  constructor(container, ed) {
    this.ed = ed;
    this.container = container;
    container.innerHTML = '';
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    container.appendChild(this.canvas);

    this.r3d = new Render3D(this.canvas, { pixelated: false });
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000);
    this.camera.position.set(6, 5, 8);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;

    // Editor-only helpers live in a separate group so scene sync ignores them.
    this.helpers = new THREE.Group();
    this.grid = new THREE.GridHelper(40, 40, 0x555577, 0x2a2a3a);
    this.helpers.add(this.grid);
    this.helpers.add(new THREE.AxesHelper(2.5));
    this.r3d.scene.add(this.helpers);
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#5fa8e0'));
    this.selBox.visible = false;
    this.r3d.scene.add(this.selBox);

    // Markers for nodes with no visible geometry (Camera3D / Light3D / Node3D).
    this.markers = new Map(); // node.id -> THREE.Object3D (in helpers group)
    this.markerGroup = new THREE.Group();
    this.helpers.add(this.markerGroup);

    // Transform gizmo.
    this.gizmo = new TransformControls(this.camera, this.canvas);
    this.gizmo.setSize(0.85);
    this.r3d.scene.add(this.gizmo);
    this.snap = false;
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (!e.value && this._dragged) {
        this._dragged = false;
        this.ed.markDirty();
      }
    });
    this.gizmo.addEventListener('objectChange', () => {
      const n = this.ed.sel;
      const obj = this.gizmo.object;
      if (!n || !obj) return;
      this._dragged = true;
      const r2 = (v) => Math.round(v * 100) / 100;
      if (this.gizmo.mode === 'translate') {
        n.x = r2(obj.position.x); n.y = r2(obj.position.y); n.z = r2(obj.position.z);
      } else if (this.gizmo.mode === 'rotate') {
        n.rx = r2(obj.rotation.x / DEG); n.ry = r2(obj.rotation.y / DEG); n.rz = r2(obj.rotation.z / DEG);
      } else {
        n.sx = r2(obj.scale.x); n.sy = r2(obj.scale.y); n.sz = r2(obj.scale.z);
      }
      this.ed.refreshInspector();
    });

    // Overlay toolbar: gizmo modes, snap, focus, grid.
    this.tools = document.createElement('div');
    this.tools.className = 'vp3d-tools';
    this.tools.innerHTML = `
      <button data-mode="translate" class="on" title="Move (W)">✥</button>
      <button data-mode="rotate" title="Rotate (E)">⟳</button>
      <button data-mode="scale" title="Scale (R)">⤢</button>
      <span class="sep"></span>
      <button data-snap title="Snap (hold Shift to invert)">▦ snap</button>
      <button data-focus title="Focus selection (F)">◎</button>
      <button data-grid class="on" title="Toggle grid">grid</button>`;
    container.appendChild(this.tools);
    this.tools.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    this.tools.querySelector('[data-snap]').addEventListener('click', (e) => {
      this.snap = !this.snap;
      e.currentTarget.classList.toggle('on', this.snap);
      this._applySnap();
    });
    this.tools.querySelector('[data-focus]').addEventListener('click', () => this.focusSelection());
    this.tools.querySelector('[data-grid]').addEventListener('click', (e) => {
      this.grid.visible = !this.grid.visible;
      e.currentTarget.classList.toggle('on', this.grid.visible);
    });

    // Shift temporarily inverts the snap toggle.
    this._shiftWatch = (e) => {
      if (e.key === 'Shift') this._applySnap(e.type === 'keydown');
    };
    window.addEventListener('keydown', this._shiftWatch);
    window.addEventListener('keyup', this._shiftWatch);

    this._bindInput();
    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
  }

  setMode(mode) {
    this.gizmo.setMode(mode);
    this.tools.querySelectorAll('[data-mode]').forEach((b) =>
      b.classList.toggle('on', b.dataset.mode === mode));
  }

  _applySnap(shiftDown = false) {
    const on = this.snap !== shiftDown;
    this.gizmo.setTranslationSnap(on ? 0.5 : null);
    this.gizmo.setRotationSnap(on ? 15 * DEG : null);
    this.gizmo.setScaleSnap(on ? 0.1 : null);
  }

  focusSelection() {
    const sel = this.ed.sel;
    const obj = sel?.is3D ? this._objFor(sel) : null;
    const target = new THREE.Vector3();
    if (obj) {
      const box = new THREE.Box3().setFromObject(obj);
      let radius = 2;
      if (!box.isEmpty()) {
        box.getCenter(target);
        radius = Math.max(1, box.getSize(new THREE.Vector3()).length() * 0.8);
      } else {
        obj.getWorldPosition(target);
      }
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.copy(target);
      this.camera.position.copy(target.clone().add(dir.multiplyScalar(radius * 2)));
    } else {
      this.controls.target.set(0, 0, 0);
    }
  }

  _objFor(node) {
    return this.r3d.mirrors.get(node.id)?.obj || this.markers.get(node.id) || null;
  }

  _resize() {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
  }

  _pointerNorm(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  _bindInput() {
    let downAt = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      // Click-select only on a true click (not orbit drags, gizmo drags, or
      // clicks landing on a gizmo handle — axis is set while hovering one).
      if (!downAt || this.gizmo.dragging || this.gizmo.axis) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 4 || e.button !== 0) return;
      const p = this._pointerNorm(e);
      const marker = this._pickMarker(p);
      const hit = marker || this.r3d.pick(p.x, p.y, this.camera)?.node || null;
      if (hit !== this.ed.sel) this.ed.select(hit);
    });

    // W/E/R gizmo modes + F focus, when the 3D pane is active and not typing.
    window.addEventListener('keydown', (e) => {
      if (!this.container.classList.contains('active')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.closest('.cm-editor')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'w') this.setMode('translate');
      else if (k === 'e') this.setMode('rotate');
      else if (k === 'r') this.setMode('scale');
      else if (k === 'f') this.focusSelection();
    });
  }

  _pickMarker(p) {
    this.r3d.raycaster.setFromCamera(new THREE.Vector2(p.x * 2 - 1, -(p.y * 2 - 1)), this.camera);
    const hits = this.r3d.raycaster.intersectObjects(this.markerGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.nekuNode) o = o.parent;
      if (o?.userData.nekuNode) return o.userData.nekuNode;
    }
    return null;
  }

  _markerFor(node) {
    let m = this.markers.get(node.id);
    if (!m) {
      m = new THREE.Group();
      m.userData.nekuNode = node;
      const mat = (c) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.75 });
      if (node.type === 'Camera3D') {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 4), mat('#5fa8e0'));
        cone.rotation.x = -Math.PI / 2;
        m.add(cone);
      } else if (node.type === 'Light3D') {
        m.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.24), mat('#ffcb47')));
      } else {
        m.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat('#8d84ad')));
      }
      this.markers.set(node.id, m);
      this.markerGroup.add(m);
    }
    return m;
  }

  _syncMarkers(root) {
    const seen = new Set();
    const walk = (n) => {
      if (n.is3D && (n.type === 'Camera3D' || n.type === 'Light3D' || n.type === 'Node3D')) {
        // Skip ambient/hemi lights that have no meaningful position.
        if (!(n.type === 'Light3D' && (n.kind === 'ambient' || n.kind === 'hemi'))) {
          seen.add(n.id);
          const m = this._markerFor(n);
          const mirror = this.r3d.mirrors.get(n.id);
          if (mirror) m.position.setFromMatrixPosition(mirror.obj.matrixWorld);
          else m.position.set(n.x || 0, n.y || 0, n.z || 0);
          if (n.type === 'Camera3D') m.lookAt(n.tx ?? 0, n.ty ?? 0, n.tz ?? 0);
        }
      }
      for (const c of n.children) walk(c);
    };
    walk(root);
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.removeFromParent();
        this.markers.delete(id);
      }
    }
  }

  render() {
    const ed = this.ed;
    if (!ed.project) return;
    const { width: W, height: H } = ed.project.settings;

    // Live 2D UI for Screen3D surfaces.
    if (!this.uiCanvas) {
      this.uiCanvas = document.createElement('canvas');
      this.uiCtx = this.uiCanvas.getContext('2d');
    }
    if (this.uiCanvas.width !== W) { this.uiCanvas.width = W; this.uiCanvas.height = H; }
    render2D(this.uiCtx, ed.scene().root, ed.assets, W, H, ed.project.settings.background, 1);

    this.controls.update();
    this.helpers.visible = true;
    // Mirrors are torn down on project reloads; drop a stale gizmo target
    // before Three renders or TransformControls warns every frame.
    if (this.gizmo.object) {
      let top = this.gizmo.object;
      while (top.parent) top = top.parent;
      if (top !== this.r3d.scene) this.gizmo.detach();
    }
    this.r3d.render(ed.scene().root, ed.assets, this.w, this.h, this.uiCanvas, this.camera);
    this._syncMarkers(ed.scene().root);

    // Gizmo follows the selected 3D node's mirror (or marker for empties).
    const sel = ed.sel;
    const obj = sel && sel.is3D && !sel._dead ? this._objFor(sel) : null;
    if (obj) {
      if (this.gizmo.object !== obj) this.gizmo.attach(obj);
    } else if (this.gizmo.object) {
      this.gizmo.detach();
    }

    // Selection box around meshes.
    const mirror = sel && sel.is3D ? this.r3d.mirrors.get(sel.id) : null;
    if (mirror && !this.gizmo.dragging) {
      this.selBox.box.setFromObject(mirror.obj);
      this.selBox.visible = !this.selBox.box.isEmpty();
    } else if (!mirror) {
      this.selBox.visible = false;
    }
  }
}
