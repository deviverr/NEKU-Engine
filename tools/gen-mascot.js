#!/usr/bin/env node
// Generates the cwat mascot — decoded straight from assets/cwat-ascii.txt.
// Each half-block char (▄ ▀ █) is one column × two pixel rows, so the mascot
// is the attached ASCII art rather than a redrawn approximation.
//
//   editor/cwat.svg            — UI mascot (transparent, crisp at any size)
//   desktop/icons/icon-*.png   — app icons (zero-dep PNG encoder, node:zlib)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- the official cwat (face #1 of cwat-ascii.txt) ------------------------

const SOURCE = readFileSync(join(root, 'assets', 'cwat-ascii.txt'), 'utf8')
  .replace(/\r/g, '')
  .split('\n');

const ASCII = SOURCE
  .filter((line) => /[▄▀█]/.test(line))
  .slice(0, 5)
  .map((line) => line.slice(0, 15).trimEnd());

// Half-block chars -> [top pixel, bottom pixel]
const HALF = { '▄': [0, 1], '▀': [1, 0], '█': [1, 1], ' ': [0, 0] };

function decode(lines) {
  const w = Math.max(...lines.map((l) => [...l].length));
  const grid = []; // rows of 0/1
  for (const line of lines) {
    const top = [], bot = [];
    for (let x = 0; x < w; x++) {
      const [t, b] = HALF[[...line][x] || ' '] || [0, 0];
      top.push(t);
      bot.push(b);
    }
    grid.push(top, bot);
  }
  return grid; // w × lines.length*2
}

const FACE = decode(ASCII); // 15 × 10
const FW = FACE[0].length, FH = FACE.length;

// Canvas: 16×16 with the face centered.
const SIZE = 16, OX = Math.floor((SIZE - FW) / 2), OY = 3;
const NOSE = { x: 7, y: 7 };

const INK = [142, 108, 242, 255];   // lavender #8e6cf2
const PINK = [255, 92, 158, 255];   // nose #ff5c9e
const BG = [26, 16, 35, 255];       // icon plate #1a1023

function pixelAt(x, y) {
  const fx = x - OX, fy = y - OY;
  if (fx < 0 || fy < 0 || fx >= FW || fy >= FH || !FACE[fy][fx]) return null;
  return fx === NOSE.x && fy === NOSE.y ? PINK : INK;
}

// ---- SVG (transparent background, for the Studio UI) ----------------------

function toSvg() {
  const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  let rects = '';
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const c = pixelAt(x, y);
      if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(c)}"/>`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>\n`;
}

// ---- PNG icons (dark rounded plate so they read on any wallpaper) ---------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Pixel-rounded plate: skip 2px corners at 16×16 scale.
function plateAt(x, y) {
  const d = (a, b) => Math.min(a, b);
  const cx = d(x, SIZE - 1 - x), cy = d(y, SIZE - 1 - y);
  return !(cx === 0 && cy < 2) && !(cy === 0 && cx < 2) && !(cx === 1 && cy === 0) && !(cx === 0 && cy === 1) ? BG : null;
}

function toPng(scale, withPlate) {
  const w = SIZE * scale, h = SIZE * scale;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const gx = (x / scale) | 0, gy = (y / scale) | 0;
      const c = pixelAt(gx, gy) || (withPlate ? plateAt(gx, gy) : null) || [0, 0, 0, 0];
      c.forEach((v, i) => (raw[row + 1 + x * 4 + i] = v));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- write -----------------------------------------------------------------

writeFileSync(join(root, 'editor', 'cwat.svg'), toSvg());
mkdirSync(join(root, 'desktop', 'icons'), { recursive: true });
for (const scale of [1, 2, 4, 8, 16, 32, 64]) {
  writeFileSync(join(root, 'desktop', 'icons', `icon-${SIZE * scale}.png`), toPng(scale, true));
}
console.log('wrote editor/cwat.svg + desktop/icons/icon-{16..1024}.png — the real cwat >w<');
