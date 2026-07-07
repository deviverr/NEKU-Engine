// Neku bundler — turns a project into ONE playable .html file.
//
// Two strategies:
//  - 2D-only projects: flatten the engine modules into a single classic
//    script (tiny — tens of KB). Three.js is never included.
//  - 3D projects: embed each module (three.js included) as a data: URL in an
//    import map, so the file stays a single self-contained HTML document.
//
// Used by tools/export.js (Node) and the editor's Export button (browser).

export const ENGINE_2D_FILES = ['math.js', 'audio.js', 'input.js', 'renderer2d.js', 'physics2d.js', 'fx.js', 'core.js'];
export const ENGINE_3D_FILES = [...ENGINE_2D_FILES, 'render3d.js'];

function projectUses3D(project) {
  const NODES_3D = ['Node3D', 'Camera3D', 'Light3D', 'Mesh3D', 'Screen3D'];
  const has3D = (n) => NODES_3D.includes(n.type) || (n.children || []).some(has3D);
  return (project.scenes || []).some((s) => has3D(s.root || {}));
}

// Rewrite relative import specifiers to bare names for the import map.
function toBareImports(src) {
  return src
    .replace(/from\s+['"]\.\.\/vendor\/three\.js['"]/g, "from 'three'")
    .replace(/import\(\s*['"]\.\/render3d\.js['"]\s*\)/g, "import('neku/render3d')")
    .replace(/from\s+['"]\.\/([a-z0-9]+)\.js['"]/g, "from 'neku/$1'");
}

function flatten2D(files) {
  const parts = [];
  for (const [name, src] of files) {
    parts.push(
      `// ---- engine/${name} ----\n` +
        src
          .replace(/^import\s[^;]*;\s*$/gm, '')
          .replace(/^export\s+\{[^}]*\}[^;]*;\s*$/gm, '')
          .replace(/^export\s+\*[^;]*;\s*$/gm, '')
          .replace(/^export\s+(const|let|function|class)/gm, '$1')
    );
  }
  return parts.join('\n');
}

const b64 = (s) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(s)));
};

// --- Zero-dep ZIP writer (store method, enough for itch.io uploads) -------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, text }] -> Uint8Array of a valid .zip
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, text } of files) {
    const nameB = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header
    header.setUint16(4, 20, true);         // version needed
    header.setUint16(8, 0, true);          // method: store
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, nameB.length, true);
    chunks.push(new Uint8Array(header.buffer), nameB, data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); // central directory header
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, 0, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, nameB.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }

  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, new Uint8Array(end.buffer)]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// itch.io-ready ZIP: the exported game as index.html inside a zip.
export async function buildZip(project, getFile) {
  const html = await buildExport(project, getFile);
  return makeZip([{ name: 'index.html', text: html }]);
}

const PAGE_CSS = `html, body { margin: 0; height: 100%; background: #0b0e14; display: grid; place-items: center; overflow: hidden; }
  #game { box-shadow: 0 12px 60px rgba(0,0,0,.6); border-radius: 8px; overflow: hidden; }`;

// icon.png (or first image asset named *icon*) becomes the page favicon.
function faviconTag(project) {
  const entry = Object.entries(project.assets || {}).find(
    ([name, url]) => /icon/i.test(name) && url.startsWith('data:image')
  );
  return entry ? `<link rel="icon" href="${entry[1]}" />\n` : '';
}

const BOOT_JS = `const mount = document.getElementById('game');
const S = PROJECT.settings || {};
function fit() {
  const w = S.width || 480, h = S.height || 720;
  const scale = Math.min(innerWidth / w, innerHeight / h, 1.5) * 0.96;
  mount.style.width = w * scale + 'px';
  mount.style.height = h * scale + 'px';
}
fit();
addEventListener('resize', fit);
window.game = startGame(PROJECT, mount); // console access for debugging`;

// getFile(relativePathFromRepoRoot) -> Promise<string>
export async function buildExport(project, getFile) {
  const title = (project.name || 'Neku Game').replace(/</g, '&lt;');
  const use3D = projectUses3D(project);

  if (!use3D) {
    const files = [];
    for (const f of ENGINE_2D_FILES) files.push([f, await getFile('engine/' + f)]);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>${title}</title>
${faviconTag(project)}<style>${PAGE_CSS}</style>
</head>
<body>
<div id="game"></div>
<script>
${flatten2D(files)}
// ---- game ----
const PROJECT = ${JSON.stringify(project)};
${BOOT_JS}
</script>
</body>
</html>`;
  }

  // 3D: import map with data: URLs (single file, real modules, Three included).
  const imports = { three: `data:text/javascript;base64,${b64(await getFile('vendor/three.js'))}` };
  for (const f of ENGINE_3D_FILES) {
    const bare = 'neku/' + f.replace('.js', '');
    imports[bare] = `data:text/javascript;base64,${b64(toBareImports(await getFile('engine/' + f)))}`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>${title}</title>
${faviconTag(project)}<style>${PAGE_CSS}</style>
</head>
<body>
<div id="game"></div>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script type="module">
import { startGame } from 'neku/core';
const PROJECT = ${JSON.stringify(project)};
${BOOT_JS}
</script>
</body>
</html>`;
}
