#!/usr/bin/env node
// Rebuilds the pinned vendor bundles. Build-time tool only (like build-desktop):
// nothing users run has npm dependencies — the output is committed to /vendor.
//
//   node tools/build-vendor.js          # rebuilds vendor/three.js
//
// three.js bundle = three core + OrbitControls + TransformControls + GLTFLoader,
// pinned to the version below. Bump deliberately; the engine and Studio share it.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const THREE_VERSION = '0.166.1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(os.tmpdir(), 'neku-vendor-build');

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'neku-vendor', private: true }));
writeFileSync(join(work, 'entry.js'), `
export * from 'three';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { TransformControls } from 'three/addons/controls/TransformControls.js';
export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
`);

console.log(`— installing three@${THREE_VERSION} (build-time only)`);
execSync(`npm install --no-save --silent three@${THREE_VERSION}`, { cwd: work, stdio: 'inherit' });

console.log('— bundling with esbuild');
execSync(
  `npx --yes esbuild entry.js --bundle --format=esm --minify --outfile=three.bundle.js`,
  { cwd: work, stdio: 'inherit' }
);

copyFileSync(join(work, 'three.bundle.js'), join(root, 'vendor', 'three.js'));
const kb = (statSync(join(root, 'vendor', 'three.js')).size / 1024).toFixed(0);
console.log(`vendor/three.js rebuilt — ${kb} KB (three ${THREE_VERSION} + Orbit/Transform controls + GLTFLoader) >w<`);
