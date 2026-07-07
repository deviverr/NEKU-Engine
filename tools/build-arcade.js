#!/usr/bin/env node
// Generates projects/neku-arcade.json — the Neku 3D showcase:
// a 3D arcade cabinet whose CRT screen is a live, CLICKABLE 2D scene
// (Screen3D + uiMode "screen3d" + CRT post-FX). Same trick as the real
// Casino Calculator game, as first-class engine features.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const n = (type, props = {}, children = []) => ({ type, ...props, ...(children.length ? { children } : {}) });

const W = 960, H = 540;

// --- 2D scene: what lives on the cabinet's screen ------------------------

const ui = [
  n('Rect', { name: 'ScreenBg', x: W / 2, y: H / 2, w: W, h: H, color: '#07130b' }),
  n('Label', { name: 'Marquee2D', x: W / 2, y: 70, text: '▞▚ NEKU SLOTS ▚▞', size: 52, bold: true, color: '#29e6c4', font: 'monospace' }),
  n('Label', { name: 'Coins', x: W / 2, y: 130, text: '🪙 50', size: 30, bold: true, color: '#ffd700' }),
  n('Node', { name: 'Reels', x: W / 2, y: 265 }, [
    ...[0, 1, 2].map((i) =>
      n('Node', { name: 'ReelBox' + i, x: (i - 1) * 190 }, [
        n('Rect', { name: 'Frame' + i, w: 160, h: 160, color: '#0d241a', radius: 12, strokeColor: '#29e6c4', strokeWidth: 4 }),
        n('Label', { name: 'Reel' + i, text: '7', size: 92, bold: true, color: '#f5f0ff' }),
      ])
    ),
  ]),
  n('Button', { name: 'btnSpin', x: W / 2, y: 450, w: 320, h: 78, text: '▶ SPIN (10🪙)', textSize: 32, radius: 14, color: '#8e2f4f', strokeColor: '#ffd700', strokeWidth: 4, sound: 'whoosh' }),
  n('Label', { name: 'Verdict', x: W / 2, y: 380, text: 'insert brain to play', size: 20, color: '#7a9b8a' }),
  n('Particles', { name: 'WinBurst', x: W / 2, y: 265, color: '#ffd700' }),
];

// --- 3D scene: the room and the cabinet -----------------------------------

const world = [
  n('Camera3D', { name: 'Camera', x: 0, y: 1.55, z: 3.9, tx: 0, ty: 1.25, tz: 0, fov: 50 }),
  n('Light3D', { name: 'Fill', kind: 'ambient', intensity: 0.35 }),
  n('Light3D', { name: 'Key', kind: 'directional', x: 3, y: 6, z: 4, intensity: 1.1 }),
  n('Light3D', { name: 'Neon', kind: 'point', x: 0, y: 2.9, z: 1.2, color: '#8a5cff', intensity: 18, range: 9 }),

  n('Mesh3D', { name: 'Floor', shape: 'plane', w: 24, d: 24, color: '#14101f', roughness: 0.9 }),
  n('Mesh3D', { name: 'BackWall', shape: 'box', w: 24, h: 7, d: 0.2, x: 0, y: 3.5, z: -3.2, color: '#191426', roughness: 1 }),

  n('Node3D', { name: 'Cabinet', x: 0, y: 0, z: 0 }, [
    n('Mesh3D', { name: 'Body', shape: 'box', w: 1.5, h: 2.5, d: 0.85, y: 1.25, color: '#241d3d', roughness: 0.6 }),
    n('Mesh3D', { name: 'Bezel', shape: 'box', w: 1.34, h: 0.92, d: 0.08, y: 1.52, z: 0.41, color: '#0b0812', roughness: 0.4 }),
    n('Screen3D', { name: 'CRT', w: 1.22, h: 0.72, y: 1.52, z: 0.462, glow: 1 }),
    n('Mesh3D', { name: 'Panel', shape: 'box', w: 1.5, h: 0.3, d: 0.5, y: 0.95, z: 0.32, rx: -18, color: '#2e2549', roughness: 0.5 }),
    n('Mesh3D', { name: 'Marquee', shape: 'box', w: 1.5, h: 0.34, d: 0.3, y: 2.62, z: 0.2, color: '#1a1430', emissive: '#ff5c9e', emissiveIntensity: 1.6 }),
    n('Mesh3D', { name: 'NeonL', shape: 'box', w: 0.05, h: 2.3, d: 0.05, x: -0.79, y: 1.25, z: 0.42, color: '#0f0f18', emissive: '#29e6c4', emissiveIntensity: 2.2 }),
    n('Mesh3D', { name: 'NeonR', shape: 'box', w: 0.05, h: 2.3, d: 0.05, x: 0.79, y: 1.25, z: 0.42, color: '#0f0f18', emissive: '#29e6c4', emissiveIntensity: 2.2 }),
    n('Mesh3D', { name: 'Joystick', shape: 'sphere', radius: 0.05, x: -0.3, y: 1.12, z: 0.5, color: '#e6413c', emissive: '#e6413c', emissiveIntensity: 0.4 }),
    n('Mesh3D', { name: 'BtnA', shape: 'cylinder', radius: 0.045, h: 0.03, x: 0.18, y: 1.09, z: 0.48, rx: 18, color: '#29e6c4', emissive: '#29e6c4', emissiveIntensity: 0.8, script: 'CabButton.js' }),
    n('Mesh3D', { name: 'BtnB', shape: 'cylinder', radius: 0.045, h: 0.03, x: 0.38, y: 1.03, z: 0.54, rx: 18, color: '#ff5c9e', emissive: '#ff5c9e', emissiveIntensity: 0.8, script: 'CabButton.js' }),
  ]),

  n('Mesh3D', {
    name: 'LuckyCoin', script: 'LuckyCoin.js',
    shape: 'cylinder', radius: 0.22, h: 0.05, segments: 32,
    x: 1.35, y: 1.5, z: 0.4, rx: 90,
    color: '#e8b93b', emissive: '#8a6a10', emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3,
  }),
];

