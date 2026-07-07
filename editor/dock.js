// Neku Studio dock — tabbed panel zones with drag-to-move and resizable
// splitters. Zones: left / right / bottom (tab stacks) + center (viewports).

export class Dock {
  constructor(root) {
    this.root = root;
    this.panels = new Map(); // id -> { id, title, el, zone }
    root.innerHTML = `
      <div class="zone" data-zone="left"><div class="zone-tabs"></div><div class="zone-body"></div></div>
      <div class="splitter" data-dir="v"></div>
      <div class="zone" data-zone="center"></div>
      <div class="splitter" data-dir="v2"></div>
      <div class="zone" data-zone="right"><div class="zone-tabs"></div><div class="zone-body"></div></div>
      <div class="splitter" data-dir="h"></div>
      <div class="zone" data-zone="bottom"><div class="zone-tabs"></div><div class="zone-body"></div></div>`;
    this.zones = {};
    for (const z of root.querySelectorAll('.zone')) this.zones[z.dataset.zone] = z;
    this._initSplitters();
    this._initDrops();
    this.layout = JSON.parse(localStorage.getItem('neku-dock') || '{}');
  }

  center() {
    return this.zones.center;
  }

  addPanel({ id, title, el, zone }) {
    zone = this.layout[id] || zone;
    const panel = { id, title, el, zone };
    el.classList.add('dock-panel');
    this.panels.set(id, panel);
    this._mount(panel, zone);
    return panel;
  }

  _mount(panel, zoneName) {
    const zone = this.zones[zoneName] || this.zones.left;
    panel.zone = zoneName;
    zone.querySelector('.zone-body').appendChild(panel.el);

    const tab = document.createElement('div');
    tab.className = 'zone-tab';
    tab.textContent = panel.title;
    tab.draggable = true;
    tab.dataset.panel = panel.id;
    tab.addEventListener('click', () => this.activate(panel.id));
    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/neku-panel', panel.id);
      tab.classList.add('dragging');
    });
    tab.addEventListener('dragend', () => tab.classList.remove('dragging'));
    zone.querySelector('.zone-tabs').appendChild(tab);
    panel.tab = tab;
    this.activate(panel.id);
  }

  activate(id) {
    const panel = this.panels.get(id);
    if (!panel) return;
    const zone = this.zones[panel.zone];
    for (const p of this.panels.values()) {
      if (p.zone === panel.zone) {
        p.el.classList.toggle('active', p === panel);
        p.tab.classList.toggle('active', p === panel);
      }
    }
    zone.querySelector('.zone-body').dispatchEvent(new CustomEvent('panel-shown', { detail: id, bubbles: true }));
  }

  // Layout presets: { panelId: zoneName }, optional sizes { left, right, bottom } px.
  applyPreset(map, sizes = {}) {
    for (const [id, zone] of Object.entries(map)) this.movePanel(id, zone);
    const vars = { left: '--zw-left', right: '--zw-right', bottom: '--zh-bottom' };
    for (const [k, v] of Object.entries(sizes)) this.root.style.setProperty(vars[k], v + 'px');
    for (const z of ['left', 'right', 'bottom']) {
      const first = [...this.panels.values()].find((p) => p.zone === z);
      if (first) this.activate(first.id);
    }
  }

  movePanel(id, zoneName) {
    const panel = this.panels.get(id);
    if (!panel || panel.zone === zoneName || !this.zones[zoneName]) return;
    panel.tab.remove();
    panel.el.remove();
    this._mount(panel, zoneName);
    // keep the old zone showing something
    const orphanZone = [...this.panels.values()].find((p) => p.zone !== zoneName);
    for (const z of ['left', 'right', 'bottom']) {
      const first = [...this.panels.values()].find((p) => p.zone === z);
      if (first && ![...this.panels.values()].some((p) => p.zone === z && p.el.classList.contains('active'))) {
        this.activate(first.id);
      }
    }
    this.layout[id] = zoneName;
    localStorage.setItem('neku-dock', JSON.stringify(this.layout));
  }

  _initDrops() {
    for (const [name, zone] of Object.entries(this.zones)) {
      if (name === 'center') continue;
      zone.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('text/neku-panel')) {
          e.preventDefault();
          zone.classList.add('drop-ok');
        }
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-ok'));
      zone.addEventListener('drop', (e) => {
        zone.classList.remove('drop-ok');
        const id = e.dataTransfer.getData('text/neku-panel');
        if (id) {
          e.preventDefault();
          this.movePanel(id, name);
        }
      });
    }
  }

  _initSplitters() {
    const saved = JSON.parse(localStorage.getItem('neku-dock-sizes') || '{}');
    const vars = { v: '--zw-left', v2: '--zw-right', h: '--zh-bottom' };
    for (const [dir, v] of Object.entries(vars)) {
      if (saved[dir]) this.root.style.setProperty(v, saved[dir] + 'px');
    }
    for (const sp of this.root.querySelectorAll('.splitter')) {
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sp.setPointerCapture(e.pointerId);
        const dir = sp.dataset.dir;
        const horizontal = dir === 'h';
        const start = horizontal ? e.clientY : e.clientX;
        const cs = getComputedStyle(this.root);
        const startSize = parseFloat(cs.getPropertyValue(vars[dir])) ||
          (dir === 'v' ? 230 : dir === 'v2' ? 270 : 240);
        const onMove = (ev) => {
          let delta = (horizontal ? ev.clientY : ev.clientX) - start;
          if (dir === 'v2' || dir === 'h') delta = -delta;
          const size = Math.max(120, Math.min(600, startSize + delta));
          this.root.style.setProperty(vars[dir], size + 'px');
          saved[dir] = size;
        };
        const onUp = () => {
          sp.removeEventListener('pointermove', onMove);
          sp.removeEventListener('pointerup', onUp);
          localStorage.setItem('neku-dock-sizes', JSON.stringify(saved));
        };
        sp.addEventListener('pointermove', onMove);
        sp.addEventListener('pointerup', onUp);
      });
    }
  }
}
