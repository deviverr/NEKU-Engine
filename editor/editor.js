// Neku Studio — main editor: state, menus, panels, viewports, play mode, co-op.

import { Game, GameNode, hydrate, serialize, NODE_TYPES } from '../engine/core.js';
import { buildExport, buildZip } from '../engine/bundler.js';
import { buildDesktopApps } from '../engine/desktop-export.js';
import { Dock } from './dock.js';
import { CodeEditor } from './codeeditor.js';
import { Viewport2D } from './viewport2d.js';
import { Viewport3D } from './viewport3d.js';
import { CollabClient } from './collab.js';
import { TimelinePanel } from './timeline.js';
import { initNative } from './native.js';
import { WinManager } from './windows.js';
import { openPaint } from './paint.js';
import { openPreferences, openProjectSettings, applyCustomTheme, clearCustomTheme } from './settingsui.js';
import { openMainMenu, VERSION, TEMPLATES, recordRecent } from './mainmenu.js';
import { PluginHost } from './plugins.js';
import { ExplorerPanel, ErrorsPanel, OutputPanel } from './panels.js';
import { getJson, getLocal, SESSION, setJson, setLocal } from './session.js';
import { MenuBar } from './menubar.js';
import { confirmDlg, promptDlg, infoDlg, toast } from './dialogs.js';
import { openCoop } from './coop.js';

let native = null; // desktop bridge (Neutralino) or null in the browser

const $ = (id) => document.getElementById(id);

const splash = {
  set(pct, msg) {
    const fill = $('splashFill');
    if (fill) fill.style.width = pct + '%';
    if (msg) $('splashStatus').textContent = msg;
  },
  done() {
    splash.set(100, 'ready >w<');
    const el = $('splash');
    setTimeout(() => {
      el.classList.add('bye');
      setTimeout(() => el.remove(), 400);
    }, 120);
  },
};
splash.set(12, 'loading engine…');

// ------------------------------------------------------------------ state

const ed = {
  project: null,
  sel: null,
  currentScene: null, // scene being edited (mainScene is the boot scene)
  peers: new Map(), // id -> { name, color, selName }
  paint: { active: false, tile: 0 },
  assets: { images: {}, urls: {} },
  scene() {
    return ed.project.scenes.find((s) => s.name === ed.currentScene) ||
      ed.project.scenes.find((s) => s.name === ed.project.mainScene) ||
      ed.project.scenes[0];
  },
  select,
  markDirty,
  refreshInspector,
  session: SESSION,
  onCoopStatus: null,   // co-op window hooks these to stay live
  onPeersChanged: null,
};
window.__neku = ed; // debug/testing hook

const winman = new WinManager();
const plugins = new PluginHost(ed);
ed.log = (msg) => conLine('log', [msg]);

let currentScript = null;
let playing = null;
let activeTab = '2d';
const undoStack = [], redoStack = [];
let lastSnapshot = null;

const COLOR_KEYS = new Set(['color', 'textColor', 'strokeColor', 'hoverColor', 'pressColor', 'shadow', 'background', 'emissive', 'groundColor', 'bg', 'border']);
const ENUM_FIELDS = {
  shape: ['box', 'sphere', 'plane', 'cylinder', 'cone', 'torus', 'model'],
  kind: ['directional', 'ambient', 'point', 'hemi'],
  align: ['left', 'center', 'right'],
  body: ['', 'dynamic', 'static', 'area'],
  body3d: ['', 'dynamic', 'static'],
  sound: ['click', 'tick', 'pop', 'coin', 'win', 'lose', 'jackpot', 'spin', 'whoosh'],
};
const IMAGE_FIELDS = new Set(['asset', 'texture', 'tileset']);
const MODEL_FIELDS = new Set(['model']);
const HIDDEN_FIELDS = new Set(['tiles']);
// 0..max sliders — material and light fields feel like dials, not numbers.
const RANGE_FIELDS = { metalness: 1, roughness: 1, opacity: 1, intensity: 3, emissiveIntensity: 3, glow: 2 };

// Inspector groups, in display order. Everything else lands in "Other".
const PROP_GROUPS = [
  ['Transform', ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 'scaleX', 'scaleY', 'rotation']],
  ['Shape', ['shape', 'model', 'w', 'h', 'd', 'radius', 'segments', 'text', 'placeholder', 'size', 'bold', 'align', 'font', 'maxLength']],
  ['Material', ['color', 'textColor', 'bg', 'border', 'texture', 'asset', 'metalness', 'roughness', 'emissive', 'emissiveIntensity', 'opacity', 'unlit', 'wireframe', 'castShadow', 'receiveShadow', 'glow']],
  ['Camera & Light', ['kind', 'intensity', 'range', 'groundColor', 'tx', 'ty', 'tz', 'fov', 'near', 'far']],
  ['Sprite Sheet', ['sheetCols', 'sheetRows', 'frame', 'fps', 'playing']],
  ['Tilemap', ['tileset', 'tileW', 'tileH', 'cols', 'rows', 'collision']],
  ['Physics', ['body', 'body3d', 'mass', 'friction', 'restitution', 'vx', 'vy', 'gravityScale', 'bounce']],
  ['Particles', ['gravity']],
];

function emptyProjectJson() {
  return structuredClone(TEMPLATES['Blank']);
}

function serializeProject() {
  const p = ed.project;
  return {
    name: p.name,
    engine: 'neku-2',
    settings: { ...p.settings },
    mainScene: p.mainScene,
    scenes: p.scenes.map((s) => ({ name: s.name, root: serialize(s.root) })),
    scripts: { ...p.scripts },
    assets: { ...p.assets },
    anims: JSON.parse(JSON.stringify(p.anims || {})),
    prefabs: JSON.parse(JSON.stringify(p.prefabs || {})),
  };
}

function loadProjectJson(json, { keepSelection = false } = {}) {
  stopPlay();
  const selName = keepSelection && ed.sel ? ed.sel.name : null;
  ed.project = {
    name: json.name || 'Untitled',
    settings: {
      width: 480, height: 720, background: '#1b2735', pixelated: false, uiMode: 'overlay',
      ...(json.settings || {}),
    },
    mainScene: json.mainScene || json.scenes?.[0]?.name || 'Main',
    scenes: (json.scenes || []).map((s) => ({ name: s.name, root: hydrate(s.root || { type: 'Node', name: s.name }) })),
    scripts: { ...(json.scripts || {}) },
    assets: { ...(json.assets || {}) },
    anims: JSON.parse(JSON.stringify(json.anims || {})),
    prefabs: JSON.parse(JSON.stringify(json.prefabs || {})),
  };
  if (!ed.project.scenes.length) ed.project.scenes = [{ name: 'Main', root: hydrate({ type: 'Node', name: 'Main' }) }];
  ed.currentScene = ed.project.scenes.some((s) => s.name === ed.currentScene) ? ed.currentScene : ed.project.mainScene;
  ed.sel = selName ? ed.scene().root.find(selName) : null;
  if (!Object.keys(ed.project.scripts).includes(currentScript)) currentScript = Object.keys(ed.project.scripts)[0] || null;
  $('projectName').value = ed.project.name;
  native?.setTitle(ed.project.name);
  lastSnapshot = JSON.stringify(serializeProject());
  refreshAll();
}

