// Neku Studio — Preferences (editor-wide) and Project Settings (per-game).
//
// Preferences: themes (the ONE home for them — presets, custom editor, .nkt
// files), editor prefs, extensions (.nkx), local session.
// Project Settings: display, physics, screen FX, metadata — everything that
// ships with the game.

import { currentSessionUrl, getJson, getLocal, newSessionUrl, removeLocal, SESSION, setJson, setLocal } from './session.js';
import { toast } from './dialogs.js';

const THEME_VARS = ['--bg', '--bg2', '--bg3', '--line', '--ink', '--dim', '--accent', '--accent2', '--warn', '--err', '--ok', '--shadow', '--vpbg'];

export const PRESET_THEMES = [
  ['neku-dark', 'Neku Dark'], ['cwat', 'Cwat'], ['crt-green', 'CRT Green'],
  ['famicom', 'Famicom'], ['synthwave', 'Synthwave'], ['gameboy', 'Gameboy'], ['paper', 'Paper'],
];

export function applyCustomTheme(vars) {
  for (const [k, v] of Object.entries(vars)) document.body.style.setProperty(k, v);
}

export function clearCustomTheme() {
  for (const k of THEME_VARS) document.body.style.removeProperty(k);
}

// ---------------------------------------------------------------- Preferences

