// Neku Studio — Paint 2.0: layered pixel editor in a floating window.
// Layers · pencil/eraser/fill/picker/line/rect/circle/select-move · undo/redo
// · content-preserving resize · spritesheet frames with animated preview and
// onion skin. Saves a flattened PNG data-URL into project assets.

import { confirmDlg, toast } from './dialogs.js';

const PALETTE = [
  '#1a1023', '#4a3b6b', '#8e6cf2', '#b8a3ff', '#e6e1f5', '#ffffff',
  '#ff5c9e', '#ff9e5c', '#ffcb47', '#4ade80', '#29e6c4', '#5fa8e0',
  '#e6413c', '#7a3045', '#2d6a4f', '#12152b',
];

const SIZES = [8, 16, 24, 32, 48, 64, 96, 128];
const MAX_UNDO = 40;

export function openPaint(winman, ed, editAssetName = null) {
  let cleanup = null;
  winman.open({
    id: 'paint',
    title: 'PAINT >w<',
    width: 620,
    content(body) {
      // ---- document state ----
      let W = 16, H = 16;
      let layers = [newLayer('layer 1')];
      let active = 0;
      let color = PALETTE[2];
      let tool = 'pencil';
      let frameW = 0;        // 0 = plain image; >0 = spritesheet frame width
      let fps = 8;
      const undoStack = [], redoStack = [];
      let sel = null;        // { x, y, w, h, grab?: {px, dx, dy} }
      let shapeDrag = null;  // preview for line/rect/circle
      let drawing = false;

      function newLayer(name) {
        return { name, visible: true, px: Array(W * H).fill('') };
      }

      body.innerHTML = `
        <div class="paint-tools">
          <button data-tool="pencil" class="on" title="Pencil (B)">✏</button>
          <button data-tool="eraser" title="Eraser (E)">◻</button>
          <button data-tool="fill" title="Fill (G)">▨</button>
          <button data-tool="picker" title="Eyedropper (I)">◉</button>
          <button data-tool="line" title="Line (L)">╱</button>
          <button data-tool="rect" title="Rectangle (R)">▭</button>
          <button data-tool="circle" title="Circle (C)">◯</button>
          <button data-tool="select" title="Select / move (M)">⬚</button>
          <span class="sep"></span>
          <button class="paint-undo" title="Undo (Cmd/Ctrl+Z)">↶</button>
          <button class="paint-redo" title="Redo (Shift+Cmd/Ctrl+Z)">↷</button>
          <span class="flex"></span>
          <select class="paint-size" title="Canvas size">
            ${SIZES.map((s) => `<option${s === 16 ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
          <select class="paint-load"><option value="">edit asset…</option></select>
        </div>
        <div class="paint-palette"></div>
        <div class="paint-wrap">
          <div class="paint-main">
            <div class="paint-canvas-wrap"><canvas class="paint-canvas"></canvas></div>
            <div class="paint-status"></div>
            <div class="paint-frames">
              <label>frame w</label>
              <select class="paint-framew"><option value="0">off</option>
                ${[8, 16, 24, 32, 48, 64].map((s) => `<option>${s}</option>`).join('')}</select>
              <label>fps</label><input class="paint-fps" type="number" value="8" min="1" max="30" style="width:44px" />
              <button class="paint-anim" title="Play/pause preview">▶</button>
              <button class="paint-onion" title="Onion skin in preview">👻</button>
            </div>
          </div>
          <div class="paint-side">
            <canvas class="paint-preview" width="96" height="96"></canvas>
            <div class="set-section" style="margin:2px 0">LAYERS</div>
            <div class="paint-layers"></div>
            <div class="paint-layer-btns">
              <button data-l="add" title="Add layer">＋</button>
              <button data-l="del" title="Delete layer">✕</button>
              <button data-l="up" title="Move layer up">↑</button>
              <button data-l="down" title="Move layer down">↓</button>
              <button data-l="merge" title="Merge down">⇓</button>
            </div>
          </div>
        </div>
        <div class="paint-tools" style="margin-top:8px">
          <input class="paint-name" type="text" value="sprite.png" spellcheck="false" />
          <button class="paint-save accent">💾 Save asset</button>
          <button class="paint-clear">Clear</button>
        </div>`;

      const canvas = body.querySelector('.paint-canvas');
      const ctx = canvas.getContext('2d');
      const preview = body.querySelector('.paint-preview');
      const pctx = preview.getContext('2d');
      const statusEl = body.querySelector('.paint-status');
      const CELL = () => Math.max(2, Math.floor(448 / Math.max(W, H)));

      // ---- undo ----
      const snapshot = () => JSON.stringify({ W, H, layers, active, frameW });
      function pushUndo() {
        undoStack.push(snapshot());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
      }
      function restore(snap) {
        const s = JSON.parse(snap);
        W = s.W; H = s.H; layers = s.layers; active = Math.min(s.active, layers.length - 1); frameW = s.frameW;
        body.querySelector('.paint-framew').value = frameW;
        sel = null;
        repaint();
        renderLayers();
      }
      function undo() {
        if (!undoStack.length) return;
        redoStack.push(snapshot());
        restore(undoStack.pop());
      }
      function redo() {
        if (!redoStack.length) return;
        undoStack.push(snapshot());
        restore(redoStack.pop());
      }
      body.querySelector('.paint-undo').addEventListener('click', undo);
      body.querySelector('.paint-redo').addEventListener('click', redo);

      // ---- rendering ----
      function composite() {
        const out = Array(W * H).fill('');
        for (const layer of layers) {
          if (!layer.visible) continue;
          for (let i = 0; i < layer.px.length; i++) if (layer.px[i]) out[i] = layer.px[i];
        }
        return out;
      }

      function repaint() {
        const c = CELL();
        canvas.width = W * c;
        canvas.height = H * c;
        const flat = composite();
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const v = flat[y * W + x];
            ctx.fillStyle = v || ((x + y) % 2 ? '#26203a' : '#1c1730');
            ctx.fillRect(x * c, y * c, c, c);
          }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * c, 0); ctx.lineTo(x * c, H * c); ctx.stroke(); }
        for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * c); ctx.lineTo(W * c, y * c); ctx.stroke(); }

        // spritesheet frame boundaries
        if (frameW > 0) {
          ctx.strokeStyle = 'rgba(41,230,196,0.5)';
          ctx.lineWidth = 2;
          for (let x = frameW; x < W; x += frameW) {
            ctx.beginPath(); ctx.moveTo(x * c, 0); ctx.lineTo(x * c, H * c); ctx.stroke();
          }
          ctx.lineWidth = 1;
        }
        // shape preview
        if (shapeDrag) {
          ctx.fillStyle = color + 'aa';
          for (const i of shapePixels(shapeDrag)) {
            ctx.fillRect((i % W) * c, ((i / W) | 0) * c, c, c);
          }
        }
        // selection marquee (+ floating grab)
        if (sel) {
          if (sel.grab) {
            ctx.fillStyle = 'rgba(255,255,255,0.001)';
            for (let y = 0; y < sel.h; y++)
              for (let x = 0; x < sel.w; x++) {
                const v = sel.grab.px[y * sel.w + x];
                if (!v) continue;
                ctx.fillStyle = v;
                ctx.fillRect((sel.x + x) * c, (sel.y + y) * c, c, c);
              }
          }
          ctx.strokeStyle = '#ff5c9e';
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 2;
          ctx.strokeRect(sel.x * c + 1, sel.y * c + 1, sel.w * c - 2, sel.h * c - 2);
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        }
        statusEl.textContent = `${W}×${H} · ${layers[active]?.name || ''}${frameW ? ` · ${Math.max(1, Math.floor(W / frameW))} frames` : ''}${sel ? ' · selection (drag to move, del clears, esc drops)' : ''}`;
      }

      // ---- preview (animated when spritesheet) ----
      let animOn = true, onion = false, prevFrame = 0, animTimer = 0;
      function renderPreview() {
        pctx.imageSmoothingEnabled = false;
        pctx.clearRect(0, 0, 96, 96);
        const flat = composite();
        const fw = frameW > 0 ? frameW : W;
        const frames = Math.max(1, Math.floor(W / fw));
        const f = prevFrame % frames;
        const scale = Math.min(96 / fw, 96 / H);
        const dw = fw * scale, dh = H * scale;
        const ox = (96 - dw) / 2, oy = (96 - dh) / 2;
        const draw = (frame, alpha) => {
          pctx.globalAlpha = alpha;
          for (let y = 0; y < H; y++)
            for (let x = 0; x < fw; x++) {
              const v = flat[y * W + (frame * fw + x)];
              if (!v) continue;
              pctx.fillStyle = v;
              pctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
            }
          pctx.globalAlpha = 1;
        };
        if (onion && frames > 1) draw((f - 1 + frames) % frames, 0.3);
        draw(f, 1);
      }
      function retime() {
        clearInterval(animTimer);
        animTimer = setInterval(() => {
          if (animOn) prevFrame++;
          renderPreview();
        }, 1000 / Math.max(1, fps));
      }
      retime();
      cleanup = () => clearInterval(animTimer);

      body.querySelector('.paint-anim').addEventListener('click', (e) => {
        animOn = !animOn;
        e.currentTarget.textContent = animOn ? '▶' : '⏸';
      });
      body.querySelector('.paint-onion').addEventListener('click', (e) => {
        onion = !onion;
        e.currentTarget.classList.toggle('on', onion);
      });
      body.querySelector('.paint-fps').addEventListener('change', (e) => {
        fps = Math.max(1, Math.min(30, +e.target.value || 8));
        retime();
      });
      body.querySelector('.paint-framew').addEventListener('change', (e) => {
        frameW = +e.target.value;
        repaint();
      });

      // ---- tools ----
      function cellAt(e) {
        const r = canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * W);
        const y = Math.floor(((e.clientY - r.top) / r.height) * H);
        return x >= 0 && x < W && y >= 0 && y < H ? { x, y } : null;
      }

      function shapePixels({ x0, y0, x1, y1, kind }) {
        const out = [];
        const put = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) out.push(y * W + x); };
        if (kind === 'line') {
          const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
          const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
          let err = dx + dy, x = x0, y = y0;
          for (;;) {
            put(x, y);
            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x += sx; }
            if (e2 <= dx) { err += dx; y += sy; }
          }
        } else if (kind === 'rect') {
          const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
          const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
          for (let x = ax; x <= bx; x++) { put(x, ay); put(x, by); }
          for (let y = ay; y <= by; y++) { put(ax, y); put(bx, y); }
        } else if (kind === 'circle') {
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          const rx = Math.max(0.5, Math.abs(x1 - x0) / 2), ry = Math.max(0.5, Math.abs(y1 - y0) / 2);
          const steps = Math.max(16, Math.ceil((rx + ry) * 4));
          for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            put(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry));
          }
        }
        return out;
      }

      function floodFill(px, i, fillWith) {
        const target = px[i];
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
      }

      function dropSelection(commit = true) {
        if (sel?.grab && commit) {
          const px = layers[active].px;
          for (let y = 0; y < sel.h; y++)
            for (let x = 0; x < sel.w; x++) {
              const v = sel.grab.px[y * sel.w + x];
              const tx = sel.x + x, ty = sel.y + y;
              if (v && tx >= 0 && tx < W && ty >= 0 && ty < H) px[ty * W + tx] = v;
            }
        }
        sel = null;
        repaint();
      }

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        const cell = cellAt(e);
        if (!cell) return;
        const px = layers[active].px;
        const i = cell.y * W + cell.x;
        const erase = e.button === 2;

        if (tool === 'select') {
          if (sel && cell.x >= sel.x && cell.x < sel.x + sel.w && cell.y >= sel.y && cell.y < sel.y + sel.h) {
            // grab: lift pixels off the layer and float them
            if (!sel.grab) {
              pushUndo();
              const grabPx = [];
              for (let y = 0; y < sel.h; y++)
                for (let x = 0; x < sel.w; x++) {
                  const j = (sel.y + y) * W + (sel.x + x);
                  grabPx.push(px[j]);
                  px[j] = '';
                }
              sel.grab = { px: grabPx };
            }
            drawing = { move: true, dx: cell.x - sel.x, dy: cell.y - sel.y };
          } else {
            dropSelection();
            sel = { x: cell.x, y: cell.y, w: 1, h: 1 };
            drawing = { marquee: true, x0: cell.x, y0: cell.y };
          }
          repaint();
          return;
        }
        if (tool === 'picker') {
          const flat = composite();
          if (flat[i]) setColor(flat[i]);
          return;
        }
        if (tool === 'fill') {
          pushUndo();
          floodFill(px, i, erase ? '' : color);
          repaint();
          return;
        }
        if (tool === 'line' || tool === 'rect' || tool === 'circle') {
          pushUndo();
          shapeDrag = { x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y, kind: tool, erase };
          drawing = { shape: true };
          repaint();
          return;
        }
        // pencil / eraser
        pushUndo();
        drawing = { paint: true, erase: tool === 'eraser' || erase };
        px[i] = drawing.erase ? '' : color;
        repaint();
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const cell = cellAt(e);
        if (!cell) return;
        if (drawing.paint) {
          layers[active].px[cell.y * W + cell.x] = drawing.erase ? '' : color;
          repaint();
        } else if (drawing.shape) {
          shapeDrag.x1 = cell.x;
          shapeDrag.y1 = cell.y;
          repaint();
        } else if (drawing.marquee) {
          sel.x = Math.min(drawing.x0, cell.x);
          sel.y = Math.min(drawing.y0, cell.y);
          sel.w = Math.abs(cell.x - drawing.x0) + 1;
          sel.h = Math.abs(cell.y - drawing.y0) + 1;
          repaint();
        } else if (drawing.move) {
          sel.x = cell.x - drawing.dx;
          sel.y = cell.y - drawing.dy;
          repaint();
        }
      });

      canvas.addEventListener('pointerup', () => {
        if (drawing?.shape && shapeDrag) {
          const px = layers[active].px;
          for (const i of shapePixels(shapeDrag)) px[i] = shapeDrag.erase ? '' : color;
          shapeDrag = null;
        }
        drawing = false;
        repaint();
        renderPreview();
      });

      // keyboard shortcuts scoped to the paint window
      const winEl = body.closest('.nwin');
      winEl.tabIndex = -1;
      winEl.addEventListener('keydown', (e) => {
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); return; }
        if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); redo(); return; }
        const map = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker', l: 'line', r: 'rect', c: 'circle', m: 'select' };
        if (map[e.key.toLowerCase()] && !mod) { setTool(map[e.key.toLowerCase()]); e.stopPropagation(); }
        if (e.key === 'Escape' && sel) { e.stopPropagation(); dropSelection(); }
        if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
          e.stopPropagation();
          if (sel.grab) { sel.grab = null; dropSelection(false); }
          else {
            pushUndo();
            const px = layers[active].px;
            for (let y = sel.y; y < sel.y + sel.h; y++)
              for (let x = sel.x; x < sel.x + sel.w; x++)
                if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = '';
            dropSelection(false);
          }
        }
      });

      // ---- palette ----
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

      // ---- toolbar / layers / size ----
      function setTool(t) {
        tool = t;
        if (t !== 'select') dropSelection();
        body.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === t));
      }
      body.querySelectorAll('[data-tool]').forEach((b) =>
        b.addEventListener('click', () => setTool(b.dataset.tool)));

      const layersBox = body.querySelector('.paint-layers');
      function renderLayers() {
        layersBox.innerHTML = '';
        // top layer first in the list, like every art tool
        [...layers].reverse().forEach((layer, ri) => {
          const i = layers.length - 1 - ri;
          const row = document.createElement('div');
          row.className = 'paint-layer' + (i === active ? ' on' : '');
          row.innerHTML = `<button class="pl-eye">${layer.visible ? '👁' : '🚫'}</button><span></span>`;
          row.lastElementChild.textContent = layer.name;
          row.addEventListener('click', (e) => {
            if (e.target.classList.contains('pl-eye')) {
              layer.visible = !layer.visible;
              repaint();
              renderLayers();
              return;
            }
            active = i;
            renderLayers();
            repaint();
          });
          layersBox.appendChild(row);
        });
      }
      body.querySelectorAll('[data-l]').forEach((b) =>
        b.addEventListener('click', () => {
          const op = b.dataset.l;
          if (op === 'add') {
            pushUndo();
            layers.splice(active + 1, 0, newLayer('layer ' + (layers.length + 1)));
            active += 1;
          } else if (op === 'del' && layers.length > 1) {
            pushUndo();
            layers.splice(active, 1);
            active = Math.max(0, active - 1);
          } else if (op === 'up' && active < layers.length - 1) {
            pushUndo();
            [layers[active], layers[active + 1]] = [layers[active + 1], layers[active]];
            active += 1;
          } else if (op === 'down' && active > 0) {
            pushUndo();
            [layers[active], layers[active - 1]] = [layers[active - 1], layers[active]];
            active -= 1;
          } else if (op === 'merge' && active > 0) {
            pushUndo();
            const below = layers[active - 1].px, cur = layers[active].px;
            for (let i = 0; i < cur.length; i++) if (cur[i]) below[i] = cur[i];
            layers.splice(active, 1);
            active -= 1;
          } else return;
          renderLayers();
          repaint();
        }));

      body.querySelector('.paint-size').addEventListener('change', (e) => {
        const size = +e.target.value;
        pushUndo();
        // content-preserving resize: copy the overlapping region
        const nw = size, nh = size;
        for (const layer of layers) {
          const next = Array(nw * nh).fill('');
          for (let y = 0; y < Math.min(H, nh); y++)
            for (let x = 0; x < Math.min(W, nw); x++)
              next[y * nw + x] = layer.px[y * W + x];
          layer.px = next;
        }
        W = nw; H = nh;
        sel = null;
        repaint();
      });

      body.querySelector('.paint-clear').addEventListener('click', async () => {
        if (!(await confirmDlg({ title: 'CLEAR LAYER', message: `Clear "${layers[active].name}"?`, okText: 'Clear', danger: true }))) return;
        pushUndo();
        layers[active].px = Array(W * H).fill('');
        repaint();
      });

      // ---- load an existing image asset ----
      const loadSel = body.querySelector('.paint-load');
      for (const name of Object.keys(ed.project.assets).filter((n) => ed.project.assets[n].startsWith('data:image')))
        loadSel.insertAdjacentHTML('beforeend', `<option>${name}</option>`);
      loadSel.addEventListener('change', () => {
        const name = loadSel.value;
        if (!name) return;
        const img = new Image();
        img.onload = () => {
          const w = Math.min(128, img.naturalWidth), h = Math.min(128, img.naturalHeight);
          W = w; H = h;
          layers = [newLayer(name)];
          active = 0;
          undoStack.length = redoStack.length = 0;
          const tmp = document.createElement('canvas');
          tmp.width = w; tmp.height = h;
          const tctx = tmp.getContext('2d');
          tctx.drawImage(img, 0, 0, w, h);
          const data = tctx.getImageData(0, 0, w, h).data;
          for (let i = 0; i < w * h; i++) {
            const a = data[i * 4 + 3];
            layers[0].px[i] = a < 16 ? '' : '#' + [0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('');
          }
          body.querySelector('.paint-name').value = name;
          renderLayers();
          repaint();
          renderPreview();
        };
        img.src = ed.project.assets[name];
      });
      if (editAssetName) {
        loadSel.value = editAssetName;
        loadSel.dispatchEvent(new Event('change'));
      }

      // ---- save (flattened, true-size PNG) ----
      body.querySelector('.paint-save').addEventListener('click', () => {
        dropSelection();
        let name = body.querySelector('.paint-name').value.trim() || 'sprite.png';
        if (!/\.(png)$/i.test(name)) name += '.png';
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const octx = off.getContext('2d');
        const flat = composite();
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const v = flat[y * W + x];
            if (!v) continue;
            octx.fillStyle = v;
            octx.fillRect(x, y, 1, 1);
          }
        ed.project.assets[name] = off.toDataURL('image/png');
        ed.markDirty();
        ed.refreshAssets?.();
        ed.refreshInspector();
        if (![...loadSel.options].some((o) => o.value === name)) loadSel.insertAdjacentHTML('beforeend', `<option>${name}</option>`);
        toast(`Saved asset "${name}" (${W}×${H})`, 'ok');
        ed.log?.(`paint: saved asset "${name}" (${W}×${H})`);
      });

      renderLayers();
      repaint();
      renderPreview();
    },
    onClose() {
      cleanup?.();
    },
  });
}