// ------------------------------------------------------------- persistence

let saveTimer = 0;
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
      setLocal('neku-project', now);
      status(`autosaved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch { /* best-effort */ }
    recordRecent(ed.project.name, JSON.parse(now));
    errorsPanel.check();
    explorer.refresh();
  }, 400);
  collab.sendDoc(() => {
    const doc = JSON.parse(JSON.stringify(serializeProject()));
    doc.assets = {}; // assets travel separately, chunked (see collab.js)
    return doc;
  });
  collab.syncAssets(ed.project.assets);
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(serializeProject()));
  loadProjectJson(JSON.parse(undoStack.pop()), { keepSelection: true });
  markDirty(false);
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(serializeProject()));
  loadProjectJson(JSON.parse(redoStack.pop()), { keepSelection: true });
  markDirty(false);
}

function rebuildAssets() {
  ed.assets = { images: {}, urls: {} };
  for (const [name, url] of Object.entries(ed.project.assets)) {
    ed.assets.urls[name] = url;
    if (url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
      const img = new Image();
      img.src = url;
      ed.assets.images[name] = img;
    }
  }
}

function status(msg) {
  const el = $('statusMsg');
  if (el) el.textContent = msg;
}

// ------------------------------------------------------------------- dock

splash.set(30, 'building panels…');

const dock = new Dock($('dockRoot'));

function panelFromTemplate(tplId) {
  const el = document.createElement('div');
  el.appendChild(document.getElementById(tplId).content.cloneNode(true));
  return el;
}

const center = dock.center();
center.innerHTML = `
  <div id="vpTabs">
    <div class="zone-tab active" data-vp="2d">2D</div>
    <div class="zone-tab" data-vp="3d">3D</div>
    <div class="zone-tab" data-vp="game">GAME</div>
  </div>
  <div id="vpBody">
    <div class="vp-pane active" data-vp="2d"></div>
    <div class="vp-pane" data-vp="3d"></div>
    <div class="vp-pane" data-vp="game"><div id="playMount"></div></div>
  </div>`;

dock.addPanel({ id: 'hierarchy', title: 'Scene', zone: 'left', el: panelFromTemplate('tpl-hierarchy') });
dock.addPanel({ id: 'inspector', title: 'Inspector', zone: 'right', el: panelFromTemplate('tpl-inspector') });
dock.addPanel({ id: 'assets', title: 'Assets', zone: 'left', el: panelFromTemplate('tpl-assets') });
dock.addPanel({ id: 'script', title: 'Script', zone: 'bottom', el: panelFromTemplate('tpl-script') });
dock.addPanel({ id: 'console', title: 'Console', zone: 'bottom', el: panelFromTemplate('tpl-console') });
const timelineEl = document.createElement('div');
dock.addPanel({ id: 'timeline', title: 'Timeline', zone: 'bottom', el: timelineEl });
const timeline = new TimelinePanel(timelineEl, ed);
ed.timelinePanel = timeline;

const explorerEl = document.createElement('div');
dock.addPanel({ id: 'explorer', title: 'Explorer', zone: 'left', el: explorerEl });
const explorer = new ExplorerPanel(explorerEl, ed, {
  openScript: (n) => { openScript(n); refreshScripts(); dock.activate('script'); },
  showPanel: (id) => dock.activate(id),
  selectAnim: (n) => { timeline.current = n; timeline.refresh(); dock.activate('timeline'); },
  refreshAll: () => refreshAll(),
  addScript: () => addScript(),
  hydrate,
});

const errorsEl = document.createElement('div');
dock.addPanel({ id: 'errors', title: 'Errors', zone: 'bottom', el: errorsEl });
const errorsPanel = new ErrorsPanel(errorsEl, ed, {
  openScript: (n) => { openScript(n); refreshScripts(); dock.activate('script'); },
});

const outputEl = document.createElement('div');
dock.addPanel({ id: 'output', title: 'Output', zone: 'bottom', el: outputEl });
const output = new OutputPanel(outputEl);
ed.log = (msg) => output.log(msg);

dock.activate('hierarchy');
dock.activate('script');

for (const tab of center.querySelectorAll('#vpTabs .zone-tab')) {
  tab.addEventListener('click', () => setVpTab(tab.dataset.vp));
}

const VP_HINTS = {
  '2d': 'drag: move · empty drag: pan · wheel: zoom · shift: snap · arrows: nudge · del: delete',
  '3d': 'W/E/R: move/rotate/scale · drag empty: orbit · F: focus · shift: snap',
  'game': 'Cmd/Ctrl+Enter stops · ⏸ pause · ⏭ step',
};

function setVpTab(name) {
  activeTab = name;
  for (const t of center.querySelectorAll('#vpTabs .zone-tab')) t.classList.toggle('active', t.dataset.vp === name);
  for (const p of center.querySelectorAll('.vp-pane')) p.classList.toggle('active', p.dataset.vp === name);
  if (name !== 'game' && playing) stopPlay();
  status(VP_HINTS[name] || 'ready');
}

const vp2d = new Viewport2D(center.querySelector('.vp-pane[data-vp="2d"]'), ed);
const vp3d = new Viewport3D(center.querySelector('.vp-pane[data-vp="3d"]'), ed);
ed.vp2d = vp2d; // debug/testing hooks, like window.__neku itself
ed.vp3d = vp3d;

// -------------------------------------------------------------- hierarchy

const ICONS = {
  Node: '▢', Rect: '▭', Circle: '◯', Label: 'Ａ', Button: '⏺', Sprite: '🖼', Particles: '✨', Tilemap: '▦',
  Node3D: '⬚', Camera3D: '🎥', Light3D: '💡', Mesh3D: '🧊', Screen3D: '🖵',
};

function refreshTree() {
  const tree = $('tree');
  tree.innerHTML = '';
  const peerByNode = new Map();
  for (const p of ed.peers.values()) if (p.selName) peerByNode.set(p.selName, p.color);
  const addRow = (node, depth) => {
    const row = document.createElement('div');
    row.className = 'tree-row' + (node === ed.sel ? ' selected' : '');
    row.style.paddingLeft = 8 + depth * 13 + 'px';
    const peerColor = peerByNode.get(node.name);
    row.innerHTML =
      (peerColor ? `<span class="peer-mark" style="background:${peerColor}"></span>` : '') +
      `<span>${ICONS[node.type] || '▢'}</span><span>${node.name}</span>` +
      `<span class="type">${node.type}</span>` +
      (node.is3D ? '<span class="badge3d">3D</span>' : '') +
      (node.script ? '<span class="badge-script">𝒇</span>' : '') +
      `<button class="hide-btn">${node.visible === false ? '🚫' : '👁'}</button>`;
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('hide-btn')) {
        node.visible = node.visible === false ? true : false;
        markDirty();
        refreshTree();
        return;
      }
      select(node);
    });
    row.addEventListener('dblclick', () => renameNode(node));
    tree.appendChild(row);
    for (const c of node.children) addRow(c, depth + 1);
  };
  addRow(ed.scene().root, 0);
}

async function renameNode(node) {
  const name = await promptDlg({ title: 'RENAME NODE', value: node.name });
  if (name && name !== node.name) {
    node.name = name;
    markDirty();
    refreshAll();
  }
}

function select(node) {
  ed.sel = node;
  ed.paint.active = false;
  collab.sendPresence(node?.name || null);
  refreshTree();
  refreshInspector();
}

$('btnAddNode').addEventListener('click', () => {
  const value = $('addNodeType').value;
  const parent = ed.sel || ed.scene().root;
  let node;
  if (value.startsWith('prefab:')) {
    const def = ed.project.prefabs?.[value.slice(7)];
    if (!def) return;
    node = hydrate(JSON.parse(JSON.stringify(def)));
    node.name = uniqueName(node.name.replace(/\d+$/, ''));
  } else {
    node = new GameNode(value, { name: uniqueName(value) });
  }
  if (!node.is3D && !ed.sel) {
    node.x = ed.project.settings.width / 2;
    node.y = ed.project.settings.height / 2;
  }
  parent.addChild(node);
  markDirty();
  select(node);
  if (node.is3D && activeTab === '2d') setVpTab('3d');
});

function refreshAddMenu() {
  const selEl = $('addNodeType');
  selEl.querySelector('optgroup[label="Prefabs"]')?.remove();
  const names = Object.keys(ed.project.prefabs || {});
  if (!names.length) return;
  const group = document.createElement('optgroup');
  group.label = 'Prefabs';
  for (const n of names) {
    const opt = document.createElement('option');
    opt.value = 'prefab:' + n;
    opt.textContent = '★ ' + n;
    group.appendChild(opt);
  }
  selEl.appendChild(group);
}

function uniqueName(base) {
  let i = 1;
  const taken = new Set();
  (function walk(n) { taken.add(n.name); n.children.forEach(walk); })(ed.scene().root);
  while (taken.has(base + i)) i++;
  return base + i;
}

// -------------------------------------------------------------- inspector

function refreshInspector() {
  const box = $('props');
  if (!box) return;
  const scrollY = box.scrollTop;
  box.innerHTML = '';
  const sel = ed.sel;

  if (!sel || !sel.parent) {
    // Nothing (or the scene root) selected: point at the right homes instead
    // of duplicating Project Settings here.
    const empty = document.createElement('div');
    empty.className = 'empty-box';
    empty.innerHTML = `<img src="cwat.svg" alt="" />
      <div>${sel ? 'Scene root — add nodes from the Scene panel.' : 'Select a node to edit it.'}</div>`;
    const btn = actionBtn('⚙ Project Settings…', () => openProjectSettings(winman, ed));
    empty.appendChild(btn);
    box.appendChild(empty);
    if (sel) box.appendChild(scriptRow(sel));
    box.scrollTop = scrollY;
    return;
  }

  box.appendChild(section(`${sel.type} — ${sel.name}`));
  box.appendChild(propRow('name', sel.name, 'text', (v) => { sel.name = v; markDirty(); refreshTree(); }));
  box.appendChild(scriptRow(sel));

  const defaults = NODE_TYPES[sel.type] || {};
  const keys = new Set([...Object.keys(defaults), ...Object.keys(sel).filter((k) =>
    !k.startsWith('_') && !['id', 'type', 'name', 'is3D', 'children', 'parent', 'script', 'visible'].includes(k) && typeof sel[k] !== 'function'
  )]);

  // Grouped, ordered fields; anything unmapped lands in "Other".
  const remaining = new Set([...keys].filter((k) => !HIDDEN_FIELDS.has(k)));
  for (const [title, fields] of PROP_GROUPS) {
    const present = fields.filter((f) => remaining.has(f));
    if (!present.length) continue;
    box.appendChild(section(title));
    for (const key of present) {
      remaining.delete(key);
      box.appendChild(fieldRow(sel, key, sel[key] ?? defaults[key]));
    }
  }
  if (remaining.size) {
    box.appendChild(section('Other'));
    for (const key of remaining) box.appendChild(fieldRow(sel, key, sel[key] ?? defaults[key]));
  }

  // Physics quick-add for 2D visual nodes.
  if (!sel.is3D && ['Rect', 'Circle', 'Sprite'].includes(sel.type) && sel.body === undefined) {
    box.appendChild(section('Physics'));
    box.appendChild(enumRow('body', '', ENUM_FIELDS.body, (v) => { if (v) sel.body = v; markDirty(); refreshInspector(); }));
  }

  // Tilemap painting tools.
  if (sel.type === 'Tilemap') {
    box.appendChild(section('Paint tiles'));
    const paintBtn = actionBtn(ed.paint.active ? '■ Stop painting' : '✏ Paint tiles', () => {
      ed.paint.active = !ed.paint.active;
      refreshInspector();
    });
    if (ed.paint.active) paintBtn.classList.add('on');
    box.appendChild(paintBtn);
    const pal = document.createElement('canvas');
    pal.id = 'tilePalette';
    drawPalette(pal, sel);
    pal.addEventListener('click', (e) => {
      const r = pal.getBoundingClientRect();
      const scale = pal.width / r.width;
      const tw = sel.tileW || 32;
      const perRow = Math.max(1, Math.floor(pal.width / tw));
      const c = Math.floor(((e.clientX - r.left) * scale) / tw);
      const row = Math.floor(((e.clientY - r.top) * scale) / (sel.tileH || 32));
      ed.paint.tile = row * perRow + c;
      refreshInspector();
    });
    box.appendChild(pal);
    const hint = document.createElement('div');
    hint.className = 'paint-hint';
    hint.textContent = `tile: ${ed.paint.tile} · shift/right-click = erase`;
    box.appendChild(hint);
  }

  const actions = document.createElement('div');
  actions.className = 'prop-actions';
  actions.append(
    actionBtn('★ Prefab', async () => {
      const name = await promptDlg({ title: 'SAVE PREFAB', label: 'Save selection as prefab:', value: sel.name });
      if (!name) return;
      (ed.project.prefabs ||= {})[name] = serialize(sel);
      markDirty();
      refreshAddMenu();
      toast(`Prefab "${name}" saved`, 'ok');
    }),
    actionBtn('Duplicate', duplicateSel),
    actionBtn('↑', () => reorder(-1)),
    actionBtn('↓', () => reorder(1)),
    actionBtn('Delete', deleteSel, 'danger'),
  );
  box.appendChild(actions);
  box.scrollTop = scrollY;
}

function fieldRow(sel, key, val) {
  if (ENUM_FIELDS[key]) {
    return enumRow(key, val, ENUM_FIELDS[key], (v) => { sel[key] = v; markDirty(); });
  }
  if (IMAGE_FIELDS.has(key) || MODEL_FIELDS.has(key)) {
    const names = Object.keys(ed.project.assets).filter((n) =>
      MODEL_FIELDS.has(key) ? /\.(glb|gltf)$/i.test(n) : (ed.project.assets[n].startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(n))
    );
    const row = enumRow(key, val, ['', ...names], (v) => { sel[key] = v; markDirty(); });
    if (IMAGE_FIELDS.has(key)) {
      // ✎ opens the current texture straight in Paint.
      const wrap = document.createElement('div');
      wrap.className = 'with-btn';
      const selEl = row.querySelector('select');
      selEl.remove();
      wrap.appendChild(selEl);
      const edit = document.createElement('button');
      edit.className = 'asset-edit';
      edit.title = 'Edit in Paint';
      edit.textContent = '✎';
      edit.addEventListener('click', () => {
        const name = selEl.value;
        if (name && ed.project.assets[name]?.startsWith('data:image')) openPaint(winman, ed, name);
        else openPaint(winman, ed);
      });
      wrap.appendChild(edit);
      row.appendChild(wrap);
    }
    return row;
  }
  if (key in RANGE_FIELDS && typeof (val ?? 0) === 'number') {
    return rangeRow(key, val ?? 0, RANGE_FIELDS[key], (v) => { sel[key] = v; markDirty(); });
  }
  let kind = 'text';
  if (typeof val === 'boolean') kind = 'checkbox';
  else if (typeof val === 'number') kind = 'number';
  else if (COLOR_KEYS.has(key) && /^#[0-9a-fA-F]{6}$/.test(String(val))) kind = 'color';
  return propRow(key, val, kind, (v) => {
    sel[key] = kind === 'number' ? +v : v;
    markDirty();
  });
}

function drawPalette(pal, map) {
  const img = ed.assets.images[map.tileset];
  const tw = map.tileW || 32, th = map.tileH || 32;
  if (img && img.naturalWidth) {
    pal.width = img.naturalWidth;
    pal.height = img.naturalHeight;
    const c = pal.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0);
    const perRow = Math.max(1, Math.floor(pal.width / tw));
    c.strokeStyle = '#ff5c9e';
    c.lineWidth = 2;
    c.strokeRect((ed.paint.tile % perRow) * tw, Math.floor(ed.paint.tile / perRow) * th, tw, th);
  } else {
    pal.width = 4 * tw;
    pal.height = th;
    const c = pal.getContext('2d');
    ['#5b8c5a', '#7a6a53', '#4a6d8c', '#8c5a5b'].forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(i * tw, 0, tw, th);
    });
    c.strokeStyle = '#ff5c9e';
    c.lineWidth = 2;
    c.strokeRect((ed.paint.tile % 4) * tw, 0, tw, th);
  }
}

function duplicateSel() {
  const sel = ed.sel;
  if (!sel || !sel.parent) return;
  const copy = hydrate(serialize(sel));
  copy.name = uniqueName(sel.name.replace(/\d+$/, ''));
  if (!copy.is3D) { copy.x = (copy.x || 0) + 20; copy.y = (copy.y || 0) + 20; }
  else copy.x = (copy.x || 0) + 1;
  sel.parent.addChild(copy);
  markDirty();
  select(copy);
}

function reorder(dir) {
  const sib = ed.sel.parent.children;
  const i = sib.indexOf(ed.sel);
  const j = i + dir;
  if (j < 0 || j >= sib.length) return;
  [sib[i], sib[j]] = [sib[j], sib[i]];
  markDirty();
  refreshTree();
}

function deleteSel() {
  if (!ed.sel || !ed.sel.parent) return;
  ed.sel.destroy();
  ed.sel = null;
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

function rangeRow(label, value, max, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const lab = document.createElement('label');
  lab.textContent = label;
  const wrap = document.createElement('div');
  wrap.className = 'range-wrap';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = 0;
  input.max = max;
  input.step = 0.01;
  input.value = value;
  const readout = document.createElement('span');
  readout.className = 'range-val';
  readout.textContent = (+value).toFixed(2);
  input.addEventListener('input', () => {
    readout.textContent = (+input.value).toFixed(2);
    onChange(+input.value);
  });
  wrap.append(input, readout);
  row.append(lab, wrap);
  return row;
}

function enumRow(label, value, options, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const lab = document.createElement('label');
  lab.textContent = label;
  const selEl = document.createElement('select');
  selEl.innerHTML = options.map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${o || '— none —'}</option>`).join('');
  selEl.addEventListener('change', () => onChange(selEl.value));
  row.append(lab, selEl);
  return row;
}