// --- Scripts --------------------------------------------------------------

const Slots = `
// NEKU SLOTS — runs on the cabinet's CRT. Click SPIN right on the 3D screen.
const SYMBOLS = ['7', '🍒', '🍋', '◆', '★'];
let coins = 50;
let spinning = false;

function ready() {
  game.on('button', (name) => { if (name === 'btnSpin') spin(); });
  game.on('cab-button', () => spin());
}

function say(msg, color) {
  const v = game.find('Verdict');
  v.text = msg;
  v.color = color || '#7a9b8a';
}

function setCoins(d) {
  coins = Math.max(0, coins + d);
  game.find('Coins').text = '🪙 ' + coins;
}

function spin() {
  if (spinning) return;
  if (coins < 10) { say('broke. the machine laughs at you.', '#ff8a8a'); game.audio.play('lose'); return; }
  spinning = true;
  setCoins(-10);
  say('...', '#ffd700');
  game.audio.play('spin');
  let flickers = 14;
  const t = game.every(0.09, () => {
    for (let i = 0; i < 3; i++) game.find('Reel' + i).text = game.pick(SYMBOLS);
    game.audio.play('tick');
    if (--flickers <= 0) { t(); settle(); }
  });
}

function settle() {
  const r = [0, 1, 2].map((i) => game.find('Reel' + i).text);
  spinning = false;
  if (r[0] === r[1] && r[1] === r[2]) {
    say('TRIPLE ' + r[0] + ' — JACKPOT!', '#ffd700');
    game.audio.play('jackpot');
    setCoins(+120);
    game.find('WinBurst').burst(70, { colors: ['#ffd700', '#29e6c4', '#ff5c9e'], up: -60, life: 1.8 });
    game.emit('jackpot3d');
  } else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) {
    say('pair! small win', '#7dffab');
    game.audio.play('coin');
    setCoins(+15);
    game.find('WinBurst').burst(18, { colors: ['#7dffab'], up: -40 });
  } else {
    say('nothing. classic.', '#7a9b8a');
    game.audio.play('pop');
  }
}
`.trim();

const LuckyCoin = `
// Floating lucky coin — click it in 3D for a free spin vibe.
let speed = 60;
let base = self.y;

function ready() {
  game.on('jackpot3d', () => { speed = 900; });
}

function update(dt) {
  self.ry += speed * dt;
  self.y = base + Math.sin(game.time * 1.4) * 0.08;
  speed += (60 - speed) * dt * 1.2;
}

function onPress() {
  speed = 700;
  game.audio.play('coin');
}
`.trim();

const CabButton = `
// Physical cabinet buttons: clicking them in 3D spins the slots.
let baseZ = self.z;

function onPress() {
  game.audio.play('click');
  self.z = baseZ - 0.012;
  game.after(0.12, () => { self.z = baseZ; });
  game.emit('cab-button');
}
`.trim();

// --- Project ---------------------------------------------------------------

const project = {
  name: 'Neku Arcade',
  engine: 'neku-0.2',
  settings: {
    width: W,
    height: H,
    background: '#0a0a12',
    uiMode: 'screen3d',
    pixelated: false,
    fx: { crt: true, curvature: 0.06, scanlines: 0.3, vignette: 0.4, flicker: 0.015, noise: 0.03, glow: 0.3, aberration: 0.0012 },
  },
  mainScene: 'Main',
  scenes: [{ name: 'Main', root: n('Node', { name: 'Main', script: 'Slots.js' }, [...world, ...ui]) }],
  scripts: { 'Slots.js': Slots, 'LuckyCoin.js': LuckyCoin, 'CabButton.js': CabButton },
  assets: {},
};

mkdirSync(join(root, 'projects'), { recursive: true });
const out = join(root, 'projects', 'neku-arcade.json');
writeFileSync(out, JSON.stringify(project, null, 2));
console.log('wrote', out, (readFileSync(out).length / 1024).toFixed(1) + ' KB');
