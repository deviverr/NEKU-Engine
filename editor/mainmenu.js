// Neku Studio — main menu (welcome screen) + project templates.

import { getJson, removeLocal, setJson } from './session.js';

export const TEMPLATES = {
  'Blank': {
    name: 'New Game',
    settings: { width: 480, height: 720, background: '#1b2735' },
    mainScene: 'Main',
    scenes: [{ name: 'Main', root: { type: 'Node', name: 'Main' } }],
    scripts: {}, assets: {}, anims: {}, prefabs: {},
  },

  '2D Game': {
    name: '2D Game',
    settings: { width: 480, height: 640, background: '#12152b', pixelated: true, physics: { gravity: 1200 } },
    mainScene: 'Main',
    scenes: [{ name: 'Main', root: { type: 'Node', name: 'Main', script: 'Game.js', children: [
      { type: 'Rect', name: 'Ground', x: 240, y: 610, w: 480, h: 60, color: '#2d6a4f', body: 'static' },
      { type: 'Rect', name: 'Platform', x: 340, y: 480, w: 140, h: 20, color: '#2d6a4f', radius: 4, body: 'static' },
      { type: 'Rect', name: 'Player', x: 120, y: 500, w: 28, h: 36, color: '#29e6c4', radius: 4, body: 'dynamic', script: 'Player.js' },
      { type: 'Label', name: 'Hint', x: 240, y: 60, text: '← → move · space jump', size: 16, color: '#8d84ad' },
    ] } }],
    scripts: {
      'Game.js': `function ready() {\n  // global game logic lives here\n}\n`,
      'Player.js': `const SPEED = 220;\nconst JUMP = 520;\n\nfunction update(dt) {\n  self.vx = 0;\n  if (game.input.isDown('ArrowLeft')) self.vx = -SPEED;\n  if (game.input.isDown('ArrowRight')) self.vx = SPEED;\n  if (game.input.justPressed(' ') && self._grounded) {\n    self.vy = -JUMP;\n    game.audio.play('pop');\n  }\n}\n`,
    },
    assets: {}, anims: {}, prefabs: {},
  },

  '3D Game': {
    name: '3D Game',
    settings: { width: 960, height: 540, background: '#0a0a14' },
    mainScene: 'Main',
    scenes: [{ name: 'Main', root: { type: 'Node', name: 'Main', children: [
      { type: 'Camera3D', name: 'Camera', x: 0, y: 4, z: 8, ty: 0.5, fov: 55 },
      { type: 'Light3D', name: 'Sun', kind: 'directional', x: 3, y: 6, z: 4, intensity: 1.4 },
      { type: 'Light3D', name: 'Fill', kind: 'ambient', intensity: 0.4 },
      { type: 'Mesh3D', name: 'Floor', shape: 'plane', w: 20, d: 20, color: '#1c2136', roughness: 0.9 },
      { type: 'Mesh3D', name: 'Player', shape: 'box', w: 1, h: 1, d: 1, y: 0.5, color: '#29e6c4', script: 'Move3D.js' },
      { type: 'Mesh3D', name: 'Pickup', shape: 'sphere', radius: 0.4, x: 3, y: 0.5, color: '#ffcb47', emissive: '#8a6a10', script: 'Spin.js' },
    ] } }],
    scripts: {
      'Move3D.js': `const SPEED = 5;\n\nfunction update(dt) {\n  if (game.input.isDown('ArrowLeft') || game.input.isDown('a')) self.x -= SPEED * dt;\n  if (game.input.isDown('ArrowRight') || game.input.isDown('d')) self.x += SPEED * dt;\n  if (game.input.isDown('ArrowUp') || game.input.isDown('w')) self.z -= SPEED * dt;\n  if (game.input.isDown('ArrowDown') || game.input.isDown('s')) self.z += SPEED * dt;\n  self.ry += 40 * dt;\n}\n`,
      'Spin.js': `function update(dt) {\n  self.ry += 120 * dt;\n  const p = game.find('Player');\n  if (Math.hypot(p.x - self.x, p.z - self.z) < 1 && self.visible) {\n    self.visible = false;\n    game.audio.play('coin');\n  }\n}\n`,
    },
    assets: {}, anims: {}, prefabs: {},
  },

  'App': {
    name: 'My App',
    settings: { width: 420, height: 720, background: '#16121f' },
    mainScene: 'Main',
    scenes: [{ name: 'Main', root: { type: 'Node', name: 'Main', script: 'App.js', children: [
      { type: 'Label', name: 'Title', x: 210, y: 70, text: 'MY APP', size: 34, bold: true, color: '#29e6c4' },
      { type: 'TextInput', name: 'Input', x: 210, y: 160, w: 320, placeholder: 'type something…' },
      { type: 'Button', name: 'btnGo', x: 210, y: 230, w: 320, h: 52, text: 'DO THE THING', color: '#8e2f4f' },
      { type: 'Label', name: 'Output', x: 210, y: 320, text: '…', size: 20, color: '#e6e1f5' },
    ] } }],
    scripts: {
      'App.js': `function ready() {\n  game.on('button', (name) => {\n    if (name === 'btnGo') run();\n  });\n  game.on('submit', () => run());\n}\n\nfunction run() {\n  const text = game.find('Input').text || '(nothing)';\n  game.find('Output').text = '→ ' + text;\n  game.audio.play('pop');\n}\n`,
    },
    assets: {}, anims: {}, prefabs: {},
  },
};

