// Neku Studio — .nkx plugin host.
// A plugin is a JS file that receives a `neku` API object:
//
//   neku.registerTheme('lava', { '--bg': '#200', '--accent': '#f40', ... });
//   neku.registerTemplate('Platformer', projectJson);
//   neku.registerTool('Count nodes', (ed) => alert(...));
//   neku.on('play' | 'stop' | 'export' | 'projectLoaded', (data) => {});
//
// Sources persist in localStorage and run on every Studio start.
// Plugins run with full editor access — only load .nkx files you trust.

export class PluginHost {
  constructor(ed) {
    this.ed = ed;
    this.themes = {};    // name -> css vars
    this.templates = {}; // name -> project json
    this.tools = [];     // { label, fn, plugin }
    this.handlers = {};  // event -> [fn]
    this.errors = [];    // { plugin, message }
    this.sources = JSON.parse(localStorage.getItem('neku-plugins') || '{}');
    this.onRegistry = null; // editor refresh callback
  }

  _api(pluginName) {
    const host = this;
    return {
      registerTheme(name, vars) {
        host.themes[name] = vars;
        host.onRegistry?.();
      },
      registerTemplate(name, projectJson) {
        host.templates[name] = projectJson;
        host.onRegistry?.();
      },
      registerTool(label, fn) {
        host.tools.push({ label, fn, plugin: pluginName });
        host.onRegistry?.();
      },
      on(event, fn) {
        (host.handlers[event] ||= []).push(fn);
      },
      log: (...a) => console.log(`[${pluginName}]`, ...a),
    };
  }

  loadAll() {
    for (const [name, src] of Object.entries(this.sources)) this._run(name, src);
  }

  _run(name, src) {
    try {
      new Function('neku', `"use strict";\n${src}`)(this._api(name));
    } catch (e) {
      this.errors.push({ plugin: name, message: e.message });
      console.error(`[neku plugin "${name}"] ${e.message}`);
    }
  }

  add(name, src) {
    this.sources[name] = src;
    localStorage.setItem('neku-plugins', JSON.stringify(this.sources));
    this._run(name, src);
  }

  remove(name) {
    delete this.sources[name];
    localStorage.setItem('neku-plugins', JSON.stringify(this.sources));
    // registrations live until reload; cheap and honest:
    return 'Removed. Reload the Studio to fully unload it.';
  }

  emit(event, data) {
    for (const fn of this.handlers[event] || []) {
      try {
        fn(data);
      } catch (e) {
        console.error(`[neku plugin event "${event}"] ${e.message}`);
      }
    }
  }
}