function scriptRow(node) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const lab = document.createElement('label');
  lab.textContent = 'script';
  const selEl = document.createElement('select');
  selEl.innerHTML = '<option value="">— none —</option>' +
    Object.keys(ed.project.scripts).map((n) => `<option${n === node.script ? ' selected' : ''}>${n}</option>`).join('') +
    '<option value="__new__">+ new script…</option>';
  selEl.addEventListener('change', async () => {
    if (selEl.value === '__new__') {
      const name = await addScript();
      if (name) node.script = name;
    } else {
      node.script = selEl.value || null;
    }
    markDirty();
    refreshAll();
  });
  row.append(lab, selEl);
  return row;
}

// ----------------------------------------------------------------- assets

$('btnImportAsset').addEventListener('click', () => $('assetInput').click());
$('assetInput').addEventListener('change', (e) => importAssetFiles(e.target.files));

const assetGrid = $('assetGrid');
assetGrid.addEventListener('dragover', (e) => { e.preventDefault(); assetGrid.classList.add('drop-ok'); });
assetGrid.addEventListener('dragleave', () => assetGrid.classList.remove('drop-ok'));
assetGrid.addEventListener('drop', (e) => {
  e.preventDefault();
  assetGrid.classList.remove('drop-ok');
  importAssetFiles(e.dataTransfer.files);
});

