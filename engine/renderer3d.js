// CCE 3D renderer — minimal WebGL1 forward renderer.
// Flat-shaded meshes (box/sphere/plane/cylinder), one directional light + ambient.
// Deliberately tiny: no textures, no shadows, no PBR. Enough for stylized 3D.

import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Compose, DEG } from './math.js';

const VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj, uView, uModel;
varying vec3 vNormal;
void main() {
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
  vNormal = mat3(uModel) * aNormal;
}`;

const FS = `
precision mediump float;
uniform vec3 uColor, uLightDir;
uniform float uAmbient;
varying vec3 vNormal;
void main() {
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  gl_FragColor = vec4(uColor * (uAmbient + (1.0 - uAmbient) * diff), 1.0);
}`;

export class Renderer3D {
  constructor(canvas) {
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!this.gl) return;
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('[cce] shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNormal: gl.getAttribLocation(prog, 'aNormal'),
      uProj: gl.getUniformLocation(prog, 'uProj'),
      uView: gl.getUniformLocation(prog, 'uView'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uLightDir: gl.getUniformLocation(prog, 'uLightDir'),
      uAmbient: gl.getUniformLocation(prog, 'uAmbient'),
    };
    gl.enable(gl.DEPTH_TEST);
    this.meshCache = new Map();
  }

  _mesh(node) {
    const key = [node.shape, node.w, node.h, node.d, node.radius, node.segments].join('|');
    let m = this.meshCache.get(key);
    if (m) return m;
    const geo = GEOMETRY[node.shape || 'box'](node);
    const gl = this.gl;
    m = { count: geo.positions.length / 3, pos: gl.createBuffer(), nrm: gl.createBuffer() };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.normals), gl.STATIC_DRAW);
    this.meshCache.set(key, m);
    return m;
  }

  render(root, width, height) {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Find camera + light in the tree (first of each wins).
    let cam = null, light = null;
    const meshes = [];
    const walk = (n, pm) => {
      if (n.visible === false) return;
      let m = pm;
      if (n.is3D) {
        m = mat4Multiply(
          pm,
          mat4Compose(
            n.x || 0, n.y || 0, n.z || 0,
            (n.rx || 0) * DEG, (n.ry || 0) * DEG, (n.rz || 0) * DEG,
            n.sx ?? 1, n.sy ?? 1, n.sz ?? 1
          )
        );
        if (n.type === 'Camera3D' && !cam) cam = n;
        else if (n.type === 'Light3D' && !light) light = n;
        else if (n.type === 'Mesh3D') meshes.push([n, m]);
      }
      for (const c of n.children) walk(c, m);
    };
    walk(root, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    if (!meshes.length) return;

    const eye = cam ? [cam.x || 0, cam.y || 0, cam.z ?? 6] : [0, 2, 6];
    const target = cam ? [cam.tx || 0, cam.ty || 0, cam.tz || 0] : [0, 0, 0];
    const proj = mat4Perspective(cam?.fov || 55, width / height, 0.1, 200);
    const view = mat4LookAt(eye, target);
    const lightDir = light ? [light.dx ?? 0.5, light.dy ?? 1, light.dz ?? 0.8] : [0.5, 1, 0.8];
    const ambient = light?.ambient ?? 0.35;

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj);
    gl.uniformMatrix4fv(this.loc.uView, false, view);
    gl.uniform3fv(this.loc.uLightDir, lightDir);
    gl.uniform1f(this.loc.uAmbient, ambient);

    for (const [node, model] of meshes) {
      const mesh = this._mesh(node);
      gl.uniformMatrix4fv(this.loc.uModel, false, model);
      gl.uniform3fv(this.loc.uColor, hexToRgb(node.color || '#e0b040'));
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
      gl.enableVertexAttribArray(this.loc.aPos);
      gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
      gl.enableVertexAttribArray(this.loc.aNormal);
      gl.vertexAttribPointer(this.loc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// --- Geometry generators (non-indexed triangles + per-face normals) ---

function quad(P, N, a, b, c, d, n) {
  P.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) N.push(...n);
}

const GEOMETRY = {
  box(node) {
    const w = (node.w ?? 1) / 2, h = (node.h ?? 1) / 2, d = (node.d ?? 1) / 2;
    const P = [], N = [];
    quad(P, N, [-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d], [0, 0, 1]);
    quad(P, N, [w, -h, -d], [-w, -h, -d], [-w, h, -d], [w, h, -d], [0, 0, -1]);
    quad(P, N, [-w, h, d], [w, h, d], [w, h, -d], [-w, h, -d], [0, 1, 0]);
    quad(P, N, [-w, -h, -d], [w, -h, -d], [w, -h, d], [-w, -h, d], [0, -1, 0]);
    quad(P, N, [w, -h, d], [w, -h, -d], [w, h, -d], [w, h, d], [1, 0, 0]);
    quad(P, N, [-w, -h, -d], [-w, -h, d], [-w, h, d], [-w, h, -d], [-1, 0, 0]);
    return { positions: P, normals: N };
  },

  plane(node) {
    const w = (node.w ?? 2) / 2, d = (node.d ?? 2) / 2;
    const P = [], N = [];
    quad(P, N, [-w, 0, d], [w, 0, d], [w, 0, -d], [-w, 0, -d], [0, 1, 0]);
    return { positions: P, normals: N };
  },

  sphere(node) {
    const r = node.radius ?? 0.5, seg = node.segments ?? 16;
    const P = [], N = [];
    const pt = (i, j) => {
      const phi = (i / seg) * Math.PI, theta = (j / seg) * Math.PI * 2;
      return [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
    };
    for (let i = 0; i < seg; i++)
      for (let j = 0; j < seg; j++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        for (const v of [a, b, c, a, c, d]) {
          P.push(...v);
          const l = Math.hypot(...v) || 1;
          N.push(v[0] / l, v[1] / l, v[2] / l);
        }
      }
    return { positions: P, normals: N };
  },

  cylinder(node) {
    const r = node.radius ?? 0.5, h = (node.h ?? 1) / 2, seg = node.segments ?? 24;
    const P = [], N = [];
    for (let j = 0; j < seg; j++) {
      const t0 = (j / seg) * Math.PI * 2, t1 = ((j + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      // side
      P.push(r * c0, -h, r * s0, r * c1, -h, r * s1, r * c1, h, r * s1);
      P.push(r * c0, -h, r * s0, r * c1, h, r * s1, r * c0, h, r * s0);
      N.push(c0, 0, s0, c1, 0, s1, c1, 0, s1, c0, 0, s0, c1, 0, s1, c0, 0, s0);
      // caps
      P.push(0, h, 0, r * c0, h, r * s0, r * c1, h, r * s1);
      N.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      P.push(0, -h, 0, r * c1, -h, r * s1, r * c0, -h, r * s0);
      N.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    }
    return { positions: P, normals: N };
  },
};
