// Neku screen FX — CRT post-processing (the Casino Calculator look).
// Composites the 3D and 2D canvases into one WebGL pass with curvature,
// scanlines, vignette, flicker, noise and glow. Zero dependencies.
//
// settings.fx = { crt: true, curvature: 0.07, scanlines: 0.35, vignette: 0.35,
//                 flicker: 0.02, noise: 0.04, glow: 0.25, aberration: 0.0015 }

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D u3d, u2d;
uniform float uTime, uCurve, uScan, uVig, uFlicker, uNoise, uGlow, uAberr, uHas3d;
uniform vec2 uRes;

vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  uv *= 1.0 + uCurve * (abs(uv.yx * uv.yx));
  return uv * 0.5 + 0.5;
}

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

vec4 screen(vec2 uv) {
  vec4 base = uHas3d > 0.5 ? texture2D(u3d, uv) : vec4(0.0);
  vec4 ui = texture2D(u2d, uv);
  return vec4(mix(base.rgb, ui.rgb, ui.a), max(base.a, ui.a));
}

void main() {
  vec2 uv = curve(vUv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec4 col = screen(uv);
  if (uAberr > 0.0) {
    col.r = screen(uv + vec2(uAberr, 0.0)).r;
    col.b = screen(uv - vec2(uAberr, 0.0)).b;
  }
  if (uGlow > 0.0) {
    vec2 px = 1.5 / uRes;
    vec4 blur = screen(uv + vec2(px.x, 0.)) + screen(uv - vec2(px.x, 0.))
              + screen(uv + vec2(0., px.y)) + screen(uv - vec2(0., px.y));
    col.rgb += blur.rgb * 0.25 * uGlow;
  }
  float scan = sin(uv.y * uRes.y * 3.14159) * 0.5 + 0.5;
  col.rgb *= 1.0 - uScan * (1.0 - scan) * 0.9;
  col.rgb *= 1.0 - uVig * length(vUv - 0.5) * 1.4;
  col.rgb *= 1.0 + uFlicker * sin(uTime * 120.0);
  col.rgb += (rand(uv + fract(uTime)) - 0.5) * uNoise;
  gl_FragColor = vec4(col.rgb, 1.0);
}`;

export class ScreenFX {
  constructor(canvas) {
    const gl = (this.gl = canvas.getContext('webgl', { antialias: false }));
    if (!gl) return;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('[neku fx] ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = (this.prog = gl.createProgram());
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const name of ['u3d', 'u2d', 'uTime', 'uCurve', 'uScan', 'uVig', 'uFlicker', 'uNoise', 'uGlow', 'uAberr', 'uRes', 'uHas3d'])
      this.u[name] = gl.getUniformLocation(p, name);
    this.tex3d = this._makeTex(0);
    this.tex2d = this._makeTex(1);
    gl.uniform1i(this.u.u3d, 0);
    gl.uniform1i(this.u.u2d, 1);
  }

  _makeTex(unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  render(canvas3d, canvas2d, time, fx, outW, outH) {
    const gl = this.gl;
    if (!gl) return;
    const out = gl.canvas;
    const w = outW || canvas2d.width, h = outH || canvas2d.height;
    if (out.width !== w || out.height !== h) {
      out.width = w;
      out.height = h;
    }
    gl.viewport(0, 0, out.width, out.height);
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex3d);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const has3d = canvas3d && canvas3d.width > 0;
    if (has3d) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas3d);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex2d);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);

    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uCurve, fx.curvature ?? 0.07);
    gl.uniform1f(this.u.uScan, fx.scanlines ?? 0.35);
    gl.uniform1f(this.u.uVig, fx.vignette ?? 0.35);
    gl.uniform1f(this.u.uFlicker, fx.flicker ?? 0.02);
    gl.uniform1f(this.u.uNoise, fx.noise ?? 0.04);
    gl.uniform1f(this.u.uGlow, fx.glow ?? 0.25);
    gl.uniform1f(this.u.uAberr, fx.aberration ?? 0.0015);
    gl.uniform1f(this.u.uHas3d, has3d ? 1 : 0);
    gl.uniform2f(this.u.uRes, out.width, out.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