async function importAssetFiles(files) {
  for (const file of files) {
    const url = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });
    ed.project.assets[file.name] = url;
    if (/\.(glb|gltf)$/i.test(file.name)) {
      toast(`Model "${file.name}" imported — use a Mesh3D with shape "model"`, 'ok', 4200);
    }
  }
  rebuildAssets();
  markDirty();
  refreshAssets();
  refreshInspector();
}

function refreshAssets() {
  assetGrid.innerHTML = '';
  for (const [name, url] of Object.entries(ed.project.assets)) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    const isImg = url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(name);
    const icon = /\.(glb|gltf)$/i.test(name) ? '🧊' : url.startsWith('data:audio') ? '🔊' : '📄';
    card.innerHTML =
      (isImg ? `<img src="${url}" alt="">` : `<div class="asset-icon">${icon}</div>`) +
      `<div class="asset-name" title="${name}">${name}</div>` +
      `<button class="asset-del" title="Remove asset">✕</button>`;
    if (isImg && url.startsWith('data:image')) {
      card.title = 'Double-click to edit in Paint';
      card.addEventListener('dblclick', () => openPaint(winman, ed, name));
    }
    card.querySelector('.asset-del').addEventListener('click', async () => {
      if (!(await confirmDlg({ title: 'REMOVE ASSET', message: `Remove asset "${name}"?`, okText: 'Remove', danger: true }))) return;
      delete ed.project.assets[name];
      rebuildAssets();
      markDirty();
      refreshAssets();
    });
    assetGrid.appendChild(card);
  }
  if (!Object.keys(ed.project.assets).length) {
    assetGrid.innerHTML = '<div class="empty" style="color:var(--dim);grid-column:1/-1;text-align:center;padding:20px">Drop images, audio, or .glb models here</div>';
  }
}

