// Neku Studio — application menu bar (File / Edit / View / Project / Tools / Help).
// One logical home per feature: everything that used to live in loose toolbar
// buttons and the Tools ▾ junk drawer is reachable from here.
//
// Menu items: { label, shortcut?, action?, submenu?: items[], checked?: fn,
//               enabled?: fn, sep: true }
// The definition is rebuilt on every open so dynamic entries (recents, plugin
// tools) stay fresh.

export class MenuBar {
  constructor(root, getMenus) {
    this.root = root;
    this.getMenus = getMenus; // () => [{ label, items: [...] }]
    this.openMenu = null;     // { name, el }
    this._build();
    window.addEventListener('pointerdown', (e) => {
      if (this.openMenu && !this.root.contains(e.target) && !e.target.closest('.menu-pop')) this.closeAll();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openMenu) this.closeAll();
    });
  }

  _build() {
    this.root.innerHTML = '';
    for (const menu of this.getMenus()) {
      const btn = document.createElement('button');
      btn.className = 'menu-top';
      btn.textContent = menu.label;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.openMenu?.name === menu.label ? this.closeAll() : this._open(menu.label, btn);
      });
      btn.addEventListener('pointerenter', () => {
        if (this.openMenu && this.openMenu.name !== menu.label) this._open(menu.label, btn);
      });
      this.root.appendChild(btn);
    }
  }

  closeAll() {
    document.querySelectorAll('.menu-pop').forEach((m) => m.remove());
    this.root.querySelectorAll('.menu-top.open').forEach((b) => b.classList.remove('open'));
    this.openMenu = null;
  }

  _open(name, anchor) {
    this.closeAll();
    const menu = this.getMenus().find((m) => m.label === name);
    if (!menu) return;
    anchor.classList.add('open');
    const r = anchor.getBoundingClientRect();
    const pop = this._renderItems(menu.items, r.left, r.bottom + 2);
    this.openMenu = { name, el: pop };
  }

  _renderItems(items, x, y, depth = 0) {
    const pop = document.createElement('div');
    pop.className = 'menu-pop';
    pop.dataset.depth = depth;
    for (const it of items) {
      if (it.sep) {
        pop.appendChild(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
        continue;
      }
      const row = document.createElement('button');
      row.className = 'menu-item';
      const enabled = it.enabled ? it.enabled() : true;
      if (!enabled) row.classList.add('off');
      const checked = it.checked ? it.checked() : null;
      row.innerHTML =
        `<span class="mi-check">${checked ? '●' : ''}</span>` +
        `<span class="mi-label"></span><span class="flex"></span>` +
        (it.submenu ? '<span class="mi-sub">▸</span>' : `<span class="mi-key">${it.shortcut || ''}</span>`);
      row.querySelector('.mi-label').textContent = it.label;
      if (it.submenu && enabled) {
        let child = null;
        row.addEventListener('pointerenter', () => {
          pop.querySelectorAll(`.menu-pop[data-depth='${depth + 1}']`).forEach((m) => m.remove());
          document.querySelectorAll(`.menu-pop[data-depth='${depth + 1}']`).forEach((m) => m.remove());
          const rr = row.getBoundingClientRect();
          const sub = it.submenu();
          if (sub.length) child = this._renderItems(sub, rr.right + 2, rr.top - 4, depth + 1);
        });
        row.addEventListener('pointerdown', (e) => e.preventDefault());
      } else if (enabled) {
        row.addEventListener('pointerenter', () => {
          document.querySelectorAll(`.menu-pop[data-depth='${depth + 1}']`).forEach((m) => m.remove());
        });
        row.addEventListener('click', () => {
          this.closeAll();
          it.action?.();
        });
      }
      pop.appendChild(row);
    }
    pop.style.left = Math.min(x, innerWidth - 280) + 'px';
    pop.style.top = Math.min(y, innerHeight - 40) + 'px';
    document.body.appendChild(pop);
    const pr = pop.getBoundingClientRect();
    if (pr.bottom > innerHeight - 8) pop.style.top = Math.max(8, innerHeight - pr.height - 8) + 'px';
    return pop;
  }
}
