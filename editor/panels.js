// Neku Studio — Explorer (project browser + multi-scene), Errors, Output.

import { confirmDlg, promptDlg } from './dialogs.js';

export class ExplorerPanel {
  constructor(el, ed, hooks) {
    this.ed = ed;
    this.hooks = hooks; // { openScript, showPanel, selectAnim, refreshAll }
    el.innerHTML = `<div class="fill-scroll" id="explorerTree"></div>`;
    this.tree = el.querySelector('#explorerTree');
  }

  refresh() {
    const ed = this.ed, p = ed.project;
    if (!p) return;
    const h = [];
    const section = (label, addId) =>
      h.push(`<div class="xp-section">${label}${addId ? `<button class="xp-add" data-add="${addId}">＋</button>` : ''}</div>`);

    section('Scenes', 'scene');
    for (const s of p.scenes) {
      const current = s.name === ed.currentScene;
      const main = s.name === p.mainScene;
      h.push(`<div class="xp-row ${current ? 'on' : ''}" data-scene="${s.name}">
        <span>${current ? '▸' : '·'} ${s.name}</span><span class="flex"></span>
        <button class="xp-star ${main ? 'main' : ''}" data-main="${s.name}" title="Set as start scene">${main ? '★' : '☆'}</button>
        ${p.scenes.length > 1 ? `<button data-delscene="${s.name}" title="Delete scene">✕</button>` : ''}
      </div>`);
    }
    section('Scripts', 'script');
    for (const name of Object.keys(p.scripts)) h.push(`<div class="xp-row" data-script="${name}"><span>𝒇 ${name}</span></div>`);
    section('Assets');
    for (const name of Object.keys(p.assets)) h.push(`<div class="xp-row" data-asset="${name}"><span>🖼 ${name}</span></div>`);
    section('Animations');
    for (const name of Object.keys(p.anims || {})) h.push(`<div class="xp-row" data-anim="${name}"><span>◆ ${name}</span></div>`);
    section('Prefabs');
    for (const name of Object.keys(p.prefabs || {})) h.push(`<div class="xp-row" data-prefab="${name}"><span>★ ${name}</span></div>`);
    this.tree.innerHTML = h.join('');

    const $$ = (sel) => [...this.tree.querySelectorAll(sel)];
    $$('[data-scene]').forEach((r) =>
      r.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.ed.currentScene = r.dataset.scene;
        this.ed.select(null);
        this.hooks.refreshAll();
      })
    );
    $$('[data-main]').forEach((b) =>
      b.addEventListener('click', () => {
        this.ed.project.mainScene = b.dataset.main;
        this.ed.markDirty();
        this.refresh();
      })
    );
    $$('[data-delscene]').forEach((b) =>
      b.addEventListener('click', async () => {
        const name = b.dataset.delscene;
        if (!(await confirmDlg({ title: 'DELETE SCENE', message: `Delete scene "${name}"?`, okText: 'Delete', danger: true }))) return;
        const p = this.ed.project;
        p.scenes = p.scenes.filter((s) => s.name !== name);
        if (p.mainScene === name) p.mainScene = p.scenes[0].name;
        if (this.ed.currentScene === name) this.ed.currentScene = p.scenes[0].name;
        this.ed.markDirty();
        this.hooks.refreshAll();
      })
    );
    $$('[data-script]').forEach((r) => r.addEventListener('click', () => this.hooks.openScript(r.dataset.script)));
    $$('[data-asset]').forEach((r) => r.addEventListener('click', () => this.hooks.showPanel('assets')));
    $$('[data-anim]').forEach((r) => r.addEventListener('click', () => this.hooks.selectAnim(r.dataset.anim)));
    $$('[data-add]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (b.dataset.add === 'scene') {
          const name = await promptDlg({ title: 'NEW SCENE', label: 'Scene name', value: 'Scene' + (this.ed.project.scenes.length + 1) });
          if (!name || this.ed.project.scenes.some((s) => s.name === name)) return;
          this.ed.project.scenes.push({ name, root: this.hooks.hydrate({ type: 'Node', name }) });
          this.ed.currentScene = name;
          this.ed.markDirty();
          this.hooks.refreshAll();
        } else if (b.dataset.add === 'script') {
          this.hooks.addScript();
        }
      })
    );
  }
}

export class ErrorsPanel {
  constructor(el, ed, hooks) {
    this.ed = ed;
    this.hooks = hooks; // { openScript }
    this.runtime = []; // { message }
    el.innerHTML = `<div class="fill-scroll" id="errList"></div>`;
    this.list = el.querySelector('#errList');
  }

  pushRuntime(message) {
    this.runtime.push({ message: String(message).slice(0, 300) });
    if (this.runtime.length > 100) this.runtime.shift();
    this.refresh();
  }

  clearRuntime() {
    this.runtime = [];
    this.refresh();
  }

  // Compile-check every script (same wrapper the engine uses).
  check() {
    this.syntax = [];
    for (const [name, src] of Object.entries(this.ed.project?.scripts || {})) {
      try {
        new Function('self', 'game', `"use strict";\n${src}`);
      } catch (e) {
        this.syntax.push({ file: name, message: e.message });
      }
    }
    this.refresh();
    return this.syntax.length;
  }

  refresh() {
    const rows = [];
    for (const e of this.syntax || []) {
      rows.push(`<div class="err-row" data-file="${e.file}"><b>SYNTAX</b><span class="err-file">${e.file}</span><span>${e.message}</span></div>`);
    }
    for (const e of this.runtime) {
      rows.push(`<div class="err-row rt"><b>RUNTIME</b><span>${e.message.replace(/</g, '&lt;')}</span></div>`);
    }
    this.list.innerHTML = rows.join('') ||
      `<div class="err-empty"><img src="cwat.svg" alt=""> no errors >w<</div>`;
    this.list.querySelectorAll('[data-file]').forEach((r) =>
      r.addEventListener('click', () => this.hooks.openScript(r.dataset.file))
    );
  }
}

export class OutputPanel {
  constructor(el) {
    el.innerHTML = `<div class="fill-scroll" id="outList"></div>`;
    this.list = el.querySelector('#outList');
  }

  log(msg) {
    const div = document.createElement('div');
    div.className = 'out-line';
    div.innerHTML = `<span class="out-time">${new Date().toLocaleTimeString()}</span> ${String(msg).replace(/</g, '&lt;')}`;
    this.list.appendChild(div);
    while (this.list.children.length > 300) this.list.firstChild.remove();
    this.list.scrollTop = 1e9;
  }
}