// ---------------------------------------------------------------- scripts

const codeEditor = new CodeEditor($('codePane'), {
  onChange: (src) => {
    if (currentScript) {
      ed.project.scripts[currentScript] = src;
      markDirty(false);
      collab.sendDoc(() => {
        const doc = serializeProject();
        doc.assets = {};
        return doc;
      });
    }
  },
});

function refreshScripts() {
  const selEl = $('scriptSelect');
  const names = Object.keys(ed.project.scripts);
  selEl.innerHTML = names.map((n) => `<option${n === currentScript ? ' selected' : ''}>${n}</option>`).join('') || '<option value="">no scripts</option>';
  openScript(currentScript || names[0]);
}

function openScript(name) {
  currentScript = name && ed.project.scripts[name] != null ? name : Object.keys(ed.project.scripts)[0] || null;
  codeEditor.setValue(currentScript ? ed.project.scripts[currentScript]
    : '// Create a script with ＋, then assign it to a node in the Inspector.\n// Hooks: ready(), update(dt), onPress(), onInput(e), onSignal(n,d), onCollide(o,side)');
}

$('scriptSelect').addEventListener('change', (e) => openScript(e.target.value));
$('btnAddScript').addEventListener('click', addScript);
$('btnDelScript').addEventListener('click', async () => {
  if (!currentScript) return;
  if (!(await confirmDlg({ title: 'DELETE SCRIPT', message: `Delete script "${currentScript}"?`, okText: 'Delete', danger: true }))) return;
  delete ed.project.scripts[currentScript];
  currentScript = null;
  markDirty();
  refreshScripts();
});

async function addScript() {
  let name = await promptDlg({ title: 'NEW SCRIPT', label: 'Script name', value: 'Script.js' });
  if (!name) return null;
  if (!name.endsWith('.js')) name += '.js';
  if (ed.project.scripts[name] == null) {
    ed.project.scripts[name] = `function ready() {\n  \n}\n\nfunction update(dt) {\n  \n}\n`;
  }
  currentScript = name;
  markDirty();
  refreshScripts();
  return name;
}

// ---------------------------------------------------------------- console

let conErrors = 0;
const conOrig = {};
(function hookConsoleForever() {
  for (const kind of ['log', 'warn', 'error']) {
    conOrig[kind] = console[kind];
    console[kind] = (...args) => {
      conOrig[kind](...args);
      conLine(kind, args);
    };
  }
  window.addEventListener('error', (e) => conLine('error', [e.message]));
})();

function conLine(kind, args) {
  const pane = $('consolePane');
  if (!pane) return;
  const div = document.createElement('div');
  div.className = 'con-line ' + kind;
  div.textContent = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  pane.appendChild(div);
  while (pane.children.length > 500) pane.firstChild.remove();
  pane.scrollTop = 1e9;
  if (kind === 'error') {
    try { errorsPanel.pushRuntime(div.textContent); } catch { /* panel not ready yet */ }
  }
}

// -------------------------------------------------------------- play mode

function startPlay() {
  timeline.stopPreviewOnly();
  timeline.restore(); // never bake a scrubbed pose into the running game
  setVpTab('game');
  const json = serializeProject();
  const mount = $('playMount');
  mount.innerHTML = '<div class="stage"></div>';
  const stage = mount.firstChild;
  const fit = () => {
    const r = mount.getBoundingClientRect();
    const s = Math.min(r.width / json.settings.width, r.height / json.settings.height) * 0.92;
    stage.style.width = json.settings.width * s + 'px';
    stage.style.height = json.settings.height * s + 'px';
  };
  fit();
  try {
    playing = new Game(json, stage);
    playing.start();
    window.__nekuGame = playing;
    plugins.emit('play', { game: playing });
  } catch (e) {
    conLine('error', ['game crashed on boot: ' + (e.stack || e.message)]);
  }

  // Debug bar: fps / node count / watches + pause·step controls.
  const bar = document.createElement('div');
  bar.id = 'debugBar';
  bar.innerHTML = `<button id="dbgPause" title="Pause/resume game loop">⏸</button>
    <button id="dbgStep" title="Step one frame">⏭</button>
    <span id="dbgStats"></span><span id="dbgWatch"></span>`;
  mount.appendChild(bar);
  bar.querySelector('#dbgPause').addEventListener('click', () => {
    if (!playing) return;
    playing._paused ? playing.resume() : playing.pause();
    bar.querySelector('#dbgPause').textContent = playing._paused ? '▶' : '⏸';
  });
  bar.querySelector('#dbgStep').addEventListener('click', () => {
    if (!playing) return;
    playing._paused || playing.pause();
    bar.querySelector('#dbgPause').textContent = '▶';
    playing.stepOnce();
  });
  debugTimer = setInterval(() => {
    if (!playing) return;
    let nodes = 0;
    (function count(n) { nodes++; n.children.forEach(count); })(playing.root);
    bar.querySelector('#dbgStats').textContent = ` ${playing.fps || '–'} fps · ${nodes} nodes · t=${playing.time.toFixed(1)}s`;
    const w = playing._watches;
    bar.querySelector('#dbgWatch').textContent = w?.size
      ? ' · ' + [...w].map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · ')
      : '';
  }, 250);

  $('btnPlay').textContent = '■ STOP';
  $('btnPlay').classList.add('playing');
}
let debugTimer = 0;

