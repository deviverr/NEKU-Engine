#!/usr/bin/env node
// CLI twin of Studio's Export → Desktop apps.
//
//   node tools/export-desktop.js projects/neku-breakout.json [outDir]
//
// Produces <slug>-{macos,windows,linux}.zip using the player binaries in
// /desktop/player. Zero dependencies.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesktopApps } from '../engine/desktop-export.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , projectPath, outDir = 'dist'] = process.argv;

if (!projectPath) {
  console.error('usage: node tools/export-desktop.js <project.neku|.json> [outDir]');
  process.exit(1);
}

const project = JSON.parse(await readFile(projectPath, 'utf8'));
const getFile = (p) => readFile(join(root, p), 'utf8');
const getBytes = async (p) => new Uint8Array(await readFile(join(root, p)));

const zips = await buildDesktopApps(project, getFile, getBytes, (m) => console.log('  ' + m));
await mkdir(join(root, outDir), { recursive: true });
for (const z of zips) {
  await writeFile(join(root, outDir, z.name), z.bytes);
  console.log(`${outDir}/${z.name} — ${(z.bytes.length / 1048576).toFixed(1)} MB`);
}
console.log('desktop game export done >w<');
