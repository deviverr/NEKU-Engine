// Neku Studio — desktop bridge. When running inside the Neutralino shell
// (macOS/Windows/Linux builds) this swaps browser downloads/file-inputs for
// real native dialogs and filesystem access. In a normal browser it resolves
// to null and everything falls back to web behavior.

export async function initNative() {
  if (typeof window.NL_PORT === 'undefined') return null; // not the desktop app

  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/js/neutralino.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  const N = window.Neutralino;
  N.init();
  N.events.on('windowClose', () => N.app.exit());

  const FILTERS = {
    project: [{ name: 'Neku project', extensions: ['neku', 'nk', 'json'] }],
    prefab: [{ name: 'Neku prefab', extensions: ['nkp'] }],
    theme: [{ name: 'Neku theme', extensions: ['nkt'] }],
    plugin: [{ name: 'Neku plugin', extensions: ['nkx', 'js'] }],
    any: [{ name: 'All files', extensions: ['*'] }],
  };

  return {
    isDesktop: true,

    setTitle(t) {
      N.window.setTitle(t ? `${t} — Neku Studio` : 'Neku Studio').catch(() => {});
    },

    // data: string | Uint8Array. Returns saved path or null if cancelled.
    async saveFile(defaultName, data, kind = 'any') {
      const path = await N.os.showSaveDialog('Save', {
        defaultPath: defaultName,
        filters: FILTERS[kind] || FILTERS.any,
      });
      if (!path) return null;
      if (typeof data === 'string') await N.filesystem.writeFile(path, data);
      else await N.filesystem.writeBinaryFile(path, data.buffer ? data.buffer : data);
      return path;
    },

    // Returns { path, text } or null if cancelled.
    async openFile(kind = 'any') {
      const paths = await N.os.showOpenDialog('Open', { filters: FILTERS[kind] || FILTERS.any });
      if (!paths?.length) return null;
      const text = await N.filesystem.readFile(paths[0]);
      return { path: paths[0], text };
    },

    async readPath(path) {
      return await N.filesystem.readFile(path);
    },
  };
}
