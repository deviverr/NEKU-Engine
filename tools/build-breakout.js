#!/usr/bin/env node
// Generates projects/neku-breakout.json — the pure-2D sample.
// Exercises: physics (dynamic ball, static walls/paddle, onCollide),
// runtime spawning (bricks), particles, synth SFX, pointer input.
// Being 2D-only, it exports flattened: the whole game in a ~45 KB HTML file.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const n = (type, props = {}, children = []) => ({ type, ...props, ...(children.length ? { children } : {}) });

const W = 480, H = 640;

const sceneRoot = n('Node', { name: 'Main', script: 'Breakout.js' }, [
  // arena walls (static bodies just outside the visible edge)
  n('Rect', { name: 'WallL', x: -12, y: H / 2, w: 24, h: H * 2, color: '#232842', body: 'static' }),
  n('Rect', { name: 'WallR', x: W + 12, y: H / 2, w: 24, h: H * 2, color: '#232842', body: 'static' }),
  n('Rect', { name: 'WallT', x: W / 2, y: -12, w: W * 2, h: 24, color: '#232842', body: 'static' }),

  n('Rect', { name: 'Paddle', x: W / 2, y: 596, w: 92, h: 14, color: '#29e6c4', radius: 7, body: 'static' }),
  n('Circle', { name: 'Ball', x: W / 2, y: 560, radius: 8, color: '#ffd700', body: 'dynamic', gravityScale: 0, bounce: 1, script: 'Ball.js' }),

  n('Label', { name: 'Score', x: 14, y: 24, text: 'SCORE 0', size: 18, bold: true, color: '#29e6c4', align: 'left', font: 'monospace' }),
  n('Label', { name: 'Lives', x: W - 14, y: 24, text: '♥♥♥', size: 18, color: '#ff5c9e', align: 'right' }),
  n('Label', { name: 'Msg', x: W / 2, y: 380, text: 'CLICK TO SERVE', size: 24, bold: true, color: '#f5f0ff', font: 'monospace' }),

  n('Particles', { name: 'Chips', x: 0, y: 0, gravity: 500 }),
]);

const Breakout = `
// NEKU BREAKOUT — bricks are spawned from code, so restart is one call.
const COLORS = ['#ff5c9e', '#ffcb47', '#29e6c4', '#4ade80', '#5fa8e0'];
let score = 0, lives = 3, bricksLeft = 0, playing = false, over = false;

function ready() {
  buildBricks();
  game.on('brick', (brick) => {
    score += 10;
    bricksLeft--;
    game.find('Score').text = 'SCORE ' + score;
    const p = game.find('Chips');
    p.x = brick.x; p.y = brick.y;
    p.burst(12, { colors: [brick.color], up: -60, life: 0.8, maxSpeed: 260 });
    game.audio.play(bricksLeft % 5 === 0 ? 'coin' : 'tick');
    if (bricksLeft <= 0) win();
  });
  game.on('ball-lost', () => {
    lives--;
    game.find('Lives').text = '♥'.repeat(Math.max(0, lives));
    game.audio.play('lose');
    if (lives <= 0) gameOver();
    else { playing = false; say('CLICK TO SERVE'); resetBall(); }
  });
}

function buildBricks() {
  bricksLeft = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      game.spawn('Main', 'Rect', {
        name: 'Brick_' + r + '_' + c,
        x: 44 + c * 56, y: 70 + r * 26,
        w: 48, h: 18, radius: 3,
        color: COLORS[r], body: 'static',
      });
      bricksLeft++;
    }
  }
}

function say(msg) { const m = game.find('Msg'); m.text = msg; m.visible = true; }

function resetBall() {
  const b = game.find('Ball');
  b.x = game.find('Paddle').x; b.y = 560; b.vx = 0; b.vy = 0;
}

function onInput(e) {
  if (e.type === 'pointermove') {
    const p = game.find('Paddle');
    p.x = game.clamp(e.x, p.w / 2, ${W} - p.w / 2);
    if (!playing && !over) game.find('Ball').x = p.x;
  }
  if (e.type === 'pointerdown') {
    if (over) { restart(); return; }
    if (!playing) {
      playing = true;
      game.find('Msg').visible = false;
      const b = game.find('Ball');
      b.vx = game.rand(-120, 120); b.vy = -400;
      game.audio.play('pop');
    }
  }
}

function update() {
  const b = game.find('Ball');
  if (playing && b.y > ${H} + 30) game.emit('ball-lost');
}

function win() { over = true; playing = false; say('YOU WIN! CLICK TO RESTART'); game.audio.play('jackpot'); }
function gameOver() { over = true; playing = false; say('GAME OVER — CLICK TO RESTART'); }

function restart() {
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) game.find('Brick_' + r + '_' + c)?.destroy();
  score = 0; lives = 3; over = false; playing = false;
  game.find('Score').text = 'SCORE 0';
  game.find('Lives').text = '♥♥♥';
  say('CLICK TO SERVE');
  resetBall();
  buildBricks();
}
`.trim();

const Ball = `
// Keeps speed constant and converts paddle/brick hits into gameplay.
const SPEED = 430;

function update(dt) {
  const len = Math.hypot(self.vx || 0, self.vy || 0);
  if (len > 1) {
    // steady arcade speed + never perfectly horizontal
    self.vx = (self.vx / len) * SPEED;
    self.vy = (self.vy / len) * SPEED;
    if (Math.abs(self.vy) < 60) self.vy = (self.vy < 0 ? -1 : 1) * 60;
  }
}

function onCollide(other, side) {
  if (!other) return;
  if (other.name === 'Paddle') {
    // hit position controls the return angle
    self.vx = (self.x - other.x) * 7;
    self.vy = -Math.abs(self.vy);
    game.audio.play('pop');
  } else if (other.name.startsWith('Brick_')) {
    other.destroy();
    game.emit('brick', other);
  } else {
    game.audio.play('tick');
  }
}
`.trim();

const project = {
  name: 'Neku Breakout',
  engine: 'neku-0.2',
  settings: { width: W, height: H, background: '#12152b', pixelated: true, physics: { gravity: 0 } },
  mainScene: 'Main',
  scenes: [{ name: 'Main', root: sceneRoot }],
  scripts: { 'Breakout.js': Breakout, 'Ball.js': Ball },
  assets: {},
  anims: {},
  prefabs: {},
};

mkdirSync(join(root, 'projects'), { recursive: true });
const out = join(root, 'projects', 'neku-breakout.json');
writeFileSync(out, JSON.stringify(project, null, 2));
console.log('wrote', out, (readFileSync(out).length / 1024).toFixed(1) + ' KB');
