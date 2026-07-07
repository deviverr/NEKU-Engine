// Neku Studio — floating pixel windows (Paint, Settings, About…).
// Draggable title bars, bring-to-front, positions remembered per window id.

let zTop = 3000;

export class WinManager {
  constructor() {
    this.wins = new Map();
    this.saved = JSON.parse(localStorage.getItem('neku-windows') || '{}');
  }

  toggle(opts) {
    if (this.wins.has(opts.id)) return this.close(opts.id);
    return this.open(opts);
  }

  open({ id, title, width = 380, content, onClose }) {
    if (this.wins.has(id)) {
      const el = this.wins.get(id);
      el.style.zIndex = ++zTop;
      return el;
    }
    const el = document.createElement('div');
    el.className = 'nwin';
    el.style.width = width + 'px';
    el.style.zIndex = ++zTop;
    const pos = this.saved[id] || { x: 120 + this.wins.size * 40, y: 90 + this.wins.size * 30 };
    el.style.left = Math.min(pos.x, innerWidth - 200) + 'px';
    el.style.top = Math.min(pos.y, innerHeight - 120) + 'px';
    el.innerHTML = `
      <div class="nwin-title"><img src="cwat.svg" alt="" class="nwin-cat" /><span>${title}</span>
        <span class="flex"></span><button class="nwin-close">✕</button></div>
      <div class="nwin-body"></div>`;
    document.body.appendChild(el);
    this.wins.set(id, el);

    el.addEventListener('pointerdown', () => (el.style.zIndex = ++zTop));
    el.querySelector('.nwin-close').addEventListener('click', () => {
      this.close(id);
      onClose?.();
    });

    const bar = el.querySelector('.nwin-title');
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      bar.setPointerCapture(e.pointerId);
      const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
      const move = (ev) => {
        el.style.left = Math.max(0, Math.min(innerWidth - 100, ev.clientX - sx)) + 'px';
        el.style.top = Math.max(0, Math.min(innerHeight - 60, ev.clientY - sy)) + 'px';
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        this.saved[id] = { x: el.offsetLeft, y: el.offsetTop };
        localStorage.setItem('neku-windows', JSON.stringify(this.saved));
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });

    content(el.querySelector('.nwin-body'));
    return el;
  }

  close(id) {
    this.wins.get(id)?.remove();
    this.wins.delete(id);
  }
}
