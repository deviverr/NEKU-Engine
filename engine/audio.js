// CCE audio — WebAudio synth. All sound effects are generated in code,
// so games ship with zero audio files.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
    this.muted = false;
  }

  // Browsers require a user gesture before audio can start.
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  tone({ freq = 440, type = 'sine', duration = 0.15, delay = 0, slide = 0, gain = 0.6 }) {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  noise({ duration = 0.2, delay = 0, gain = 0.4, filter = 1800 }) {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, (duration * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  // Named presets so game scripts can just do game.audio.play('coin').
  play(name) {
    const p = AudioEngine.presets[name];
    if (p) p(this);
    else console.warn(`[cce] unknown sound: "${name}"`);
  }
}

AudioEngine.presets = {
  click: (a) => a.tone({ freq: 700, type: 'square', duration: 0.05, gain: 0.25 }),
  tick: (a) => a.tone({ freq: 1100, type: 'square', duration: 0.03, gain: 0.15 }),
  pop: (a) => a.tone({ freq: 320, type: 'sine', duration: 0.09, slide: 260, gain: 0.5 }),
  coin: (a) => {
    a.tone({ freq: 988, type: 'square', duration: 0.09, gain: 0.3 });
    a.tone({ freq: 1319, type: 'square', duration: 0.22, delay: 0.08, gain: 0.3 });
  },
  win: (a) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      a.tone({ freq: f, type: 'triangle', duration: 0.18, delay: i * 0.09, gain: 0.4 })
    );
  },
  lose: (a) => {
    a.tone({ freq: 300, type: 'sawtooth', duration: 0.25, slide: -140, gain: 0.35 });
    a.tone({ freq: 220, type: 'sawtooth', duration: 0.4, delay: 0.2, slide: -120, gain: 0.35 });
  },
  jackpot: (a) => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
      a.tone({ freq: f, type: 'square', duration: 0.16, delay: i * 0.07, gain: 0.35 })
    );
    for (let i = 0; i < 8; i++)
      a.tone({ freq: 900 + Math.random() * 900, type: 'square', duration: 0.08, delay: 0.5 + i * 0.06, gain: 0.2 });
  },
  spin: (a) => a.noise({ duration: 0.35, gain: 0.2, filter: 900 }),
  whoosh: (a) => a.noise({ duration: 0.25, gain: 0.3, filter: 2500 }),
};
