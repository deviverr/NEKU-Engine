#!/usr/bin/env node
// Generates the cwat mascot (the >w< cat from deviverr/cwat) as:
//   editor/cwat.svg            — crisp at any size, used across the Studio UI
//   desktop/icons/icon-*.png   — app icons (zero-dep PNG encoder, node:zlib)
//
// The cat is authored as a 16×16 pixel map below — edit it like text art.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- the cwat ------------------------------------------------------------
// . transparent · O outline · F fur · P pink (inner ear) · E eyes/mouth · L light muzzle

const PIXELS = [
  '..O..........O..',
  '.OFO........OFO.',
  '.OFPO......OPFO.',
  '.OFFOOOOOOOOFFO.',
  '.OFFFFFFFFFFFFO.',
  '.OFFFFFFFFFFFFO.',
  '.OFEFFFFFFFFEFO.',
  '.OFFEFFFFFFEFFO.',
  '.OFEFFFFFFFFEFO.',
  '.OPFFFEFEFEFFPO.',
  '.OFFFFFEFEFFFFO.',
  '.OFFFFFFFFFFFFO.',
  '..OFFFFFFFFFFO..',
  '...OOOOOOOOOO...',
  '................',
  '................',
];

const COLORS = {
  O: [26, 16, 35, 255],     // outline #1a1023
  F: [142, 108, 242, 255],  // fur #8e6cf2
  P: [255, 92, 158, 255],   // pink #ff5c9e
  E: [26, 16, 35, 255],     // eyes/mouth
  L: [230, 225, 245, 255],  // muzzle #e6e1f5
  '.': [0, 0, 0, 0],
};

const SIZE = 16;

// ---- SVG -------------------------------------------------------------------

function toSvg() {
  const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  let rects = '';
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = PIXELS[y][x];
      if (ch === '.') continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(COLORS[ch])}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>\n`;
}

// ---- PNG (RGBA8, zero deps) -----------------------------------------------

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

function toPng(scale) {
  const w = SIZE * scale, h = SIZE * scale;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const c = COLORS[PIXELS[(y / scale) | 0][(x / scale) | 0]];
      c.forEach((v, i) => (raw[row + 1 + x * 4 + i] = v));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
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
  const px = SIZE * scale;
  writeFileSync(join(root, 'desktop', 'icons', `icon-${px}.png`), toPng(scale));
}
console.log('wrote editor/cwat.svg + desktop/icons/icon-{16..1024}.png  >w<');
