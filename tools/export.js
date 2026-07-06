#!/usr/bin/env node
// CLI export: bundle a project + engine into ONE playable .html file.
//
//   node tools/export.js projects/casino-calculator.json [out.html]

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleEngine, buildExportHtml } from '../engine/bundler.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectPath = process.argv[2];
if (!projectPath) {
  console.error('usage: node tools/export.js <project.json> [out.html]');
  process.exit(1);
}

const project = JSON.parse(await readFile(projectPath, 'utf8'));
const engineJs = await bundleEngine((f) => readFile(join(root, 'engine', f), 'utf8'));
const html = buildExportHtml(engineJs, project);
const out = process.argv[3] || projectPath.replace(/\.json$/, '') + '.html';
await writeFile(out, html);
console.log(`exported ${basename(out)} — ${(html.length / 1024).toFixed(1)} KB, zero dependencies, runs anywhere`);
