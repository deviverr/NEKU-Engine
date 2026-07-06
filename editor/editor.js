// CCE Editor — scene editing, scripting, play-in-editor, export.

import { Game, GameNode, hydrate, serialize, NODE_TYPES } from '../engine/core.js';
import { drawNode } from '../engine/renderer2d.js';
import { Renderer3D } from '../engine/renderer3d.js';
import { bundleEngine, buildExportHtml } from '../engine/bundler.js';
import { CodeEditor } from './codeeditor.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state

let project = null;          // { name, settings, mainScene, scenes:[{name, root:GameNode}], scripts, assets }
let sel = null;              // selected GameNode
let currentScript = null;    // open script name
let playing = null;          // running Game instance or null
let cam = { x: 40, y: 40, zoom: 1 };
const undoStack = [], redoStack = [];

const COLOR_KEYS = new Set(['color', 'textColor', 'strokeColor', 'hoverColor', 'pressColor', 'shadow', 'background']);

function emptyProjectJson() {
  return {
    name: 'New Game',
    engine: 'cce-0.1',
    settings: { width: 480, height: 720, background: '#1b2735' },
    mainScene: 'Main',
    scenes: [{ name: 'Main', root: { type: 'Node', name: 'Main' } }],
    scripts: {},
    assets: {},
  };
}

function serializeProject() {
  return {
    name: project.name,
    engine: 'cce-0.1',
    settings: { ...project.settings },
    mainScene: project.mainScene,
    scenes: project.scenes.map((s) => ({ name: s.name, root: serialize(s.root) })),
    scripts: { ...project.scripts },
    assets: { ...project.assets },
  };
}

function loadProjectJson(json) {
  stopPlay();
  project = {
    name: json.name || 'Untitled',
    settings: { width: 480, height: 720, background: '#1b2735', ...(json.settings || {}) },
    mainScene: json.mainScene || json.scenes?.[0]?.name || 'Main',
    scenes: (json.scenes || []).map((s) => ({ name: s.name, root: hydrate(s.root || { type: 'Node', name: s.name }) })),
    scripts: { ...(json.scripts || {}) },
    assets: { ...(json.assets || {}) },
  };
  if (!project.scenes.length) project.scenes = [{ name: 'Main', root: hydrate({ type: 'Node', name: 'Main' }) }];
  sel = null;
  currentScript = Object.keys(project.scripts)[0] || null;
  $('projectName').value = project.name;
  lastSnapshot = JSON.stringify(serializeProject());
  refreshAll();
}

const scene = () => project.scenes.find((s) => s.name === project.mainScene) || project.scenes[0];

// ------------------------------------------------------------- persistence

let saveTimer = 0;
let lastSnapshot = null; // project state before the mutation being recorded

function markDirty(pushUndo = true) {
  const now = JSON.stringify(serializeProject());
  if (pushUndo && lastSnapshot && lastSnapshot !== now) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  lastSnapshot = now;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('cce-project', now);
    } catch { /* storage full — autosave is best-effort */ }
  }, 400);
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(serializeProject()));
  loadProjectJson(JSON.parse(undoStack.pop()));
  markDirty(false);
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(serializeProject()));
  loadProjectJson(JSON.parse(redoStack.pop()));
  markDirty(false);
}

// ---------------------------------------------------------------- viewport

const vpWrap = $('viewportWrap');
const viewport = $('viewport');
const overlay = $('overlay');
const octx = overlay.getContext('2d');

// 2D content canvas fills the wrapper; GL canvas is game-sized and CSS-transformed.
const c2d = document.createElement('canvas');
const ctx2d = c2d.getContext('2d');
viewport.appendChild(c2d);
const glCanvas = document.createElement('canvas');
viewport.appendChild(glCanvas);
viewport.insertBefore(glCanvas, c2d); // GL below 2D
let gl3d = null;

const editAssets = { images: {} };
function rebuildAssets() {
  editAssets.images = {};
  for (const [name, url] of Object.entries(project.assets)) {
    const img = new Image();
    img.src = url;
    editAssets.images[name] = img;
  }
}