export const VERSION = '2.0.0';

export function recordRecent(name, json) {
  try {
    const list = getJson('neku-recents', []).filter((r) => r.name !== name);
    list.unshift({ name, ts: Date.now() });
    while (list.length > 6) {
      const dead = list.pop();
      removeLocal('neku-recent:' + dead.name);
    }
    setJson('neku-recents', list);
    setJson('neku-recent:' + name, json);
  } catch { /* storage full — recents are best-effort */ }
}

export function openMainMenu(ctx) {
  // ctx: { newFromTemplate(json), openFile(), loadSample(name), loadRecent(name), templates() }
  document.getElementById('mainMenu')?.remove();
  const el = document.createElement('div');
  el.id = 'mainMenu';
  const recents = getJson('neku-recents', []);
  const extra = Object.keys(ctx.templates?.() || {});

  el.innerHTML = `
    <div id="mmBox">
      <div id="mmLeft">
        <img src="cwat.svg" alt=">w<" id="mmCat" />
        <div id="mmTitle">NEKU<br>ENGINE</div>
        <div id="mmVer">v${VERSION} · ultra-light games &amp; apps</div>
        <div id="mmLinks">
          <a href="https://github.com/deviverr/NEKU-Engine" target="_blank">github</a> ·
          <span class="mm-help">cheatsheet: Help → Cheatsheet (or ?)</span>
        </div>
      </div>
      <div id="mmRight">
        <div class="mm-section">NEW PROJECT</div>
        <div class="mm-grid">
          ${Object.keys(TEMPLATES).map((t) => `<button data-tpl="${t}"><b>${t}</b></button>`).join('')}
          ${extra.map((t) => `<button data-ptpl="${t}"><b>★ ${t}</b></button>`).join('')}
        </div>
        <div class="mm-section">SAMPLES</div>
        <div class="mm-grid">
          <button data-sample="neku-arcade"><b>🕹 Neku Arcade</b><span>3D · CRT · Screen3D</span></button>
          <button data-sample="neku-breakout"><b>🧱 Breakout</b><span>2D · physics · 51 KB</span></button>
          <button data-sample="casino-calculator"><b>🧮 Casino Calc</b><span>2D + 3D coin</span></button>
        </div>
        <div class="mm-section">RECENT</div>
        <div class="mm-recents">
          ${recents.map((r) => `<button data-recent="${r.name}"><b>${r.name}</b><span>${new Date(r.ts).toLocaleDateString()}</span></button>`).join('') || '<span class="dim-note">nothing yet — go make something >w<</span>'}
        </div>
        <div class="mm-row">
          <button id="mmOpen">📂 Open project…</button>
          <button id="mmClose" class="accent">→ To the editor</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const close = () => el.remove();
  el.querySelector('#mmClose').addEventListener('click', close);
  el.querySelector('#mmOpen').addEventListener('click', () => { close(); ctx.openFile(); });
  el.querySelectorAll('[data-tpl]').forEach((b) =>
    b.addEventListener('click', () => { close(); ctx.newFromTemplate(structuredClone(TEMPLATES[b.dataset.tpl])); }));
  el.querySelectorAll('[data-ptpl]').forEach((b) =>
    b.addEventListener('click', () => { close(); ctx.newFromTemplate(structuredClone(ctx.templates()[b.dataset.ptpl])); }));
  el.querySelectorAll('[data-sample]').forEach((b) =>
    b.addEventListener('click', () => { close(); ctx.loadSample(b.dataset.sample); }));
  el.querySelectorAll('[data-recent]').forEach((b) =>
    b.addEventListener('click', () => { close(); ctx.loadRecent(b.dataset.recent); }));
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
}
