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

const PAGE_CSS = `html, body { margin: 0; height: 100%; background: #0b0e14; display: grid; place-items: center; overflow: hidden; }
  #game { box-shadow: 0 12px 60px rgba(0,0,0,.6); border-radius: 8px; overflow: hidden; }`;

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
startGame(PROJECT, mount);`;

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
<style>${PAGE_CSS}</style>
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
<style>${PAGE_CSS}</style>
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
