// Neku 3D render server — built on Three.js (vendored, see /vendor/three.js).
// Mirrors the 3D branch of the Neku scene tree into a THREE.Scene each frame.
// This module is loaded dynamically only when a scene actually uses 3D,
// so 2D-only games never ship Three.

import * as THREE from '../vendor/three.js';
import { GLTFLoader } from '../vendor/three.js';

const DEG = Math.PI / 180;

export class Render3D {
  constructor(canvas, { pixelated = false } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !pixelated, alpha: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
    this.pixelated = pixelated;
    this.mirrors = new Map(); // node.id -> { obj, key, node }
    this.textures = new Map(); // asset name -> THREE.Texture
    this.models = new Map(); // asset name -> Promise<THREE.Group>
    this.gltf = new GLTFLoader();
    this.raycaster = new THREE.Raycaster();
    this._screenTextures = new Map(); // node.id -> CanvasTexture
  }

  texture(assets, name) {
    if (!name || !assets.urls?.[name]) return null;
    let t = this.textures.get(name);
    if (!t) {
      t = new THREE.TextureLoader().load(assets.urls[name]);
      t.colorSpace = THREE.SRGBColorSpace;
      if (this.pixelated) {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
      }
      this.textures.set(name, t);
    }
    return t;
  }

  model(assets, name) {
    if (!name || !assets.urls?.[name]) return null;
    let p = this.models.get(name);
    if (!p) {
      p = new Promise((resolve) => {
        this.gltf.load(assets.urls[name], (g) => resolve(g.scene), undefined, (e) => {
          console.error(`[neku] failed to load model "${name}": ${e.message || e}`);
          resolve(new THREE.Group());
        });
      });
      this.models.set(name, p);
    }
    return p;
  }

  // Geometry/material identity key: rebuild the mirror only when this changes.
  _key(n) {
    return [
      n.shape, n.w, n.h, n.d, n.radius, n.segments, n.model,
      n.color, n.texture, n.metalness, n.roughness, n.emissive, n.emissiveIntensity,
      n.wireframe, n.opacity, n.unlit, n.castShadow, n.receiveShadow, n.kind, n.intensity,
    ].join('|');
  }

  _geometry(n) {
    switch (n.shape) {
      case 'sphere': return new THREE.SphereGeometry(n.radius ?? 0.5, n.segments ?? 24, n.segments ?? 24);
      case 'plane': return new THREE.PlaneGeometry(n.w ?? 2, n.d ?? 2).rotateX(-Math.PI / 2);
      case 'cylinder': return new THREE.CylinderGeometry(n.radius ?? 0.5, n.radius ?? 0.5, n.h ?? 1, n.segments ?? 32);
      case 'cone': return new THREE.ConeGeometry(n.radius ?? 0.5, n.h ?? 1, n.segments ?? 32);
      case 'torus': return new THREE.TorusGeometry(n.radius ?? 0.5, (n.d ?? 0.4) * (n.radius ?? 0.5), 16, 48);
      default: return new THREE.BoxGeometry(n.w ?? 1, n.h ?? 1, n.d ?? 1);
    }
  }

  _material(n, assets) {
    const params = {
      color: new THREE.Color(n.color || '#cccccc'),
      transparent: (n.opacity ?? 1) < 1,
      opacity: n.opacity ?? 1,
      wireframe: !!n.wireframe,
    };
    const map = this.texture(assets, n.texture);
    if (map) {
      params.map = map;
      params.color = new THREE.Color('#ffffff');
    }
    if (n.unlit) return new THREE.MeshBasicMaterial(params);
    params.metalness = n.metalness ?? 0.1;
    params.roughness = n.roughness ?? 0.75;
    if (n.emissive) {
      params.emissive = new THREE.Color(n.emissive);
      params.emissiveIntensity = n.emissiveIntensity ?? 1;
    }
    return new THREE.MeshStandardMaterial(params);
  }