export function openPreferences(winman, ed, ctx, section = null) {
  // ctx: { plugins, native, download(name, text), openThemeFile(), setTheme(name), log }
  winman.open({
    id: 'prefs',
    title: 'PREFERENCES',
    width: 460,
    content(body) {
      const saved = getJson('neku-custom-theme', null);
      const activeTheme = getLocal('neku-theme', 'neku-dark');
      const pluginThemes = Object.keys(ctx.plugins.themes);

      body.innerHTML = `
        <div class="set-section" data-sec="appearance">THEME</div>
        <div class="set-presetgrid">
          ${PRESET_THEMES.map(([id, label]) =>
            `<button data-theme-pick="${id}" class="${id === activeTheme ? 'on' : ''}">${label}</button>`).join('')}
          ${pluginThemes.map((n) =>
            `<button data-theme-pick="${n}" class="${n === activeTheme ? 'on' : ''}">⚡ ${n}</button>`).join('')}
          <button data-theme-pick="custom" class="${activeTheme === 'custom' ? 'on' : ''}">★ Custom</button>
        </div>
        <div class="set-section">CUSTOM THEME</div>
        <div class="set-help">Start from the current theme, tweak, apply. Export shares it as a .nkt file.</div>
        <div class="set-themegrid"></div>
        <div class="set-row">
          <button class="set-apply accent">Apply custom</button>
          <button class="set-export">⬇ .nkt</button>
          <button class="set-import">⬆ .nkt</button>
        </div>
        <div class="set-section">EDITOR</div>
        <div class="prop-row"><label>2D grid size</label><input class="set-grid" type="number" value="${getLocal('neku-grid', 40)}" /></div>
        <div class="set-section" data-sec="extensions">EXTENSIONS (.nkx)</div>
        <div class="set-plugins"></div>
        <div class="set-row"><button class="set-addplugin">＋ Load .nkx plugin…</button></div>
        <div class="set-help">Plugins are JS with full editor access — only load files you trust.</div>
        <div class="set-section">LOCAL SESSION</div>
        <div class="prop-row"><label>client</label><input type="text" value="${SESSION.clientId}" readonly /></div>
        <div class="prop-row"><label>session</label><input type="text" value="${SESSION.id}" readonly /></div>
        <div class="set-row">
          <button class="set-newsession">New local session</button>
          <button class="set-copysession">Copy session URL</button>
        </div>
        <div class="set-help">Autosave, recents, layout, plugins, theme, and co-op defaults are scoped to this local session.</div>`;

      // --- theme presets ---
      body.querySelectorAll('[data-theme-pick]').forEach((b) =>
        b.addEventListener('click', () => {
          ctx.setTheme(b.dataset.themePick);
          body.querySelectorAll('[data-theme-pick]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );

      // --- custom theme editor ---
      const grid = body.querySelector('.set-themegrid');
      const cs = getComputedStyle(document.body);
      for (const v of THEME_VARS) {
        const current = saved?.vars?.[v] || cs.getPropertyValue(v).trim();
        const row = document.createElement('label');
        row.className = 'set-swatchrow';
        row.innerHTML = `<span>${v.slice(2)}</span><input type="color" data-var="${v}" value="${toHex(current)}" />`;
        grid.appendChild(row);
      }
      function toHex(c) {
        if (/^#[0-9a-f]{6}$/i.test(c)) return c;
        const d = document.createElement('div');
        d.style.color = c;
        document.body.appendChild(d);
        const m = getComputedStyle(d).color.match(/\d+/g) || [128, 128, 128];
        d.remove();
        return '#' + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('');
      }
      const readVars = () => {
        const vars = {};
        grid.querySelectorAll('input[data-var]').forEach((i) => (vars[i.dataset.var] = i.value));
        return vars;
      };
      body.querySelector('.set-apply').addEventListener('click', () => {
        setJson('neku-custom-theme', { name: 'custom', vars: readVars() });
        ctx.setTheme('custom');
        body.querySelectorAll('[data-theme-pick]').forEach((x) => x.classList.toggle('on', x.dataset.themePick === 'custom'));
        toast('Custom theme applied', 'ok');
      });
      body.querySelector('.set-export').addEventListener('click', () => {
        ctx.download('my-theme.nkt', JSON.stringify({ neku: 'theme', name: 'my-theme', vars: readVars() }, null, 2));
      });
      body.querySelector('.set-import').addEventListener('click', () => ctx.openThemeFile());

      // --- extensions ---
      const list = body.querySelector('.set-plugins');
      const refreshPlugins = () => {
        const names = Object.keys(ctx.plugins.sources);
        list.innerHTML = names.length
          ? names.map((n) => `<div class="set-pluginrow"><span>⚡ ${n}</span><button data-rm="${n}">✕</button></div>`).join('')
          : '<span class="dim-note">no extensions loaded</span>';
        list.querySelectorAll('[data-rm]').forEach((b) =>
          b.addEventListener('click', () => {
            toast(ctx.plugins.remove(b.dataset.rm), 'info');
            refreshPlugins();
          })
        );
      };
      refreshPlugins();
      body.querySelector('.set-addplugin').addEventListener('click', async () => {
        const file = await ctx.openPluginFile();
        if (!file) return;
        ctx.plugins.add(file.name.replace(/\.(nkx|js)$/, ''), file.text);
        refreshPlugins();
        toast('Loaded extension: ' + file.name, 'ok');
      });

      // --- editor prefs / session ---
      body.querySelector('.set-grid').addEventListener('change', (e) => {
        setLocal('neku-grid', Math.max(8, +e.target.value || 40));
      });
      body.querySelector('.set-newsession').addEventListener('click', () => {
        location.href = newSessionUrl();
      });
      body.querySelector('.set-copysession').addEventListener('click', async () => {
        await navigator.clipboard?.writeText(currentSessionUrl());
        toast('Session URL copied', 'ok');
      });

      if (section) body.querySelector(`[data-sec="${section}"]`)?.scrollIntoView();
    },
  });
}

// ----------------------------------------------------------- Project Settings

export function openProjectSettings(winman, ed) {
  winman.open({
    id: 'projset',
    title: 'PROJECT SETTINGS',
    width: 420,
    content(body) {
      const s = ed.project.settings;
      const meta = (s.meta ||= {});
      s.physics = s.physics || {};
      s.fx = s.fx || {};

      const FX_FIELDS = [['curvature', 0.07], ['scanlines', 0.35], ['vignette', 0.35], ['flicker', 0.02], ['noise', 0.04], ['glow', 0.25], ['aberration', 0.0015]];

      body.innerHTML = `
        <div class="set-section">DISPLAY</div>
        <div class="prop-row"><label>width</label><input data-k="width" type="number" value="${s.width}" /></div>
        <div class="prop-row"><label>height</label><input data-k="height" type="number" value="${s.height}" /></div>
        <div class="prop-row"><label>background</label><input data-k="background" type="color" value="${s.background}" /></div>
        <div class="prop-row"><label>pixelated</label><input data-k="pixelated" type="checkbox" ${s.pixelated ? 'checked' : ''} /></div>
        <div class="prop-row"><label>ui mode</label><select data-k="uiMode">
          <option value="overlay"${s.uiMode !== 'screen3d' ? ' selected' : ''}>overlay</option>
          <option value="screen3d"${s.uiMode === 'screen3d' ? ' selected' : ''}>screen3d</option>
        </select></div>
        <div class="set-section">PHYSICS</div>
        <div class="prop-row"><label>gravity 2D</label><input data-phys="gravity" type="number" value="${s.physics.gravity ?? 900}" /></div>
        <div class="prop-row"><label>gravity 3D</label><input data-phys="gravity3d" type="number" step="0.01" value="${s.physics.gravity3d ?? -9.82}" /></div>
        <div class="set-section">SCREEN FX (CRT)</div>
        <div class="prop-row"><label>enabled</label><input data-fx="crt" type="checkbox" ${s.fx.crt ? 'checked' : ''} /></div>
        <div class="fx-extra" ${s.fx.crt ? '' : 'hidden'}>
          ${FX_FIELDS.map(([k, def]) =>
            `<div class="prop-row"><label>${k}</label><input data-fx="${k}" type="number" step="0.005" value="${s.fx[k] ?? def}" /></div>`).join('')}
        </div>
        <div class="set-section">METADATA</div>
        <div class="prop-row"><label>author</label><input data-meta="author" type="text" value="${esc(meta.author || '')}" /></div>
        <div class="prop-row"><label>version</label><input data-meta="version" type="text" value="${esc(meta.version || '1.0.0')}" /></div>
        <div class="prop-row"><label>description</label><input data-meta="description" type="text" value="${esc(meta.description || '')}" /></div>
        <div class="set-help">Included as meta tags in exports. Name an image asset "icon.png" to use it as the game icon / favicon.</div>`;

      function esc(v) { return String(v).replace(/"/g, '&quot;'); }

      const num = (v, el) => (el.type === 'number' ? +v : v);
      body.querySelectorAll('[data-k]').forEach((el) =>
        el.addEventListener('change', () => {
          s[el.dataset.k] = el.type === 'checkbox' ? el.checked : num(el.value, el);
          ed.markDirty();
        })
      );
      body.querySelectorAll('[data-phys]').forEach((el) =>
        el.addEventListener('change', () => {
          s.physics[el.dataset.phys] = +el.value;
          ed.markDirty();
        })
      );
      body.querySelectorAll('[data-fx]').forEach((el) =>
        el.addEventListener('change', () => {
          s.fx[el.dataset.fx] = el.type === 'checkbox' ? el.checked : +el.value;
          if (el.dataset.fx === 'crt') body.querySelector('.fx-extra').hidden = !el.checked;
          ed.markDirty();
        })
      );
      body.querySelectorAll('[data-meta]').forEach((el) =>
        el.addEventListener('change', () => {
          meta[el.dataset.meta] = el.value;
          ed.markDirty();
        })
      );
    },
  });
}
