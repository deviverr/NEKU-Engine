// CCE 2D renderer — Canvas2D scene-tree walker.
// Draw order is tree order: children render after (on top of) their parent.

export function render2D(ctx, root, assets, width, height, background, dpr = 1) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }
  drawNode(ctx, root, assets, 1);
}

// Exported for the editor, which drives its own canvas transform (pan/zoom).
export function drawNode(ctx, node, assets, parentAlpha) {
  if (node.visible === false) return;
  if (node.is3D) return; // 3D branch handled by the GL renderer

  const alpha = parentAlpha * (node.opacity ?? 1);
  if (alpha <= 0) return;

  ctx.save();
  ctx.translate(node.x || 0, node.y || 0);
  if (node.rotation) ctx.rotate((node.rotation * Math.PI) / 180);
  const sx = node.scaleX ?? 1, sy = node.scaleY ?? 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.globalAlpha = alpha;

  PAINTERS[node.type]?.(ctx, node, assets);

  for (const child of node.children) drawNode(ctx, child, assets, alpha);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r || 0, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function fillStroke(ctx, node) {
  if (node.color && node.color !== 'none') {
    ctx.fillStyle = node.color;
    ctx.fill();
  }
  if (node.strokeColor && node.strokeWidth) {
    ctx.strokeStyle = node.strokeColor;
    ctx.lineWidth = node.strokeWidth;
    ctx.stroke();
  }
}

const PAINTERS = {
  Rect(ctx, n) {
    roundRect(ctx, -n.w / 2, -n.h / 2, n.w, n.h, n.radius);
    fillStroke(ctx, n);
  },

  Circle(ctx, n) {
    ctx.beginPath();
    ctx.arc(0, 0, n.radius, 0, Math.PI * 2);
    fillStroke(ctx, n);
  },

  Label(ctx, n) {
    ctx.font = `${n.bold ? 'bold ' : ''}${n.size || 16}px ${n.font || 'system-ui, sans-serif'}`;
    ctx.textAlign = n.align || 'center';
    ctx.textBaseline = 'middle';
    if (n.shadow) {
      ctx.fillStyle = n.shadow;
      ctx.fillText(n.text ?? '', 2, 2);
    }
    ctx.fillStyle = n.color || '#fff';
    ctx.fillText(n.text ?? '', 0, 0);
  },

  Sprite(ctx, n, assets) {
    const img = assets.images[n.asset];
    if (!img || !img.naturalWidth) {
      // Missing texture: draw a checker placeholder instead of crashing.
      const w = n.w || 32, h = n.h || 32;
      ctx.fillStyle = '#f0f';
      ctx.fillRect(-w / 2, -h / 2, w / 2, h / 2);
      ctx.fillRect(0, 0, w / 2, h / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, -h / 2, w / 2, h / 2);
      ctx.fillRect(-w / 2, 0, w / 2, h / 2);
      return;
    }
    const cols = n.sheetCols || 1, rows = n.sheetRows || 1;
    if (cols > 1 || rows > 1) {
      // Sprite-sheet frame (animated via `frame`/`fps`/`playing` props).
      const fw = img.naturalWidth / cols, fh = img.naturalHeight / rows;
      const f = Math.floor(n.frame || 0) % (cols * rows);
      const w = n.w || fw, h = n.h || fh;
      ctx.drawImage(img, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, -w / 2, -h / 2, w, h);
      return;
    }
    const w = n.w || img.naturalWidth, h = n.h || img.naturalHeight;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  },

  Tilemap(ctx, n, assets) {
    const img = assets.images[n.tileset];
    const tw = n.tileW || 32, th = n.tileH || 32;
    const cols = n.cols || 0, rows = n.rows || 0;
    const ox = -(cols * tw) / 2, oy = -(rows * th) / 2;
    const setCols = img && img.naturalWidth ? Math.max(1, Math.floor(img.naturalWidth / tw)) : 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = n.tiles?.[r * cols + c] ?? -1;
        if (t < 0) continue;
        if (img && img.naturalWidth) {
          ctx.drawImage(img, (t % setCols) * tw, Math.floor(t / setCols) * th, tw, th, ox + c * tw, oy + r * th, tw, th);
        } else {
          // No tileset image: render solid tiles so layout is still visible.
          ctx.fillStyle = ['#5b8c5a', '#7a6a53', '#4a6d8c', '#8c5a5b'][t % 4];
          ctx.fillRect(ox + c * tw, oy + r * th, tw, th);
        }
      }
    }
  },

  Button(ctx, n) {
    const base = n.color || '#2d6a4f';
    ctx.save();
    if (n._pressed) ctx.translate(0, 2);
    roundRect(ctx, -n.w / 2, -n.h / 2, n.w, n.h, n.radius ?? 10);
    ctx.fillStyle = n._pressed ? n.pressColor || shade(base, -25) : n._hover ? n.hoverColor || shade(base, 15) : base;
    ctx.fill();
    if (n.strokeColor && n.strokeWidth) {
      ctx.strokeStyle = n.strokeColor;
      ctx.lineWidth = n.strokeWidth;
      ctx.stroke();
    }
    ctx.font = `${n.bold === false ? '' : 'bold '}${n.textSize || 20}px ${n.font || 'system-ui, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = n.textColor || '#fff';
    ctx.fillText(n.text ?? '', 0, 1);
    ctx.restore();
  },

  Particles(ctx, n) {
    if (!n._particles) return;
    for (const p of n._particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * ctx.globalAlpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },
};

// Lighten (positive) or darken (negative) a hex color by pct.
function shade(hex, pct) {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

// World-space point → is it inside this Button? Used for hit-testing.
// Walks the parent chain to build the world transform (rotation-aware).
export function hitTest(node, px, py) {
  const chain = [];
  for (let n = node; n; n = n.parent) chain.push(n);
  // Transform the point into the node's local space by inverting each ancestor.
  let x = px, y = py;
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    x -= n.x || 0;
    y -= n.y || 0;
    if (n.rotation) {
      const a = (-n.rotation * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      const nx = x * c - y * s, ny = x * s + y * c;
      x = nx; y = ny;
    }
    const sx = n.scaleX ?? 1, sy = n.scaleY ?? 1;
    if (sx !== 1) x /= sx || 1e-6;
    if (sy !== 1) y /= sy || 1e-6;
  }
  return Math.abs(x) <= node.w / 2 && Math.abs(y) <= node.h / 2;
}
