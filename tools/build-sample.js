#!/usr/bin/env node
// Generates projects/casino-calculator.json — the flagship sample game.
// Building the scene tree in JS keeps it reviewable; the output JSON is
// what the engine and editor actually consume.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const W = 480, H = 720;

// --- Scene tree ---------------------------------------------------------

const n = (type, props = {}, children = []) => ({ type, ...props, ...(children.length ? { children } : {}) });

const keyRows = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['C', '0', '.', '+'],
];

const keypad = [];
const KEY_W = 96, KEY_H = 64, GAP = 14;
keyRows.forEach((row, r) => {
  row.forEach((key, c) => {
    const isOp = '÷×−+C'.includes(key);
    keypad.push(
      n('Button', {
        name: 'key_' + key,
        x: (c - 1.5) * (KEY_W + GAP),
        y: r * (KEY_H + GAP),
        w: KEY_W,
        h: KEY_H,
        text: key,
        textSize: 26,
        radius: 14,
        color: key === 'C' ? '#b5443c' : isOp ? '#c9922a' : '#1f5c46',
        strokeColor: 'rgba(0,0,0,0.25)',
        strokeWidth: 2,
        sound: 'tick',
      })
    );
  });
});

const sceneRoot = n('Node', { name: 'Main', script: 'Calculator.js' }, [
  // --- 3D backdrop: dim golden coin spinning behind the UI ---
  n('Camera3D', { name: 'Camera', x: 0, y: 0.4, z: 7, ty: 0.2, fov: 45 }),
  n('Light3D', { name: 'Sun', dx: 0.4, dy: 1, dz: 0.9, ambient: 0.4 }),
  n('Mesh3D', {
    name: 'Coin',
    script: 'Coin3D.js',
    shape: 'cylinder',
    radius: 1.5,
    h: 0.16,
    segments: 40,
    color: '#8f6f1e',
    x: 0, y: 1.1, z: -1,
    rx: 90,
  }),
  n('Mesh3D', { name: 'CoinCore', shape: 'cylinder', radius: 0.95, h: 0.2, segments: 32, color: '#b08e2e', x: 0, y: 1.1, z: -1, rx: 90 }),

  // --- Header ---
  n('Label', { name: 'Title', x: W / 2, y: 40, text: 'CASINO CALCULATOR', size: 24, bold: true, color: '#f6d566', shadow: 'rgba(0,0,0,0.5)' }),
  n('Label', { name: 'Tagline', x: W / 2, y: 66, text: 'every answer is a gamble', size: 13, color: '#9db8a8' }),
  n('Label', { name: 'Coins', x: W - 14, y: 106, text: '🪙 100', size: 18, bold: true, color: '#ffd700', align: 'right' }),

  // --- Display panel ---
  n('Node', { name: 'DisplayPanel', x: W / 2, y: 210 }, [
    n('Rect', { name: 'DisplayBg', w: 420, h: 110, color: '#08130d', radius: 18, strokeColor: '#c9922a', strokeWidth: 3 }),
    n('Label', { name: 'Display', y: -14, text: '0', size: 44, bold: true, color: '#7dffab', font: 'ui-monospace, monospace' }),
    n('Label', { name: 'Verdict', y: 34, text: 'place your bets', size: 15, color: '#9db8a8' }),
  ]),

  // --- Keypad ---
  n('Node', { name: 'Keypad', x: W / 2, y: 330 }, keypad),

  // --- The lever: equals is a big slot-machine pull ---
  n('Button', {
    name: 'key_=',
    x: W / 2,
    y: 650,
    w: 420,
    h: 62,
    text: '=  PULL THE LEVER  =',
    textSize: 24,
    radius: 18,
    color: '#8e2f4f',
    strokeColor: '#f6d566',
    strokeWidth: 3,
    sound: 'whoosh',
  }),

  // --- Juice ---
  n('Particles', { name: 'CoinRain', x: W / 2, y: -10, color: '#ffd700' }),
]);

// --- Scripts ------------------------------------------------------------

