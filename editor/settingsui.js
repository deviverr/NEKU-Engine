// Neku Studio — Settings window: themes (incl. custom editor + .nkt files),
// project metadata, extensions (.nkx), editor preferences.

const THEME_VARS = ['--bg', '--bg2', '--bg3', '--line', '--ink', '--dim', '--accent', '--accent2', '--warn', '--err', '--ok', '--shadow', '--vpbg'];

export function applyCustomTheme(vars) {
  for (const [k, v] of Object.entries(vars)) document.body.style.setProperty(k, v);
}

export function clearCustomTheme() {
  for (const k of THEME_VARS) document.body.style.removeProperty(k);
}

export function openSettings(winman, ed, ctx) {
  // ctx: { plugins, native, download(name, text), openThemeFile(), setTheme(name), currentTheme() }
  winman.open({
    id: 'settings',
    title: 'SETTINGS',
    width: 440,
    content(body) {
      const meta = (ed.project.settings.meta ||= {});
      const saved = JSON.parse(localStorage.getItem('neku-custom-theme') || 'null');

      body.innerHTML = `
        <div class="set-section">CUSTOM THEME</div>
        <div class="set-help">Start from the current theme, tweak, apply. Export shares it as a .nkt file.</div>
        <div class="set-themegrid"></div>
        <div class="set-row">
          <button class="set-apply accent">Apply custom</button>
          <button class="set-reset">Back to preset</button>
          <button class="set-export">⬇ .nkt</button>
          <button class="set-import">⬆ .nkt</button>
        </div>
        <div class="set-section">PROJECT METADATA</div>
        <div class="prop-row"><label>author</label><input class="set-author" type="text" value="${meta.author || ''}" /></div>
        <div class="prop-row"><label>version</label><input class="set-version" type="text" value="${meta.version || '1.0.1'}" /></div>
        <div class="prop-row"><label>description</label><input class="set-desc" type="text" value="${meta.description || ''}" /></div>
        <div class="set-help">Included as meta tags in exports. Name an asset "icon.png" for a favicon.</div>
        <div class="set-section">EXTENSIONS (.nkx)</div>
        <div class="set-plugins"></div>
        <div class="set-row"><button class="set-addplugin">＋ Load .nkx plugin…</button></div>
        <div class="set-help">Plugins are JS with full editor access — only load files you trust.</div>
        <div class="set-section">EDITOR</div>
        <div class="prop-row"><label>grid size</label><input class="set-grid" type="number" value="${localStorage.getItem('neku-grid') || 40}" /></div>`;

      // --- theme editor ---
      const grid = body.querySelector('.set-themegrid');
      const cs = getComputedStyle(document.body);
      const current = {};
      for (const v of THEME_VARS) {
        current[v] = (saved?.vars?.[v]) || cs.getPropertyValue(v).trim();
        const row = document.createElement('label');
        row.className = 'set-swatchrow';
        row.innerHTML = `<span>${v.slice(2)}</span><input type="color" data-var="${v}" value="${toHex(current[v])}" />`;
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
        const vars = readVars();
        localStorage.setItem('neku-custom-theme', JSON.stringify({ name: 'custom', vars }));
        localStorage.setItem('neku-theme', 'custom');
        applyCustomTheme(vars);
        ctx.setTheme('custom');
      });
      body.querySelector('.set-reset').addEventListener('click', () => {
        clearCustomTheme();
        localStorage.removeItem('neku-custom-theme');
        ctx.setTheme('neku-dark');
      });
      body.querySelector('.set-export').addEventListener('click', () => {
        ctx.download('my-theme.nkt', JSON.stringify({ neku: 'theme', name: 'my-theme', vars: readVars() }, null, 2));
      });
      body.querySelector('.set-import').addEventListener('click', () => ctx.openThemeFile());

      // --- metadata ---
      const bind = (sel, key) =>
        body.querySelector(sel).addEventListener('change', (e) => {
          meta[key] = e.target.value;
          ed.markDirty();
        });
      bind('.set-author', 'author');
      bind('.set-version', 'version');
      bind('.set-desc', 'description');

      // --- extensions ---
      const list = body.querySelector('.set-plugins');
      const refreshPlugins = () => {
        const names = Object.keys(ctx.plugins.sources);
        list.innerHTML = names.length
          ? names.map((n) => `<div class="set-pluginrow"><span>⚡ ${n}</span><button data-rm="${n}">✕</button></div>`).join('')
          : '<span class="dim-note">no extensions loaded</span>';
        list.querySelectorAll('[data-rm]').forEach((b) =>
          b.addEventListener('click', () => {
            alert(ctx.plugins.remove(b.dataset.rm));
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
      });

      // --- editor prefs ---
      body.querySelector('.set-grid').addEventListener('change', (e) => {
        localStorage.setItem('neku-grid', Math.max(8, +e.target.value || 40));
      });
    },
  });
}
