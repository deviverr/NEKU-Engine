#!/usr/bin/env node
// Builds the GitHub Pages payload for the hosted browser Studio.
//
// Output: dist/pages

import { cpSync, rmSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'pages');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const dir of ['editor', 'engine', 'vendor', 'projects', 'docs']) {
  cpSync(join(root, dir), join(out, dir), { recursive: true });
}

copyFileSync(join(root, 'play.html'), join(out, 'play.html'));
copyFileSync(join(root, 'README.md'), join(out, 'README.md'));
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE'));

if (existsSync(join(root, 'dist', 'desktop'))) {
  cpSync(join(root, 'dist', 'desktop'), join(out, 'downloads', 'desktop'), { recursive: true });
}

for (const name of [
  'casino-calculator.html',
  'neku-arcade.html',
  'neku-arcade.zip',
  'neku-breakout.html',
  'neku-breakout.zip',
]) {
  const src = join(root, 'dist', name);
  if (existsSync(src)) copyFileSync(src, join(out, name));
}

writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Neku Studio</title>
<link rel="icon" href="./editor/cwat.svg" />
<meta http-equiv="refresh" content="0; url=./editor/" />
<style>
html,body{height:100%;margin:0;background:#0f0a16;color:#f7f3ff;font:16px system-ui,sans-serif;display:grid;place-items:center}
a{color:#9df5df}
</style>
</head>
<body>
<main>
  <img src="./editor/cwat.svg" alt=">w<" width="96" height="96" />
  <h1>Neku Studio</h1>
  <p><a href="./editor/">Open the hosted engine</a></p>
</main>
<script>location.replace('./editor/');</script>
</body>
</html>
`);

writeFileSync(join(out, '.nojekyll'), '');

console.log('built dist/pages — ready for GitHub Pages >w<');