  _build(n, assets, canvas2d) {
    switch (n.type) {
      case 'Mesh3D': {
        if (n.shape === 'model') {
          const group = new THREE.Group();
          this.model(assets, n.model)?.then((m) => {
            const clone = m.clone(true);
            clone.traverse((c) => {
              if (c.isMesh) { c.castShadow = n.castShadow !== false; c.receiveShadow = n.receiveShadow !== false; }
            });
            group.add(clone);
          });
          return group;
        }
        const mesh = new THREE.Mesh(this._geometry(n), this._material(n, assets));
        mesh.castShadow = n.castShadow !== false;
        mesh.receiveShadow = n.receiveShadow !== false;
        return mesh;
      }
      case 'Light3D': {
        const color = new THREE.Color(n.color || '#ffffff');
        const i = n.intensity ?? 1;
        let light;
        if (n.kind === 'ambient') light = new THREE.AmbientLight(color, i);
        else if (n.kind === 'point') { light = new THREE.PointLight(color, i, n.range ?? 0); light.castShadow = n.castShadow !== false; }
        else if (n.kind === 'hemi') light = new THREE.HemisphereLight(color, new THREE.Color(n.groundColor || '#223'), i);
        else {
          light = new THREE.DirectionalLight(color, i);
          light.castShadow = n.castShadow !== false;
          light.shadow.mapSize.set(1024, 1024);
          const s = 12;
          Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
        }
        return light;
      }
      case 'Screen3D': {
        // The game's 2D canvas, alive on a 3D surface (arcade cabinet trick).
        const tex = new THREE.CanvasTexture(canvas2d);
        tex.colorSpace = THREE.SRGBColorSpace;
        if (this.pixelated) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; }
        this._screenTextures.set(n.id, tex);
        const mat = n.unlit === false
          ? new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: n.glow ?? 0.9 })
          : new THREE.MeshBasicMaterial({ map: tex });
        return new THREE.Mesh(new THREE.PlaneGeometry(n.w ?? 2, n.h ?? 1.5), mat);
      }
      default:
        return new THREE.Group(); // Node3D / Camera3D marker
    }
  }

  // Walk the Neku tree; create/update/remove Three mirrors.
  sync(root, assets, canvas2d) {
    const seen = new Set();
    let activeCam = null;

    const walk = (n, parentObj) => {
      if (n._dead) return;
      let entry = null;
      if (n.is3D) {
        seen.add(n.id);
        entry = this.mirrors.get(n.id);
        const key = this._key(n);
        if (!entry || entry.key !== key) {
          if (entry) entry.obj.removeFromParent();
          const obj = this._build(n, assets, canvas2d);
          entry = { obj, key, node: n };
          this.mirrors.set(n.id, entry);
        }
        if (entry.obj.parent !== parentObj) parentObj.add(entry.obj);
        entry.obj.position.set(n.x || 0, n.y || 0, n.z || 0);
        entry.obj.rotation.set((n.rx || 0) * DEG, (n.ry || 0) * DEG, (n.rz || 0) * DEG);
        entry.obj.scale.set(n.sx ?? 1, n.sy ?? 1, n.sz ?? 1);
        entry.obj.visible = n.visible !== false;
        if (n.type === 'Camera3D' && !activeCam) activeCam = n;
        if (n.type === 'Light3D' && n.kind === 'directional') {
          entry.obj.target.position.set(n.tx || 0, n.ty || 0, n.tz || 0);
          if (!entry.obj.target.parent) this.scene.add(entry.obj.target);
        }
      }
      for (const c of n.children) walk(c, entry ? entry.obj : parentObj);
    };
    walk(root, this.scene);

    for (const [id, entry] of this.mirrors) {
      if (!seen.has(id)) {
        entry.obj.removeFromParent();
        this.mirrors.delete(id);
        this._screenTextures.delete(id);
      }
    }
    for (const tex of this._screenTextures.values()) tex.needsUpdate = true;
    return activeCam;
  }

  render(root, assets, width, height, canvas2d, overrideCamera = null) {
    const camNode = this.sync(root, assets, canvas2d);
    let cam = overrideCamera;
    if (!cam) {
      cam = this.camera;
      if (camNode) {
        const world = new THREE.Vector3();
        this.mirrors.get(camNode.id)?.obj.getWorldPosition(world);
        cam.position.copy(world);
        cam.fov = camNode.fov ?? 55;
        cam.near = camNode.near ?? 0.1;
        cam.far = camNode.far ?? 500;
        cam.lookAt(camNode.tx ?? 0, camNode.ty ?? 0, camNode.tz ?? 0);
      } else {
        cam.position.set(4, 3, 6);
        cam.lookAt(0, 0, 0);
      }
    }
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    const c = this.renderer.domElement;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== (width * dpr) | 0 || c.height !== (height * dpr) | 0) {
      this.renderer.setSize(width, height, false);
      this.renderer.setPixelRatio(dpr);
    }
    this.renderer.render(this.scene, cam);
  }

  // Pointer picking: x,y in [0,1] canvas space -> Neku node (or null).
  // Includes hit.uv so Screen3D surfaces can forward clicks into the 2D UI.
  pick(x, y, camera = this.camera) {
    this.raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        for (const entry of this.mirrors.values()) {
          if (entry.obj === obj) {
            return { node: entry.node, point: hit.point, distance: hit.distance, uv: hit.uv || null };
          }
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  dispose() {
    this.renderer.dispose();
    this.mirrors.clear();
    this.textures.clear();
    this._screenTextures.clear();
  }
}

export { THREE };