function stopPlay() {
  if (!playing) return;
  try { playing.stop(); } catch { /* already dead */ }
  playing = null;
  clearInterval(debugTimer);
  plugins.emit('stop', {});
  $('playMount').innerHTML = '';
  $('btnPlay').textContent = '▶ PLAY';
  $('btnPlay').classList.remove('playing');
  if (activeTab === 'game') setVpTab('2d');
}

$('btnPlay').addEventListener('click', () => (playing ? stopPlay() : startPlay()));

// ------------------------------------------------------------------ co-op

const collab = new CollabClient({
  onSnapshot: (doc) => {
    // Fresh room state: assets stream in right after the welcome.
    doc.assets = {};
    loadProjectJson(doc, { keepSelection: true });
  },
  onDoc: (doc) => {
    // Doc syncs without assets — keep the local asset store.
    doc.assets = { ...ed.project.assets };
    loadProjectJson(doc, { keepSelection: true });
  },
  onAsset: (name, url) => {
    ed.project.assets[name] = url;
    rebuildAssets();
    refreshAssets();
    refreshInspector();
    markDirty(false);
  },
  onAssetDel: (name) => {
    delete ed.project.assets[name];
    rebuildAssets();
    refreshAssets();
    markDirty(false);
  },
  onPeers: (list) => {
    ed.peers.clear();
    for (const p of list) if (p.id !== collab.id) ed.peers.set(p.id, p);
    refreshPeersUI();
    refreshTree();
    ed.onPeersChanged?.();
  },
  onPresence: (m) => {
    if (m.id === collab.id) return;
    const peer = ed.peers.get(m.id) || {};
    ed.peers.set(m.id, { ...peer, ...m });
    refreshPeersUI();
    refreshTree();
    ed.onPeersChanged?.();
  },
  onStatus: (s) => {
    const online = s === 'online';
    $('btnCoop').classList.toggle('on', online);
    $('btnCoop').textContent = online ? '◉ Co-op ON' : s === 'reconnecting' ? '◌ Co-op…' : '◉ Co-op';
    $('statusCoop').hidden = !online;
    if (online) {
      $('statusCoopText').textContent = 'co-op · room ' + getLocal('neku-coop-room', '');
      toast('Co-op session live — room ' + getLocal('neku-coop-room', ''), 'ok');
      // Hosts push their current project into a fresh room.
      markDirty(false);
    }
    if (s === 'reconnecting') status('co-op: reconnecting…');
    ed.onCoopStatus?.();
  },
  onError: (message) => toast('[co-op] ' + message, 'err', 4000),
});

function refreshPeersUI() {
  const box = $('peers');
  box.innerHTML = '';
  for (const p of ed.peers.values()) {
    const chip = document.createElement('span');
    chip.className = 'peer-chip';
    chip.style.background = p.color;
    chip.title = p.name;
    box.appendChild(chip);
  }
}

$('btnCoop').addEventListener('click', () => openCoop(winman, ed, collab));

// ----------------------------------------------------------------- menus

$('projectName').addEventListener('change', () => { ed.project.name = $('projectName').value; markDirty(); });

function setTheme(name) {
  clearCustomTheme();
  if (name === 'custom') {
    const saved = getJson('neku-custom-theme', null);
    document.body.dataset.theme = 'neku-dark';
    if (saved?.vars) applyCustomTheme(saved.vars);
  } else if (plugins.themes[name]) {
    document.body.dataset.theme = 'neku-dark';
    applyCustomTheme(plugins.themes[name]);
  } else {
    document.body.dataset.theme = name;
  }
  setLocal('neku-theme', name);
}

const fetchRepoFile = async (path) => await (await fetch('../' + path)).text();
const fetchRepoBytes = async (path) => {
  const local = await fetch('../' + path).catch(() => null);
  if (local?.ok) return new Uint8Array(await local.arrayBuffer());
  // Hosted mirrors (and the desktop Studio) fall back to the Pages copy.
  const remote = await fetch('https://deviverr.github.io/NEKU-Engine/' + path);
  if (!remote.ok) throw new Error('could not fetch ' + path);
  return new Uint8Array(await remote.arrayBuffer());
};

