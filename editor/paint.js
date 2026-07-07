// Neku Studio — built-in Paint: a pixel sprite editor in a floating window.
// Draws into an offscreen grid, saves as a PNG data-URL project asset.

const PALETTE = [
  '#1a1023', '#4a3b6b', '#8e6cf2', '#b8a3ff', '#e6e1f5', '#ffffff',
  '#ff5c9e', '#ff9e5c', '#ffcb47', '#4ade80', '#29e6c4', '#5fa8e0',
  '#e6413c', '#7a3045', '#2d6a4f', '#12152b',
];

export function openPaint(winman, ed, editAssetName = null) {
  winman.open({
    id: 'paint',
    title: 'PAINT >w<',
    width: 420,
    content(body) {
      let W = 16, H = 16;
      let color = PALETTE[2];
      let tool = 'pencil';
      let px = null; // Uint32-ish array of hex strings ('' = transparent)

      body.innerHTML = `
        <div class="paint-tools">
          <button data-tool="pencil" class="on" title="Pencil (draw)">✏</button>
          <button data-tool="eraser" title="Eraser">◻</button>
          <button data-tool="fill" title="Fill bucket">▨</button>
          <button data-tool="picker" title="Eyedropper">◉</button>
          <span class="sep"></span>
          <select class="paint-size">
            ${[8, 16, 24, 32, 48, 64].map((s) => `<option${s === 16 ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
          <span class="flex"></span>
          <select class="paint-load"><option value="">edit asset…</option></select>
        </div>
        <div class="paint-palette"></div>
        <div class="paint-canvas-wrap"><canvas class="paint-canvas"></canvas></div>
        <div class="paint-tools">
          <input class="paint-name" type="text" value="sprite.png" spellcheck="false" />
          <button class="paint-save accent">💾 Save asset</button>
          <button class="paint-clear">Clear</button>
        </div>`;

      const canvas = body.querySelector('.paint-canvas');
      const ctx = canvas.getContext('2d');
      const CELL = () => Math.floor(384 / Math.max(W, H));

      function reset(w, h) {
        W = w; H = h;
        px = Array(W * H).fill('');
        repaint();
      }

      function repaint() {
        const c = CELL();
        canvas.width = W * c;
        canvas.height = H * c;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const v = px[y * W + x];
            if (v) {
              ctx.fillStyle = v;
              ctx.fillRect(x * c, y * c, c, c);
            } else {
              // checker = transparent
              ctx.fillStyle = (x + y) % 2 ? '#26203a' : '#1c1730';
              ctx.fillRect(x * c, y * c, c, c);
            }
          }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * c, 0); ctx.lineTo(x * c, H * c); ctx.stroke(); }
        for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * c); ctx.lineTo(W * c, y * c); ctx.stroke(); }
      }

      function cellAt(e) {
        const r = canvas.getBoundingClientRect();
        const c = CELL();
        const x = Math.floor(((e.clientX - r.left) / r.width) * canvas.width / c);
        const y = Math.floor(((e.clientY - r.top) / r.height) * canvas.height / c);
        return x >= 0 && x < W && y >= 0 && y < H ? { x, y } : null;
      }

      function applyTool(cell, rightClick) {
        const i = cell.y * W + cell.x;
        if (tool === 'picker') {
          if (px[i]) setColor(px[i]);
          return;
        }
        if (tool === 'fill') {
          const target = px[i];
          const fillWith = rightClick || tool === 'eraser' ? '' : color;
          if (target === fillWith) return;
          const stack = [i];
          while (stack.length) {
            const j = stack.pop();
            if (px[j] !== target) continue;
            px[j] = fillWith;
            const x = j % W, y = (j / W) | 0;
            if (x > 0) stack.push(j - 1);
            if (x < W - 1) stack.push(j + 1);
            if (y > 0) stack.push(j - W);
            if (y < H - 1) stack.push(j + W);
          }
        } else {
          px[i] = tool === 'eraser' || rightClick ? '' : color;
        }
        repaint();
      }

      let drawing = false;
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        drawing = true;
        const cell = cellAt(e);
        if (cell) applyTool(cell, e.button === 2);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drawing || tool === 'fill' || tool === 'picker') return;
        const cell = cellAt(e);
        if (cell) applyTool(cell, e.buttons === 2);
      });
      canvas.addEventListener('pointerup', () => (drawing = false));

      // palette
      const pal = body.querySelector('.paint-palette');
      function setColor(c) {
        color = c;
        pal.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.c === c));
        custom.value = /^#[0-9a-f]{6}$/i.test(c) ? c : '#8e6cf2';
      }
      for (const c of PALETTE) {
        const s = document.createElement('button');
        s.className = 'swatch';
        s.dataset.c = c;
        s.style.background = c;
        s.addEventListener('click', () => setColor(c));
        pal.appendChild(s);
      }
      const custom = document.createElement('input');
      custom.type = 'color';
      custom.className = 'swatch-custom';
      custom.addEventListener('input', () => setColor(custom.value));
      pal.appendChild(custom);
      setColor(color);

      // toolbar
      body.querySelectorAll('[data-tool]').forEach((b) =>
        b.addEventListener('click', () => {
          tool = b.dataset.tool;
          body.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      body.querySelector('.paint-size').addEventListener('change', (e) => {
        if (px.some((v) => v) && !confirm('Resize clears the canvas. Continue?')) {
          e.target.value = W;
          return;
        }
        reset(+e.target.value, +e.target.value);
      });
      body.querySelector('.paint-clear').addEventListener('click', () => {
        if (confirm('Clear the canvas?')) reset(W, H);
      });

      // load an existing image asset for editing
      const loadSel = body.querySelector('.paint-load');
      for (const name of Object.keys(ed.project.assets).filter((n) => ed.project.assets[n].startsWith('data:image')))
        loadSel.insertAdjacentHTML('beforeend', `<option>${name}</option>`);
      loadSel.addEventListener('change', () => {
        const name = loadSel.value;
        if (!name) return;
        const img = new Image();
        img.onload = () => {
          const w = Math.min(64, img.naturalWidth), h = Math.min(64, img.naturalHeight);
          reset(w, h);
          const tmp = document.createElement('canvas');
          tmp.width = w; tmp.height = h;
          const tctx = tmp.getContext('2d');
          tctx.drawImage(img, 0, 0, w, h);
          const data = tctx.getImageData(0, 0, w, h).data;
          for (let i = 0; i < w * h; i++) {
            const a = data[i * 4 + 3];
            px[i] = a < 16 ? '' : '#' + [0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('');
          }
          body.querySelector('.paint-name').value = name;
          repaint();
        };
        img.src = ed.project.assets[name];
      });
      if (editAssetName) {
        loadSel.value = editAssetName;
        loadSel.dispatchEvent(new Event('change'));
      }

      // save as asset (true-size PNG via an offscreen canvas)
      body.querySelector('.paint-save').addEventListener('click', () => {
        let name = body.querySelector('.paint-name').value.trim() || 'sprite.png';
        if (!/\.(png)$/i.test(name)) name += '.png';
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const octx = off.getContext('2d');
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const v = px[y * W + x];
            if (!v) continue;
            octx.fillStyle = v;
            octx.fillRect(x, y, 1, 1);
          }
        ed.project.assets[name] = off.toDataURL('image/png');
        ed.markDirty();
        ed.refreshAssets?.();
        ed.refreshInspector();
        // refresh the load menu
        if (![...loadSel.options].some((o) => o.value === name)) loadSel.insertAdjacentHTML('beforeend', `<option>${name}</option>`);
        ed.log?.(`paint: saved asset "${name}" (${W}×${H})`);
      });

      reset(W, H);
    },
  });
}
