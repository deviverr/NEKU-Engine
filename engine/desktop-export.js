// Neku desktop game export — wraps an exported game in the Neutralino shell,
// producing runnable apps for macOS / Windows / Linux, straight from the
// Studio (browser or desktop) with zero tooling installed.
//
// A Neutralino app is: player binary + resources.neu (an asar archive holding
// neutralino.config.json and the web resources). We write the asar ourselves —
// the format is a 16-byte pickle header, a JSON index, then raw file bytes.
//
// Player binaries ship in /desktop/player (repo + GitHub Pages), fetched via
// the getBytes callback so this works from any Studio.

import { buildExport, makeZip } from './bundler.js';

const PLAYER = {
  mac: 'desktop/player/neutralino-mac_universal',
  win: 'desktop/player/neutralino-win_x64.exe',
  linux: 'desktop/player/neutralino-linux_x64',
};

const enc = new TextEncoder();

async function sha256hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// files: [{ path: 'resources/index.html', data: Uint8Array }] -> asar bytes.
async function makeAsar(files) {
  const index = { files: {} };
  const blobs = [];
  let offset = 0;
  for (const f of files) {
    const parts = f.path.split('/');
    let dir = index;
    for (const p of parts.slice(0, -1)) {
      dir.files[p] = dir.files[p] || { files: {} };
      dir = dir.files[p];
    }
    const hash = await sha256hex(f.data);
    dir.files[parts.at(-1)] = {
      size: f.data.length,
      offset: String(offset),
      integrity: { algorithm: 'SHA256', hash, blockSize: 4194304, blocks: [hash] },
    };
    blobs.push(f.data);
    offset += f.data.length;
  }

  const json = enc.encode(JSON.stringify(index));
  const pad = (4 - (json.length % 4)) % 4;
  const payloadSize = 4 + json.length + pad;
  const pickleLen = 4 + payloadSize;
  const header = new DataView(new ArrayBuffer(16));
  header.setUint32(0, 4, true);
  header.setUint32(4, pickleLen, true);
  header.setUint32(8, payloadSize, true);
  header.setUint32(12, json.length, true);

  const total = 8 + pickleLen + offset;
  const out = new Uint8Array(total);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(json, 16);
  let p = 8 + pickleLen;
  for (const b of blobs) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

function dataUrlBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function gameIcon(project) {
  const entry = Object.entries(project.assets || {}).find(
    ([name, url]) => /icon/i.test(name) && url.startsWith('data:image/png')
  );
  return entry ? dataUrlBytes(entry[1]) : null;
}

function slugOf(name) {
  return (name || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
}

function configJson(project, slug, hasIcon) {
  const s = project.settings || {};
  return JSON.stringify({
    applicationId: 'dev.neku.' + slug,
    version: s.meta?.version || '1.0.0',
    defaultMode: 'window',
    documentRoot: '/resources/',
    url: '/index.html',
    enableServer: true,
    enableNativeAPI: false,
    tokenSecurity: 'one-time',
    logging: { enabled: false, writeToLogFile: false },
    modes: {
      window: {
        title: project.name || 'Neku Game',
        width: Math.max(320, s.width || 480),
        height: Math.max(240, s.height || 720),
        center: true,
        ...(hasIcon ? { icon: '/resources/icon.png' } : {}),
        enableInspector: false,
        exitProcessOnClose: true,
      },
    },
    cli: { binaryName: slug, resourcesPath: '/resources/' },
  }, null, 2);
}

function infoPlist(project, slug, version) {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>${esc(project.name || 'Neku Game')}</string>
  <key>CFBundleDisplayName</key><string>${esc(project.name || 'Neku Game')}</string>
  <key>CFBundleIdentifier</key><string>dev.neku.${slug}</string>
  <key>CFBundleVersion</key><string>${esc(version)}</string>
  <key>CFBundleShortVersionString</key><string>${esc(version)}</string>
  <key>CFBundleExecutable</key><string>${slug}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`;
}

// getFile(path) -> Promise<string> (repo-relative, for the engine sources)
// getBytes(path) -> Promise<Uint8Array> (player binaries; may hit the network)
// Returns [{ name, bytes }] — one zip per platform.
export async function buildDesktopApps(project, getFile, getBytes, log = () => {}) {
  const slug = slugOf(project.name);
  const title = project.name || 'Neku Game';
  const version = project.settings?.meta?.version || '1.0.0';

  log('desktop export: bundling game HTML…');
  const html = enc.encode(await buildExport(project, getFile));
  const icon = gameIcon(project);
  const resFiles = [
    { path: 'neutralino.config.json', data: enc.encode(configJson(project, slug, !!icon)) },
    { path: 'resources/index.html', data: html },
  ];
  if (icon) resFiles.push({ path: 'resources/icon.png', data: icon });
  const neu = await makeAsar(resFiles);
  log(`desktop export: resources.neu — ${(neu.length / 1024).toFixed(0)} KB`);

  const zips = [];

  log('desktop export: fetching macOS player…');
  const macBin = await getBytes(PLAYER.mac);
  const app = `${title}.app/Contents`;
  zips.push({
    name: `${slug}-macos.zip`,
    bytes: makeZip([
      { name: `${app}/MacOS/${slug}`, data: macBin, mode: 0o755 },
      { name: `${app}/MacOS/resources.neu`, data: neu },
      { name: `${app}/Info.plist`, text: infoPlist(project, slug, version) },
      { name: 'HOW-TO-RUN.txt', text: `${title} (macOS)\n1. Unzip. 2. Right-click "${title}.app" → Open (unsigned build, first launch only).\nMade with Neku Engine >w<\n` },
    ]),
  });

  log('desktop export: fetching Windows player…');
  const winBin = await getBytes(PLAYER.win);
  zips.push({
    name: `${slug}-windows.zip`,
    bytes: makeZip([
      { name: `${slug}.exe`, data: winBin },
      { name: 'resources.neu', data: neu },
      { name: 'HOW-TO-RUN.txt', text: `${title} (Windows x64)\n1. Unzip BOTH files into one folder. 2. Run ${slug}.exe.\nNeeds Microsoft Edge WebView2 (preinstalled on Win 10/11).\nMade with Neku Engine >w<\n` },
    ]),
  });

  log('desktop export: fetching Linux player…');
  const linBin = await getBytes(PLAYER.linux);
  zips.push({
    name: `${slug}-linux.zip`,
    bytes: makeZip([
      { name: slug, data: linBin, mode: 0o755 },
      { name: 'resources.neu', data: neu },
      { name: 'HOW-TO-RUN.txt', text: `${title} (Linux x64)\n1. Unzip both files into one folder. 2. chmod +x ${slug} (if needed). 3. ./${slug}\nNeeds webkit2gtk (Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-0).\nMade with Neku Engine >w<\n` },
    ]),
  });

  return zips;
}