const slug = (s) => (s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

const kindFromName = (name) =>
  /\.(neku|nk|json)$/.test(name) ? 'project' :
  name.endsWith('.nkp') ? 'prefab' :
  name.endsWith('.nkt') ? 'theme' :
  name.endsWith('.nkx') ? 'plugin' : 'any';

function download(name, text, type = 'application/json') {
  if (native) {
    native.saveFile(name, text, kindFromName(name)).then((p) => p && status('saved ' + p));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadBytes(name, bytes, type) {
  if (native) {
    native.saveFile(name, bytes, 'any').then((p) => p && status('saved ' + p));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Browser fallback file picker returning { name, text }.
function pickWebFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = async () => {
      const f = inp.files[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    inp.click();
  });
}

function prefsContext() {
  return {
    plugins,
    native,
    download,
    setTheme,
    async openThemeFile() {
      const file = native ? await native.openFile('theme') : await pickWebFile('.nkt,.json');
      if (!file) return;
      try {
        const t = JSON.parse(file.text);
        if (!t.vars) throw new Error('not a .nkt theme');
        setJson('neku-custom-theme', t);
        setTheme('custom');
        toast('Theme imported', 'ok');
      } catch (e) {
        toast('Could not load theme: ' + e.message, 'err');
      }
    },
    async openPluginFile() {
      return native ? await native.openFile('plugin') : await pickWebFile('.nkx,.js');
    },
    log: (msg) => output.log(msg),
  };
}

async function openProject() {
  if (native) {
    try {
      const file = await native.openFile('project');
      if (!file) return;
      loadProjectJson(JSON.parse(file.text));
      markDirty();
    } catch (e) {
      toast('Could not open project: ' + e.message, 'err');
    }
    return;
  }
  $('fileInput').click();
}
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    loadProjectJson(JSON.parse(await file.text()));
    markDirty();
  } catch (err) {
    toast('Not a valid Neku project: ' + err.message, 'err');
  }
  e.target.value = '';
});

async function loadSample(file) {
  try {
    loadProjectJson(await (await fetch(`../projects/${file}.json`)).json());
    markDirty();
  } catch (e) {
    toast('Could not load sample: ' + e.message, 'err');
  }
}

function saveProject() {
  download(slug(ed.project.name) + '.neku', JSON.stringify(serializeProject(), null, 2));
  status('project saved as .neku');
}

async function exportHtml() {
  const t0 = performance.now();
  try {
    const html = await buildExport(serializeProject(), fetchRepoFile);
    download(slug(ed.project.name) + '.html', html, 'text/html');
    output.log(`export HTML: ${slug(ed.project.name)}.html — ${(html.length / 1024).toFixed(1)} KB in ${Math.round(performance.now() - t0)} ms`);
    plugins.emit('export', { kind: 'html' });
    dock.activate('output');
    toast('Exported HTML — ' + (html.length / 1024).toFixed(0) + ' KB', 'ok');
  } catch (e) {
    toast('Export failed: ' + e.message, 'err');
    output.log('export FAILED: ' + e.message);
  }
}

async function exportItchZip() {
  const t0 = performance.now();
  try {
    const bytes = await buildZip(serializeProject(), fetchRepoFile);
    downloadBytes(slug(ed.project.name) + '.zip', bytes, 'application/zip');
    output.log(`export itch.io ZIP: ${slug(ed.project.name)}.zip — ${(bytes.length / 1024).toFixed(1)} KB in ${Math.round(performance.now() - t0)} ms`);
    plugins.emit('export', { kind: 'zip' });
    dock.activate('output');
    toast('Exported itch.io ZIP', 'ok');
  } catch (e) {
    toast('Export failed: ' + e.message, 'err');
    output.log('export FAILED: ' + e.message);
  }
}

async function exportDesktop() {
  const t0 = performance.now();
  dock.activate('output');
  output.log('desktop export: building mac / windows / linux…');
  const note = toast('Building desktop apps… (first run downloads the player binaries)', 'info', 60000);
  try {
    const zips = await buildDesktopApps(serializeProject(), fetchRepoFile, fetchRepoBytes, (m) => output.log(m));
    for (const z of zips) {
      downloadBytes(z.name, z.bytes, 'application/zip');
      output.log(`desktop export: ${z.name} — ${(z.bytes.length / 1048576).toFixed(1)} MB`);
    }
    output.log(`desktop export done in ${Math.round(performance.now() - t0)} ms`);
    plugins.emit('export', { kind: 'desktop' });
    toast('Desktop apps exported for macOS, Windows, Linux', 'ok', 4500);
  } catch (e) {
    toast('Desktop export failed: ' + e.message, 'err', 5000);
    output.log('desktop export FAILED: ' + e.message);
  } finally {
    note.remove();
  }
}

function exportPrefab() {
  if (!ed.sel || !ed.sel.parent) return toast('Select a node first', 'warn');
  download(slug(ed.sel.name) + '.nkp', JSON.stringify({ neku: 'prefab', name: ed.sel.name, node: serialize(ed.sel) }, null, 2));
}

async function importPrefab() {
  const file = native ? await native.openFile('prefab') : await pickWebFile('.nkp,.json');
  if (!file) return;
  try {
    const p = JSON.parse(file.text);
    if (p.neku !== 'prefab') throw new Error('not a .nkp prefab');
    (ed.project.prefabs ||= {})[p.name] = p.node;
    markDirty();
    refreshAddMenu();
    explorer.refresh();
    output.log(`imported prefab "${p.name}"`);
    toast(`Prefab "${p.name}" imported`, 'ok');
  } catch (e) {
    toast('Import failed: ' + e.message, 'err');
  }
}

const LAYOUTS = {
  'Default': [{ hierarchy: 'left', assets: 'left', inspector: 'right', script: 'bottom', console: 'bottom', timeline: 'bottom' }, { left: 230, right: 270, bottom: 240 }],
  'Code': [{ hierarchy: 'left', assets: 'left', inspector: 'left', script: 'right', console: 'bottom', timeline: 'bottom' }, { left: 220, right: 480, bottom: 160 }],
  'Animation': [{ hierarchy: 'left', assets: 'left', inspector: 'right', timeline: 'bottom', script: 'bottom', console: 'bottom' }, { left: 200, right: 260, bottom: 300 }],
  'Art': [{ assets: 'right', hierarchy: 'left', inspector: 'right', script: 'bottom', console: 'bottom', timeline: 'bottom' }, { left: 200, right: 320, bottom: 180 }],
};

function showMainMenu() {
  openMainMenu({
    templates: () => plugins.templates,
    newFromTemplate(json) {
      loadProjectJson(json);
      markDirty(false);
    },
    openFile: () => openProject(),
    loadSample,
    loadRecent(name) {
      try {
        const json = getJson('neku-recent:' + name, null);
        if (!json) throw new Error('missing recent');
        loadProjectJson(json);
        markDirty(false);
      } catch {
        toast('Could not load recent project', 'err');
      }
    },
  });
}

$('logo').addEventListener('click', showMainMenu);

function openHelp() {
  $('helpOverlay').hidden = false;
  $('btnHelpClose').focus();
}
function closeHelp() {
  $('helpOverlay').hidden = true;
}
$('helpOverlay').querySelectorAll('[data-help-close]').forEach((btn) => btn.addEventListener('click', closeHelp));
$('helpOverlay').addEventListener('pointerdown', (e) => {
  if (e.target === $('helpOverlay')) closeHelp();
});

function aboutDlg() {
  infoDlg({
    title: 'ABOUT NEKU',
    bodyHTML: `<div style="display:flex;gap:14px;align-items:center">
      <img src="cwat.svg" alt=">w<" style="width:64px;height:64px;image-rendering:pixelated" />
      <div><b>Neku Engine ${VERSION}</b><br>
      <span style="color:var(--dim)">ultra-lightweight 2D/3D games &amp; apps<br>
      mascot: cwat &gt;w&lt; · MIT · made for shipping silly ideas fast</span></div>
    </div>`,
  });
}

const MOD = navigator.platform?.startsWith('Mac') ? '⌘' : 'Ctrl+';

const menubar = new MenuBar($('menubar'), () => [
  {
    label: 'File',
    items: [
      { label: 'New Project…', shortcut: MOD + 'N', action: showMainMenu },
      { label: 'Open…', shortcut: MOD + 'O', action: openProject },
      {
        label: 'Open Recent', submenu: () =>
          getJson('neku-recents', []).map((r) => ({
            label: r.name,
            action: () => {
              const json = getJson('neku-recent:' + r.name, null);
              if (json) { loadProjectJson(json); markDirty(false); }
              else toast('Could not load recent project', 'err');
            },
          })),
      },
      {
        label: 'Samples', submenu: () => [
          { label: '🕹 Neku Arcade — 3D · CRT · Screen3D', action: () => loadSample('neku-arcade') },
          { label: '🧮 Casino Calculator — 2D + 3D coin', action: () => loadSample('casino-calculator') },
          { label: '🧱 Neku Breakout — 2D physics · ~50 KB', action: () => loadSample('neku-breakout') },
        ],
      },
      { sep: true },
      { label: 'Save Project (.neku)', shortcut: MOD + 'S', action: saveProject },
      { sep: true },
      { label: 'Import Asset…', action: () => $('assetInput').click() },
      { label: 'Import Prefab (.nkp)…', action: importPrefab },
      { sep: true },
      {
        label: 'Export', submenu: () => [
          { label: '⬇ HTML file — one self-contained file', action: exportHtml },
          { label: '⬇ itch.io ZIP — upload as HTML game', action: exportItchZip },
          { label: '⬇ Desktop apps — macOS · Windows · Linux', action: exportDesktop },
          { sep: true },
          { label: '⬇ Prefab .nkp — selected node', action: exportPrefab, enabled: () => !!(ed.sel && ed.sel.parent) },
        ],
      },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', shortcut: MOD + 'Z', action: undo, enabled: () => undoStack.length > 0 },
      { label: 'Redo', shortcut: '⇧' + MOD + 'Z', action: redo, enabled: () => redoStack.length > 0 },
      { sep: true },
      { label: 'Duplicate Node', shortcut: MOD + 'D', action: duplicateSel, enabled: () => !!(ed.sel && ed.sel.parent) },
      { label: 'Rename Node…', shortcut: 'F2', action: () => ed.sel && renameNode(ed.sel), enabled: () => !!ed.sel },
      { label: 'Delete Node', shortcut: '⌫', action: deleteSel, enabled: () => !!(ed.sel && ed.sel.parent) },
    ],
  },
  {
    label: 'View',
    items: [
      { label: '2D Viewport', shortcut: MOD + '1', action: () => setVpTab('2d'), checked: () => activeTab === '2d' },
      { label: '3D Viewport', shortcut: MOD + '2', action: () => setVpTab('3d'), checked: () => activeTab === '3d' },
      { label: 'Game', shortcut: MOD + '3', action: () => setVpTab('game'), checked: () => activeTab === 'game' },
      { sep: true },
      {
        label: 'Layout', submenu: () =>
          Object.entries(LAYOUTS).map(([name, [map, sizes]]) => ({
            label: name,
            action: () => dock.applyPreset(map, sizes),
          })),
      },
    ],
  },
  {
    label: 'Project',
    items: [
      { label: 'Project Settings…', action: () => openProjectSettings(winman, ed) },
      { label: 'Co-op (Team Create)…', action: () => openCoop(winman, ed, collab) },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: '🎨 Paint', action: () => openPaint(winman, ed) },
      ...plugins.tools.map((t) => ({ label: '⚡ ' + t.label, action: () => t.fn(ed) })),
      { sep: true },
      { label: 'Extensions (.nkx)…', action: () => openPreferences(winman, ed, prefsContext(), 'extensions') },
      { label: 'Preferences…', action: () => openPreferences(winman, ed, prefsContext()) },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Cheatsheet', shortcut: '?', action: openHelp },
      { label: 'API Reference', action: () => window.open('https://github.com/deviverr/NEKU-Engine/blob/main/docs/API.md', '_blank') },
      { label: 'Publishing Guide', action: () => window.open('https://github.com/deviverr/NEKU-Engine/blob/main/docs/PUBLISHING.md', '_blank') },
      { sep: true },
      { label: 'GitHub', action: () => window.open('https://github.com/deviverr/NEKU-Engine', '_blank') },
      { label: 'About Neku…', action: aboutDlg },
    ],
  },
]);

