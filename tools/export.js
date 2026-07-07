#!/usr/bin/env node
// Neku CLI export: bundle a project into ONE playable .html file —
// or an itch.io-ready .zip with --zip.
// 2D-only projects flatten tiny; 3D projects embed Three.js via import map.
//
//   node tools/export.js projects/neku-arcade.json [out.html]
//   node tools/export.js projects/neku-arcade.json --zip [out.zip]

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExport, buildZip } from '../engine/bundler.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const zip = args.includes('--zip');
const [projectPath, outArg] = args.filter((a) => a !== '--zip');
if (!projectPath) {
  console.error('usage: node tools/export.js <project.json> [--zip] [out]');
  process.exit(1);
}

const project = JSON.parse(await readFile(projectPath, 'utf8'));
const getFile = (path) => readFile(join(root, path), 'utf8');

if (zip) {
  const bytes = await buildZip(project, getFile);
  const out = outArg || projectPath.replace(/\.json$/, '') + '.zip';
  await writeFile(out, bytes);
  console.log(`exported ${basename(out)} — ${(bytes.length / 1024).toFixed(1)} KB, upload straight to itch.io (HTML game)`);
} else {
  const html = await buildExport(project, getFile);
  const out = outArg || projectPath.replace(/\.json$/, '') + '.html';
  await writeFile(out, html);
  console.log(`exported ${basename(out)} — ${(html.length / 1024).toFixed(1)} KB, single file, runs anywhere`);
}
