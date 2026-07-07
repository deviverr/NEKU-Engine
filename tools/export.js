#!/usr/bin/env node
// Neku CLI export: bundle a project into ONE playable .html file.
// 2D-only projects flatten tiny; 3D projects embed Three.js via import map.
//
//   node tools/export.js projects/neku-arcade.json [out.html]

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExport } from '../engine/bundler.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectPath = process.argv[2];
if (!projectPath) {
  console.error('usage: node tools/export.js <project.json> [out.html]');
  process.exit(1);
}

const project = JSON.parse(await readFile(projectPath, 'utf8'));
const html = await buildExport(project, (path) => readFile(join(root, path), 'utf8'));
const out = process.argv[3] || projectPath.replace(/\.json$/, '') + '.html';
await writeFile(out, html);
console.log(`exported ${basename(out)} — ${(html.length / 1024).toFixed(1)} KB, single file, runs anywhere`);