// --------------------------------------------------------------- keyboard

window.addEventListener('keydown', (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) ||
    document.activeElement?.closest('.cm-editor');
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') { menubar.closeAll(); if (!$('helpOverlay').hidden) closeHelp(); }
  if (mod && e.key === 'Enter') { e.preventDefault(); playing ? stopPlay() : startPlay(); return; }
  if (mod && e.key === 's') { e.preventDefault(); saveProject(); return; }
  if (mod && e.key === 'o') { e.preventDefault(); openProject(); return; }
  if (mod && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    setVpTab({ 1: '2d', 2: '3d', 3: 'game' }[e.key]);
    return;
  }
  if (inField || playing) return;
  if (e.key === '?' ) { openHelp(); return; }
  if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (mod && e.key === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (e.key === 'F2' && ed.sel) { e.preventDefault(); renameNode(ed.sel); return; }
  if (!ed.sel) return;
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); }
  const step = e.shiftKey ? 10 : 1;
  const map3d = { ArrowLeft: ['x', -0.25], ArrowRight: ['x', 0.25], ArrowUp: ['z', -0.25], ArrowDown: ['z', 0.25] };
  const map2d = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] };
  const m = (ed.sel.is3D ? map3d : map2d)[e.key];
  if (m) {
    e.preventDefault();
    ed.sel[m[0]] = Math.round(((ed.sel[m[0]] || 0) + m[1]) * 100) / 100;
    markDirty();
    refreshInspector();
  }
});

// ------------------------------------------------------------------- boot

function refreshAll() {
  rebuildAssets();
  refreshTree();
  refreshInspector();
  refreshScripts();
  refreshAssets();
  refreshAddMenu();
  timeline.stopPreviewOnly();
  timeline.baseline = null; // scene was rebuilt; old snapshot is stale
  timeline.refresh();
  explorer.refresh();
  errorsPanel.check();
  plugins.emit('projectLoaded', { name: ed.project?.name });
}
ed.refreshAssets = refreshAssets;

(async function boot() {
  splash.set(48, 'checking for desktop shell…');
  native = await initNative().catch(() => null);
  splash.set(60, 'loading extensions…');
  plugins.loadAll();

  setTheme(getLocal('neku-theme', 'neku-dark'));
  $('statusVer').textContent = `NEKU ${VERSION}${native ? ' · desktop' : ''}`;

  splash.set(78, 'restoring project…');
  const saved = getLocal('neku-project') || getLocal('cce-project');
  let firstRun = false;
  if (saved) {
    try { loadProjectJson(JSON.parse(saved)); }
    catch { loadProjectJson(emptyProjectJson()); }
  } else {
    firstRun = true;
    try { loadProjectJson(await (await fetch('../projects/neku-arcade.json')).json()); }
    catch { loadProjectJson(emptyProjectJson()); }
  }
  splash.set(92, 'warming up viewports…');
  if (firstRun) showMainMenu();

  (function loop(now) {
    if (!playing) {
      timeline.frame(now || performance.now());
      if (activeTab === '2d') vp2d.render();
      else if (activeTab === '3d') vp3d.render();
    }
    requestAnimationFrame(loop);
  })(performance.now());

  splash.done();
  status(VP_HINTS['2d']);
})();