const Calculator = `
// Casino Calculator — the house always wins (except when it doesn't).
let expr = '';
let coins = 100;
let spinning = false;

const display = () => game.find('Display');
const verdict = () => game.find('Verdict');

function ready() {
  game.on('button', (name) => {
    if (!name.startsWith('key_') || spinning) return;
    press(name.slice(4));
  });
}

function setExpr(s) {
  expr = s.slice(0, 14);
  const d = display();
  d.text = expr === '' ? '0' : expr;
  d.color = '#7dffab';
}

function press(key) {
  if (key === 'C') { setExpr(''); say('cleared. coward.'); return; }
  if (key === '=') { pull(); return; }
  setExpr(expr + key);
}

function say(msg, color) {
  const v = verdict();
  v.text = msg;
  v.color = color || '#9db8a8';
}

function evaluate(src) {
  const js = src.replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-');
  if (!/^[0-9+\\-*/. ]+$/.test(js)) return null;
  try {
    const val = Function('"use strict";return (' + js + ')')();
    return Number.isFinite(val) ? Math.round(val * 10000) / 10000 : null;
  } catch { return null; }
}

function pull() {
  const answer = evaluate(expr);
  if (answer === null) { say('that is not math, friend', '#ff8a8a'); game.audio.play('lose'); return; }

  spinning = true;
  game.audio.play('spin');
  say('spinning...', '#f6d566');
  game.emit('coin-spin', 3);

  // Slot-machine shuffle on the display before the verdict lands.
  let flickers = 12;
  const flick = game.every(0.07, () => {
    display().text = String(game.randInt(0, 999));
    game.audio.play('tick');
    if (--flickers <= 0) { flick(); settle(answer); }
  });
}

function settle(answer) {
  const roll = Math.random();
  const d = display();

  if (roll < 0.02) {
    // JACKPOT — your answer is 777 now. Deal with it.
    d.text = '777';
    d.color = '#ffd700';
    say('JACKPOT!! math is cancelled', '#ffd700');
    game.audio.play('jackpot');
    addCoins(+250);
    game.find('CoinRain').burst(80, { colors: ['#ffd700', '#f6d566', '#fff2b0'], up: -80, maxSpeed: 320, life: 2.2 });
    game.emit('coin-spin', 14);
    shake(14);
  } else if (roll < 0.17) {
    // Double or nothing — house feels generous.
    d.text = String(answer * 2);
    d.color = '#7dffab';
    say('DOUBLE WIN — answer × 2, no refunds', '#7dffab');
    game.audio.play('win');
    addCoins(+40);
    game.find('CoinRain').burst(25, { colors: ['#7dffab', '#ffd700'], up: -60, life: 1.4 });
  } else if (roll < 0.32) {
    // So close. Off by a smidge.
    const off = game.pick([-3, -2, -1, 1, 2, 3]);
    d.text = String(answer + off);
    d.color = '#ff8a8a';
    say('so close... (house rounding: ' + (off > 0 ? '+' : '') + off + ')', '#ff8a8a');
    game.audio.play('lose');
    addCoins(-15);
    shake(8);
  } else {
    // Boring old correct answer.
    d.text = String(answer);
    d.color = '#7dffab';
    say('correct. how disappointing.', '#9db8a8');
    game.audio.play('coin');
    addCoins(+10);
  }

  expr = '';
  spinning = false;
}

function addCoins(delta) {
  coins = Math.max(0, coins + delta);
  const label = game.find('Coins');
  label.text = '🪙 ' + coins;
  game.tween(label, { scaleX: 1.35, scaleY: 1.35 }, { duration: 0.1, onDone: () =>
    game.tween(label, { scaleX: 1, scaleY: 1 }, { duration: 0.25, easing: 'backOut' }) });
  if (coins === 0) say('you are broke. the calculator thanks you.', '#ff8a8a');
}

function shake(power) {
  const panel = game.find('DisplayPanel');
  const ox = panel.x;
  let hits = 6;
  const t = game.every(0.04, () => {
    panel.x = ox + game.rand(-power, power);
    if (--hits <= 0) { t(); panel.x = ox; }
  });
}
`.trim();

const Coin3D = `
// Golden coin: idles lazily, goes berserk on wins.
let speed = 40;

function ready() {
  game.on('coin-spin', (mult) => { speed = 40 * mult; });
}

function update(dt) {
  self.ry += speed * dt;
  self.rz = Math.sin(game.time * 0.8) * 8;
  // Ease back down to idle spin.
  speed += (40 - speed) * dt * 0.8;
  // Keep the inner core glued to the outer ring.
  const core = game.find('CoinCore');
  core.ry = self.ry;
  core.rz = self.rz;
}
`.trim();

// --- Project ------------------------------------------------------------

const project = {
  name: 'Casino Calculator',
  engine: 'cce-0.1',
  settings: { width: W, height: H, background: '#0a3d2e' },
  mainScene: 'Main',
  scenes: [{ name: 'Main', root: sceneRoot }],
  scripts: { 'Calculator.js': Calculator, 'Coin3D.js': Coin3D },
  assets: {},
};

mkdirSync(join(root, 'projects'), { recursive: true });
const out = join(root, 'projects', 'casino-calculator.json');
writeFileSync(out, JSON.stringify(project, null, 2));
console.log('wrote', out, (readFileSync(out).length / 1024).toFixed(1) + ' KB');
