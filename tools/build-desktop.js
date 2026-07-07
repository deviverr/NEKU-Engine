#!/usr/bin/env node
// Builds Neku Studio desktop apps for macOS / Windows / Linux via Neutralino.
//
//   npm run desktop
//
// Output: dist/desktop/NekuStudio-{macos,windows,linux}.zip
// The Neutralino CLI is a build-time tool only (like esbuild for vendoring);
// nothing users run has npm dependencies.

import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync, chmodSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desk = join(root, 'desktop');
const res = join(desk, 'resources');
const out = join(root, 'dist', 'desktop');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';
const run = (cmd, cwd = desk) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('— staging resources');
rmSync(res, { recursive: true, force: true });
mkdirSync(res, { recursive: true });
for (const dir of ['editor', 'engine', 'vendor', 'projects']) cpSync(join(root, dir), join(res, dir), { recursive: true });
copyFileSync(join(root, 'play.html'), join(res, 'play.html'));
cpSync(join(desk, 'icons'), join(res, 'icons'), { recursive: true });

console.log('— neutralino update (binaries + client lib)');
if (!existsSync(join(desk, 'bin'))) run('npx --yes @neutralinojs/neu@11 update');
else run('npx --yes @neutralinojs/neu@11 update');

console.log('— neutralino build');
rmSync(join(desk, 'dist'), { recursive: true, force: true });
run('npx --yes @neutralinojs/neu@11 build');

const built = join(desk, 'dist', 'neku-studio');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---- macOS: proper .app bundle with icns -----------------------------------
console.log('— packaging macOS .app');
const app = join(out, 'mac', 'Neku Studio.app');
const macOSDir = join(app, 'Contents', 'MacOS');
const resDir = join(app, 'Contents', 'Resources');
mkdirSync(macOSDir, { recursive: true });
mkdirSync(resDir, { recursive: true });
copyFileSync(join(built, 'neku-studio-mac_universal'), join(macOSDir, 'neku-studio'));
chmodSync(join(macOSDir, 'neku-studio'), 0o755);
copyFileSync(join(built, 'resources.neu'), join(macOSDir, 'resources.neu'));
writeFileSync(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Neku Studio</string>
  <key>CFBundleDisplayName</key><string>Neku Studio</string>
  <key>CFBundleIdentifier</key><string>dev.deviverr.neku</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleExecutable</key><string>neku-studio</string>
  <key>CFBundleIconFile</key><string>cwat.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleDocumentTypes</key><array><dict>
    <key>CFBundleTypeName</key><string>Neku Project</string>
    <key>CFBundleTypeExtensions</key><array><string>neku</string><string>nk</string></array>
    <key>CFBundleTypeRole</key><string>Editor</string>
  </dict></array>
</dict></plist>
`);
if (os.platform() === 'darwin') {
  const iconset = join(desk, 'cwat.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset);
  const sizes = { 16: 'icon-16', 32: 'icon-32', 128: 'icon-128', 256: 'icon-256', 512: 'icon-512' };
  for (const [px, src] of Object.entries(sizes)) {
    copyFileSync(join(desk, 'icons', src + '.png'), join(iconset, `icon_${px}x${px}.png`));
    const at2 = px * 2;
    if (existsSync(join(desk, 'icons', `icon-${at2}.png`)))
      copyFileSync(join(desk, 'icons', `icon-${at2}.png`), join(iconset, `icon_${px}x${px}@2x.png`));
  }
  run(`iconutil -c icns -o "${join(resDir, 'cwat.icns')}" "${iconset}"`, root);
  rmSync(iconset, { recursive: true, force: true });
}
writeFileSync(join(out, 'mac', 'HOW-TO-RUN.txt'),
  `Neku Studio (macOS)\n1. Unzip. 2. Right-click "Neku Studio.app" -> Open (unsigned build, first launch only).\n>w<\n`);
run(`cd "${join(out, 'mac')}" && zip -qry "${join(out, 'NekuStudio-macos.zip')}" .`, out);

// ---- Windows ---------------------------------------------------------------
console.log('— packaging Windows');
const winDir = join(out, 'win');
mkdirSync(winDir, { recursive: true });
copyFileSync(join(built, 'neku-studio-win_x64.exe'), join(winDir, 'NekuStudio.exe'));
copyFileSync(join(built, 'resources.neu'), join(winDir, 'resources.neu'));
writeFileSync(join(winDir, 'HOW-TO-RUN.txt'),
  `Neku Studio (Windows x64)\n1. Unzip BOTH files into one folder. 2. Run NekuStudio.exe.\nNeeds Microsoft Edge WebView2 (preinstalled on Win 10/11; otherwise: https://go.microsoft.com/fwlink/p/?LinkId=2124703)\n>w<\n`);
run(`cd "${winDir}" && zip -qry "${join(out, 'NekuStudio-windows.zip')}" .`, out);

// ---- Linux -----------------------------------------------------------------
console.log('— packaging Linux');
const linDir = join(out, 'linux');
mkdirSync(linDir, { recursive: true });
copyFileSync(join(built, 'neku-studio-linux_x64'), join(linDir, 'neku-studio'));
chmodSync(join(linDir, 'neku-studio'), 0o755);
copyFileSync(join(built, 'resources.neu'), join(linDir, 'resources.neu'));
copyFileSync(join(desk, 'icons', 'icon-512.png'), join(linDir, 'neku-studio.png'));
writeFileSync(join(linDir, 'HOW-TO-RUN.txt'),
  `Neku Studio (Linux x64)\n1. Unzip both files into one folder. 2. chmod +x neku-studio (if needed). 3. ./neku-studio\nNeeds webkit2gtk (Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-0)\n>w<\n`);
run(`cd "${linDir}" && zip -qry "${join(out, 'NekuStudio-linux.zip')}" .`, out);

for (const d of ['mac', 'win', 'linux']) rmSync(join(out, d), { recursive: true, force: true });
console.log('\ndone — dist/desktop/NekuStudio-{macos,windows,linux}.zip  >w<');
