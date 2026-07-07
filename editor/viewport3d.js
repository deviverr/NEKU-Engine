// Neku Studio — 3D scene viewport: orbit camera, click-to-select,
// drag-move on the ground plane, live Screen3D preview of the 2D UI.

import { Render3D, THREE } from '../engine/render3d.js';
import { OrbitControls } from '../vendor/three.js';
import { render2D } from '../engine/renderer2d.js';

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
    this.helpers.add(new THREE.GridHelper(40, 40, 0x555577, 0x2a2a3a));
    this.helpers.add(new THREE.AxesHelper(2.5));
    this.r3d.scene.add(this.helpers);
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#5fa8e0'));
    this.selBox.visible = false;
    this.r3d.scene.add(this.selBox);

    // Offscreen 2D UI render feeds Screen3D CanvasTextures a live preview.
    this.uiCanvas = document.createElement('canvas');
    this.uiCtx = this.uiCanvas.getContext('2d');

    this._bindInput();
    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
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
    let drag = null;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();

    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this._pointerNorm(e);
      const hit = this.r3d.pick(p.x, p.y, this.camera);
      if (hit && hit.node === this.ed.sel && hit.node.type !== 'Camera3D') {
        // Drag the selected node on a horizontal plane through its center.
        drag = { node: hit.node, planeY: hit.point.y, startX: hit.node.x || 0, startZ: hit.node.z || 0, from: hit.point.clone() };
        plane.constant = -drag.planeY;
        this.controls.enabled = false;
      } else if (hit) {
        this.ed.select(hit.node);
      } else if (e.button === 0 && !e.shiftKey) {
        // click on empty space keeps orbit behavior; selection cleared on plain click
        this.ed.select(null);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = this._pointerNorm(e);
      this.r3d.raycaster.setFromCamera(new THREE.Vector2(p.x * 2 - 1, -(p.y * 2 - 1)), this.camera);
      if (this.r3d.raycaster.ray.intersectPlane(plane, hitPoint)) {
        let nx = drag.startX + (hitPoint.x - drag.from.x);
        let nz = drag.startZ + (hitPoint.z - drag.from.z);
        if (e.shiftKey) { nx = Math.round(nx * 2) / 2; nz = Math.round(nz * 2) / 2; }
        drag.node.x = Math.round(nx * 100) / 100;
        drag.node.z = Math.round(nz * 100) / 100;
        this.ed.refreshInspector();
      }
    });

    window.addEventListener('pointerup', () => {
      if (drag) this.ed.markDirty();
      drag = null;
      this.controls.enabled = true;
    });
  }

  render() {
    const ed = this.ed;
    if (!ed.project) return;
    const { width: W, height: H } = ed.project.settings;

    // Live 2D UI for Screen3D surfaces.
    if (this.uiCanvas.width !== W) { this.uiCanvas.width = W; this.uiCanvas.height = H; }
    render2D(this.uiCtx, ed.scene().root, ed.assets, W, H, ed.project.settings.background, 1);

    this.controls.update();
    this.helpers.visible = true;
    this.r3d.render(ed.scene().root, ed.assets, this.w, this.h, this.uiCanvas, this.camera);

    // Selection box around the selected 3D node's mirror.
    const sel = ed.sel;
    const mirror = sel && sel.is3D ? this.r3d.mirrors.get(sel.id) : null;
    if (mirror) {
      this.selBox.box.setFromObject(mirror.obj);
      this.selBox.visible = !this.selBox.box.isEmpty();
    } else {
      this.selBox.visible = false;
    }
  }
}
