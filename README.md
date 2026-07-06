# 🎰 CCE — Casino Calculator Engine

A **zero-dependency 2D/3D web game engine** with a browser-based editor.
Built for one thing: making funny, lightweight games that run everywhere.

- **The whole engine is ~40 KB.** A finished game exports to a **single HTML file** (the Casino Calculator sample: 44 KB, engine included). For comparison, an empty Godot web export is ~40 MB.
- **No install, no build step, no node_modules.** The editor runs in any browser on macOS, Windows, and Linux — your whole team edits the same project with nothing to set up.
- **2D and 3D** in the same scene: Canvas2D UI on top of a minimal WebGL renderer.
- **Sounds are synthesized in code** — games ship with zero audio files.

## Quick start

```bash
git clone https://github.com/deviverr/Casino-Calculator-Engine
cd Casino-Calculator-Engine
npm start          # zero-dependency dev server (needs Node, nothing else)
```

Then open:

- **Editor** → http://localhost:8347/editor/ (loads the Casino Calculator sample on first run)
- **Player** → http://localhost:8347/play.html

Press **▶ Play** in the editor (or `Cmd/Ctrl+Enter`) to run the game. Press **Export HTML** to download the game as one self-contained file you can put on any web host, itch.io, or a USB stick.

## The editor

| Panel | What it does |
|---|---|
| Scene | Node tree. `＋` adds a node as a child of the selection. Double-click renames. 👁 toggles visibility. |
| Viewport | Drag nodes to move them (Shift = snap to 10px). Drag empty space to pan, wheel to zoom, arrows to nudge, Delete to delete. |
| Inspector | Every property of the selected node. Select nothing to edit project settings. |
| Script | Built-in code editor with syntax highlighting. Assign scripts to nodes in the inspector. |
| Console | Captures logs and errors while the game runs. |

`Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo. Work autosaves to the browser; **Save** downloads the project as a `.json` you commit to git.

## Making a game

A project is one JSON file: scenes (trees of nodes), scripts, settings, assets.

**Node types** — 2D: `Node` (group), `Rect`, `Circle`, `Label`, `Sprite`, `Button`, `Particles`. 3D: `Camera3D`, `Light3D`, `Mesh3D` (box / sphere / plane / cylinder).

**Scripts** attach to nodes. Inside a script, `self` is the node and `game` is the engine:

```js
// lifecycle hooks — declare the ones you need
function ready() {}            // node entered the scene
function update(dt) {}         // every frame, dt in seconds
function onPress() {}          // this Button was clicked/tapped
function onInput(e) {}         // raw pointer/keyboard events
function onSignal(name, data) {} // any game.emit(...) from any script
```

**The `game` API:**

```js
game.find('Coins')                       // find node by name
game.spawn(parent, 'Circle', { x: 10 })  // create nodes at runtime
node.destroy()                           // remove a node
game.tween(node, { x: 100, opacity: 0 }, { duration: 0.4, easing: 'backOut' })
game.after(1.5, fn)                      // one-shot timer (returns cancel fn)
game.every(0.1, fn)                      // repeating timer (returns cancel fn)
game.emit('explode', data)               // broadcast to all onSignal hooks
game.audio.play('coin')                  // synth SFX: click tick pop coin win lose jackpot spin whoosh
game.audio.tone({ freq: 440, type: 'square', duration: 0.2 })  // custom sounds
game.rand(0, 10)  game.randInt(1, 6)  game.pick([...])  game.clamp  game.lerp
game.input.isDown('ArrowLeft')  game.input.pointer
game.gotoScene('Level2')
myParticles.burst(30, { colors: ['#ffd700'], up: -80 })
```

Study [projects/casino-calculator.json](projects/casino-calculator.json) (or its readable source, [tools/build-sample.js](tools/build-sample.js)) — it uses most of the engine in ~150 lines of script.

## Exporting

| Platform | How | Cost |
|---|---|---|
| **Web** | Export HTML button, or `npm run export`. One file, runs anywhere with a browser. | ~44 KB |
| **Windows / macOS / Linux** | Wrap the exported HTML with [Tauri](https://tauri.app) (`npx create-tauri-app`, drop the file in as the frontend). | ~3–8 MB |
| **Android / iOS** | Same file via [Capacitor](https://capacitorjs.com), or host it as a PWA — installable from the browser with no store. | ~1–5 MB |
| **Game Boy Advance** | ❌ Honestly: not this engine. The GBA has a 16 MHz CPU, 384 KB of RAM, and no JavaScript. GBA games are written in C/C++ with [devkitARM](https://devkitpro.org) + [Butano](https://github.com/GValiente/butano). A CCE-scene→GBA transpiler is on the roadmap as a research project, but don't plan a release on it. | — |

## Design philosophy

1. **Weightlessness is the feature.** Every game this engine makes should load in under a second on a bad phone.
2. **The project file is the whole game.** One JSON in git = perfect diffs, easy team merges, no binary blobs.
3. **No dependencies, ever, in the runtime.** What you read in `engine/` is everything that ships.
4. **Scripts are just JavaScript.** No custom language to learn; anything that compiles to JS (TypeScript) or WASM (Rust, C, AssemblyScript) can join later.

## Repo layout

```
engine/     the runtime — ~1,300 lines, zero deps (core, 2D/3D renderers, audio synth, input, math)
editor/     the browser editor (scene tree, inspector, viewport, code editor, console)
projects/   game projects as .json — casino-calculator.json is the flagship sample
tools/      serve.js (dev server) · export.js (single-file exporter) · build-sample.js
play.html   runs any project: play.html?project=projects/your-game.json
```

## Roadmap

- [ ] Sprite-sheet animation node + asset import UI in the editor
- [ ] Sound designer panel (tweak synth presets visually)
- [ ] Physics helpers (AABB collision, simple gravity/velocity node)
- [ ] Textured + GLTF meshes in the 3D renderer
- [ ] Multi-scene editing UI, prefabs
- [ ] TypeScript definitions for the `game` API (editor autocomplete)
- [ ] One-click Tauri desktop packaging from the editor
- [ ] GBA transpiler research (restricted script subset → C via Butano)

MIT licensed. Built to make silly ideas ship fast. 🪙
