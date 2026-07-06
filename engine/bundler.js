// CCE bundler — flattens the engine's ES modules into one plain script.
// Works because the engine is written with unique top-level names across
// files; we strip import/export syntax and concatenate in dependency order.
// Used by tools/export.js (Node) and the editor's Export button (browser).

export const ENGINE_FILES = ['math.js', 'audio.js', 'input.js', 'renderer2d.js', 'renderer3d.js', 'core.js'];

export async function bundleEngine(getFile) {
  const parts = [];
  for (const name of ENGINE_FILES) {
    const src = await getFile(name);
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

// Self-contained playable HTML: engine + project JSON + boot, one file.
export function buildExportHtml(engineJs, project) {
  const title = (project.name || 'CCE Game').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0e14; display: grid; place-items: center; overflow: hidden; }
  #game { box-shadow: 0 12px 60px rgba(0,0,0,.6); border-radius: 8px; overflow: hidden; }
</style>
</head>
<body>
<div id="game"></div>
<script>
${engineJs}
// ---- game ----
const PROJECT = ${JSON.stringify(project)};
const mount = document.getElementById('game');
const S = PROJECT.settings || {};
function fit() {
  const w = S.width || 480, h = S.height || 720;
  const scale = Math.min(innerWidth / w, innerHeight / h, 1.5) * 0.96;
  mount.style.width = w * scale + 'px';
  mount.style.height = h * scale + 'px';
}
fit();
addEventListener('resize', fit);
startGame(PROJECT, mount);
</script>
</body>
</html>`;
}