function resizeViewport() {
  const r = vpWrap.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  for (const c of [c2d, overlay]) {
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    c.style.width = r.width + 'px';
    c.style.height = r.height + 'px';
  }
}
new ResizeObserver(resizeViewport).observe(vpWrap);

function renderEditView() {
  if (!project || playing) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width: W, height: H, background } = project.settings;
  const root = scene().root;

  // 3D layer: game-sized GL canvas aligned with the 2D camera via CSS.
  const has3D = (function find3d(n) { return n.is3D || n.children.some(find3d); })(root);
  glCanvas.hidden = !has3D;
  if (has3D) {
    if (glCanvas.width !== W * dpr) { glCanvas.width = W * dpr; glCanvas.height = H * dpr; gl3d = null; }
    glCanvas.style.width = W + 'px';
    glCanvas.style.height = H + 'px';
    glCanvas.style.transformOrigin = '0 0';
    glCanvas.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`;
    glCanvas.style.background = background; // scene bg lives behind the GL layer
    gl3d ||= new Renderer3D(glCanvas);
    gl3d.render(root, W, H);
  }

  // 2D layer.
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, c2d.width, c2d.height);
  ctx2d.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  if (!has3D) {
    ctx2d.fillStyle = background;
    ctx2d.fillRect(0, 0, W, H);
  }
  drawNode(ctx2d, root, editAssets, 1);

  // Overlay: frame, grid, selection.
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  octx.strokeStyle = 'rgba(255,255,255,0.06)';
  octx.lineWidth = 1 / cam.zoom;
  for (let x = 0; x <= W; x += 40) line(octx, x, 0, x, H);
  for (let y = 0; y <= H; y += 40) line(octx, 0, y, W, y);
  octx.strokeStyle = '#e2b714';
  octx.strokeRect(0, 0, W, H);
  octx.fillStyle = '#e2b714';
  octx.font = `${12 / cam.zoom}px system-ui`;
  octx.fillText(`${W}×${H}`, 4 / cam.zoom, -6 / cam.zoom);

  if (sel && !sel._dead) {
    const wp = worldPos(sel);
    const b = nodeBounds(sel);
    octx.strokeStyle = '#5fa8e0';
    octx.lineWidth = 1.5 / cam.zoom;
    octx.strokeRect(wp.x - (b.w / 2) * wp.sx, wp.y - (b.h / 2) * wp.sy, b.w * wp.sx, b.h * wp.sy);
    octx.fillStyle = '#5fa8e0';
    octx.fillText(sel.name, wp.x - (b.w / 2) * wp.sx, wp.y - (b.h / 2) * wp.sy - 6 / cam.zoom);
  }
  requestAnimationFrame(renderEditView);
}

function line(c, x1, y1, x2, y2) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

// Approximate accumulated world position/scale (ignores ancestor rotation —
// good enough for editor gizmos).
function worldPos(node) {
  let x = 0, y = 0, sx = 1, sy = 1;
  const chain = [];
  for (let n = node; n; n = n.parent) chain.push(n);
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    x += (n.x || 0) * sx;
    y += (n.y || 0) * sy;
    sx *= n.scaleX ?? 1;
    sy *= n.scaleY ?? 1;
  }
  return { x, y, sx, sy };
}

function nodeBounds(n) {
  switch (n.type) {
    case 'Rect': case 'Button': case 'Sprite':
      return { w: n.w || 40, h: n.h || 40 };
    case 'Circle':
      return { w: n.radius * 2, h: n.radius * 2 };
    case 'Label': {
      ctx2d.font = `${n.bold ? 'bold ' : ''}${n.size || 16}px ${n.font || 'system-ui'}`;
      return { w: Math.max(20, ctx2d.measureText(n.text ?? '').width), h: (n.size || 16) * 1.3 };
    }
    default:
      return { w: 30, h: 30 };
  }
}

function screenToGame(e) {
  const r = vpWrap.getBoundingClientRect();
  return { x: (e.clientX - r.left - cam.x) / cam.zoom, y: (e.clientY - r.top - cam.y) / cam.zoom };
}

function pickNode(gx, gy) {
  let hit = null;
  const walk = (n) => {
    if (n.visible === false) return;
    if (!n.is3D && n.parent) {
      const wp = worldPos(n);
      const b = nodeBounds(n);
      if (Math.abs(gx - wp.x) <= (b.w / 2) * Math.abs(wp.sx) + 2 && Math.abs(gy - wp.y) <= (b.h / 2) * Math.abs(wp.sy) + 2) hit = n;
    }
    for (const c of n.children) walk(c);
  };
  walk(scene().root);
  return hit;
}

// Viewport mouse: select/drag nodes, pan empty space, wheel zoom.
let drag = null;
overlay.style.pointerEvents = 'auto';
overlay.addEventListener('pointerdown', (e) => {
  if (playing) return;
  overlay.setPointerCapture(e.pointerId);
  const g = screenToGame(e);
  const hit = pickNode(g.x, g.y);
  if (hit) {
    select(hit);
    drag = { node: hit, startX: hit.x || 0, startY: hit.y || 0, gx: g.x, gy: g.y, moved: false };
  } else {
    select(null);
    drag = { pan: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
  }
});
overlay.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.pan) {
    cam.x = drag.cx + (e.clientX - drag.sx);
    cam.y = drag.cy + (e.clientY - drag.sy);
  } else {
    const g = screenToGame(e);
    const wp = drag.node.parent ? worldPos(drag.node.parent) : { sx: 1, sy: 1 };
    let nx = drag.startX + (g.x - drag.gx) / (wp.sx || 1);
    let ny = drag.startY + (g.y - drag.gy) / (wp.sy || 1);
    if (e.shiftKey) { nx = Math.round(nx / 10) * 10; ny = Math.round(ny / 10) * 10; }
    drag.node.x = Math.round(nx);
    drag.node.y = Math.round(ny);
    drag.moved = true;
    refreshInspector();
  }
});
overlay.addEventListener('pointerup', () => {
  if (drag && !drag.pan && drag.moved) markDirty();
  drag = null;
});
overlay.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = vpWrap.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const z0 = cam.zoom;
  cam.zoom = Math.min(4, Math.max(0.15, cam.zoom * Math.exp(-e.deltaY * 0.0012)));
  cam.x = mx - ((mx - cam.x) / z0) * cam.zoom;
  cam.y = my - ((my - cam.y) / z0) * cam.zoom;
}, { passive: false });

// ---------------------------------------------------------------- hierarchy

const ICONS = {
  Node: '▢', Rect: '▭', Circle: '◯', Label: 'Ａ', Button: '⏺', Sprite: '🖼',
  Particles: '✨', Camera3D: '🎥', Light3D: '💡', Mesh3D: '🧊',
};

function refreshTree() {
  const tree = $('tree');
  tree.innerHTML = '';
  const addRow = (node, depth) => {
    const row = document.createElement('div');
    row.className = 'tree-row' + (node === sel ? ' selected' : '');
    row.style.paddingLeft = 8 + depth * 14 + 'px';
    row.innerHTML =
      `<span>${ICONS[node.type] || '▢'}</span><span>${node.name}</span>` +
      `<span class="type">${node.type}</span>` +
      (node.is3D ? '<span class="badge3d">3D</span>' : '') +
      (node.script ? '<span class="badge-script">𝒇</span>' : '') +
      `<button class="hide-btn" title="toggle visibility">${node.visible === false ? '🚫' : '👁'}</button>`;
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('hide-btn')) {
        node.visible = node.visible === false ? true : false;
        markDirty();
        refreshTree();
        return;
      }
      select(node);
    });
    row.addEventListener('dblclick', () => {
      const name = prompt('Rename node', node.name);
      if (name) { node.name = name; markDirty(); refreshAll(); }
    });
    tree.appendChild(row);
    for (const c of node.children) addRow(c, depth + 1);
  };
  addRow(scene().root, 0);
}

function select(node) {
  sel = node;
  refreshTree();
  refreshInspector();
}

$('btnAddNode').addEventListener('click', () => {
  const type = $('addNodeType').value;
  const parent = sel || scene().root;
  const s = project.settings;
  const node = new GameNode(type, { name: uniqueName(type) });
  if (!node.is3D && !sel) { node.x = s.width / 2; node.y = s.height / 2; }
  parent.addChild(node);
  markDirty();
  select(node);
});

function uniqueName(base) {
  let i = 1;
  const taken = new Set();
  (function walk(n) { taken.add(n.name); n.children.forEach(walk); })(scene().root);
  while (taken.has(base + i)) i++;
  return base + i;
}

// ---------------------------------------------------------------- inspector

function refreshInspector() {
  const box = $('props');
  box.innerHTML = '';

  if (!sel || !sel.parent) {
    // Root (or nothing) selected → project settings.
    box.appendChild(section('Project'));
    box.appendChild(propRow('width', project.settings.width, 'number', (v) => { project.settings.width = +v; markDirty(); }));
    box.appendChild(propRow('height', project.settings.height, 'number', (v) => { project.settings.height = +v; markDirty(); }));
    box.appendChild(propRow('background', project.settings.background, 'color', (v) => { project.settings.background = v; markDirty(); }));
    if (sel) box.appendChild(scriptRow(sel));
    if (!sel) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = 'Select a node to edit it, or click the canvas.';
      box.appendChild(d);
    }
    return;
  }

  box.appendChild(section(`${sel.type} — ${sel.name}`));
  box.appendChild(propRow('name', sel.name, 'text', (v) => { sel.name = v; markDirty(); refreshTree(); }));
  box.appendChild(scriptRow(sel));

  const defaults = NODE_TYPES[sel.type] || {};
  const keys = new Set([...Object.keys(defaults), ...Object.keys(sel).filter((k) =>
    !k.startsWith('_') && !['id', 'type', 'name', 'is3D', 'children', 'parent', 'script', 'visible'].includes(k) && typeof sel[k] !== 'function'
  )]);

  box.appendChild(section('Properties'));
  for (const key of keys) {
    const val = sel[key] ?? defaults[key];
    let kind = 'text';
    if (typeof val === 'boolean') kind = 'checkbox';
    else if (typeof val === 'number') kind = 'number';
    else if (COLOR_KEYS.has(key) && /^#[0-9a-fA-F]{6}$/.test(String(val))) kind = 'color';
    box.appendChild(propRow(key, val, kind, (v) => {
      sel[key] = kind === 'number' ? +v : kind === 'checkbox' ? v : v;
      markDirty();
    }));
  }

  const actions = document.createElement('div');
  actions.className = 'prop-actions';
  actions.append(
    actionBtn('Duplicate', () => {
      const copy = hydrate(serialize(sel));
      copy.name = uniqueName(sel.name.replace(/\d+$/, ''));
      copy.x = (copy.x || 0) + 20;
      copy.y = (copy.y || 0) + 20;
      sel.parent.addChild(copy);
      markDirty();
      select(copy);
    }),
    actionBtn('↑', () => reorder(-1)),
    actionBtn('↓', () => reorder(1)),
    actionBtn('Delete', () => { deleteSel(); }, 'danger'),
  );
  box.appendChild(actions);
}

function reorder(dir) {
  const sib = sel.parent.children;
  const i = sib.indexOf(sel);
  const j = i + dir;
  if (j < 0 || j >= sib.length) return;
  [sib[i], sib[j]] = [sib[j], sib[i]];
  markDirty();
  refreshTree();
}

function deleteSel() {
  if (!sel || !sel.parent) return;
  sel.destroy();
  sel = null;
  markDirty();
  refreshAll();
}

function section(title) {
  const d = document.createElement('div');
  d.className = 'prop-section';
  d.textContent = title;
  return d;
}

function actionBtn(label, fn, cls) {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', fn);
  return b;
}

function propRow(label, value, kind, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const lab = document.createElement('label');
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = kind;
  if (kind === 'checkbox') input.checked = !!value;
  else input.value = value ?? '';
  if (kind === 'number') input.step = 'any';
  input.addEventListener(kind === 'color' || kind === 'checkbox' ? 'input' : 'change', () => {
    onChange(kind === 'checkbox' ? input.checked : input.value);
  });
  row.append(lab, input);
  return row;
}

function scriptRow(node) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const lab = document.createElement('label');
  lab.textContent = 'script';
  const selEl = document.createElement('select');
  selEl.innerHTML = '<option value="">— none —</option>' +
    Object.keys(project.scripts).map((n) => `<option${n === node.script ? ' selected' : ''}>${n}</option>`).join('') +
    '<option value="__new__">+ new script…</option>';
  selEl.addEventListener('change', () => {
    if (selEl.value === '__new__') {
      const name = addScript();
      if (name) { node.script = name; }
      refreshInspector();
    } else {
      node.script = selEl.value || null;
    }
    markDirty();
    refreshAll();
  });
  row.append(lab, selEl);
  return row;
}

// ---------------------------------------------------------------- scripts

const codeEditor = new CodeEditor($('codePane'), {
  onChange: (src) => {
    if (currentScript) {
      project.scripts[currentScript] = src;
      markDirty(false); // typing shouldn't spam the undo stack
    }
  },
});

function refreshScripts() {
  const list = $('scriptList');
  list.innerHTML = '';
  for (const name of Object.keys(project.scripts)) {
    const row = document.createElement('div');
    row.className = 'script-row' + (name === currentScript ? ' selected' : '');
    row.textContent = name;
    row.addEventListener('click', () => openScript(name));
    list.appendChild(row);
  }
  openScript(currentScript);
}

function openScript(name) {
  currentScript = name && project.scripts[name] != null ? name : Object.keys(project.scripts)[0] || null;
  $('codeFile').textContent = currentScript || 'no script';
  codeEditor.setValue(currentScript ? project.scripts[currentScript] : '// Create a script with the ＋ button, then assign it to a node.\n// Hooks: ready(), update(dt), onPress(), onInput(e), onSignal(name, data)\n// Globals: self (this node), game (find, tween, after, every, emit, audio, rand…)');
  document.querySelectorAll('.script-row').forEach((r) => r.classList.toggle('selected', r.textContent === currentScript));
}

function addScript() {
  let name = prompt('Script name', 'Script.js');
  if (!name) return null;
  if (!name.endsWith('.js')) name += '.js';
  if (project.scripts[name] == null) {
    project.scripts[name] = `function ready() {\n  \n}\n\nfunction update(dt) {\n  \n}\n`;
  }
  markDirty();
  refreshScripts();
  openScript(name);
  return name;
}

$('btnAddScript').addEventListener('click', addScript);

// tabs
document.querySelectorAll('#bottom .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#bottom .tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    $('codePane').hidden = tab.dataset.tab !== 'code';
    $('consolePane').hidden = tab.dataset.tab !== 'console';
  });
});

// ---------------------------------------------------------------- console

let conErrors = 0;
const conOrig = {};
function conLine(kind, args) {
  const div = document.createElement('div');
  div.className = 'con-line ' + kind;
  div.textContent = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  $('consolePane').appendChild(div);
  $('consolePane').scrollTop = 1e9;
  if (kind === 'error') $('conCount').textContent = `(${++conErrors})`;
}

function hookConsole() {
  conErrors = 0;
  $('conCount').textContent = '';
  $('consolePane').innerHTML = '';
  for (const kind of ['log', 'warn', 'error']) {
    conOrig[kind] = console[kind];
    console[kind] = (...args) => { conOrig[kind](...args); conLine(kind, args); };
  }
  window.addEventListener('error', onWinError);
}

function unhookConsole() {
  for (const kind of ['log', 'warn', 'error']) if (conOrig[kind]) console[kind] = conOrig[kind];
  window.removeEventListener('error', onWinError);
}

const onWinError = (e) => conLine('error', [e.message]);

// ---------------------------------------------------------------- play mode

function startPlay() {
  const json = serializeProject();
  const mount = $('playMount');
  mount.hidden = false;
  overlay.style.pointerEvents = 'none';
  mount.innerHTML = '<div class="stage"></div>';
  const stage = mount.firstChild;
  const fit = () => {
    const r = vpWrap.getBoundingClientRect();
    const s = Math.min(r.width / json.settings.width, r.height / json.settings.height) * 0.92;
    stage.style.width = json.settings.width * s + 'px';
    stage.style.height = json.settings.height * s + 'px';
  };
  fit();
  hookConsole();
  try {
    playing = new Game(json, stage);
    playing.start();
  } catch (e) {
    conLine('error', ['game crashed on boot: ' + e.message]);
  }
  $('btnPlay').textContent = '■ Stop';
  $('btnPlay').classList.add('playing');
}

function stopPlay() {
  if (!playing) return;
  try { playing.stop(); } catch { /* already dead */ }
  playing = null;
  unhookConsole();
  $('playMount').hidden = true;
  $('playMount').innerHTML = '';
  overlay.style.pointerEvents = 'auto';
  $('btnPlay').textContent = '▶ Play';
  $('btnPlay').classList.remove('playing');
  requestAnimationFrame(renderEditView);
}

$('btnPlay').addEventListener('click', () => (playing ? stopPlay() : startPlay()));

// ---------------------------------------------------------------- toolbar

$('projectName').addEventListener('change', () => { project.name = $('projectName').value; markDirty(); });

$('btnNew').addEventListener('click', () => {
  if (!confirm('Start a new empty project? Unsaved work is kept in browser autosave only.')) return;
  loadProjectJson(emptyProjectJson());
  markDirty(false);
});

$('btnSample').addEventListener('click', async () => {
  try {
    const json = await (await fetch('../projects/casino-calculator.json')).json();
    loadProjectJson(json);
    markDirty();
  } catch (e) {
    alert('Could not load sample: ' + e.message);
  }
});

$('btnOpen').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    loadProjectJson(JSON.parse(await file.text()));
    markDirty();
  } catch (err) {
    alert('Not a valid CCE project: ' + err.message);
  }
  e.target.value = '';
});

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('btnSave').addEventListener('click', () => {
  download(slug(project.name) + '.json', JSON.stringify(serializeProject(), null, 2));
});

$('btnExport').addEventListener('click', async () => {
  try {
    const engineJs = await bundleEngine(async (f) => await (await fetch('../engine/' + f)).text());
    download(slug(project.name) + '.html', buildExportHtml(engineJs, serializeProject()), 'text/html');
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
});

const slug = (s) => (s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

// ---------------------------------------------------------------- keyboard

window.addEventListener('keydown', (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'Enter') { e.preventDefault(); playing ? stopPlay() : startPlay(); return; }
  if (inField || playing) return;
  if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (!sel) return;
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); }
  const step = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowLeft') { sel.x -= step; markDirty(); }
  if (e.key === 'ArrowRight') { sel.x += step; markDirty(); }
  if (e.key === 'ArrowUp') { sel.y -= step; markDirty(); }
  if (e.key === 'ArrowDown') { sel.y += step; markDirty(); }
});

// ---------------------------------------------------------------- boot

function refreshAll() {
  rebuildAssets();
  refreshTree();
  refreshInspector();
  refreshScripts();
}

(async function boot() {
  const saved = localStorage.getItem('cce-project');
  if (saved) {
    try {
      loadProjectJson(JSON.parse(saved));
    } catch {
      loadProjectJson(emptyProjectJson());
    }
  } else {
    // First run: try the sample, fall back to an empty project.
    try {
      loadProjectJson(await (await fetch('../projects/casino-calculator.json')).json());
    } catch {
      loadProjectJson(emptyProjectJson());
    }
  }
  resizeViewport();
  requestAnimationFrame(renderEditView);
})();

// Debug/testing hooks (harmless in production; the editor is a dev tool).
window.__cce = {
  get project() { return project; },
  get sel() { return sel; },
  scene,
  select,
  renderEditView,
  startPlay,
  stopPlay,
  serializeProject,
};
