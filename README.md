# ▞▚ NEKU ENGINE

A **2D/3D web game engine** with a pixel-UI browser editor, **live team co-op**,
CRT post-effects, and single-file HTML export. Built for funny, lightweight games
that run everywhere — the spiritual successor of the Casino Calculator Engine.

![Neku Studio](https://img.shields.io/badge/editor-Neku%20Studio-29e6c4) ![zero npm](https://img.shields.io/badge/runtime%20deps-0-ff5c9e)

- **2D + 3D in one scene.** Canvas2D UI over a Three.js world — or *on* it: the
  `Screen3D` node maps your live 2D scene onto any 3D surface (the arcade-cabinet-CRT
  trick from Casino Calculator), and clicks on that surface pass through into the 2D UI.
- **Neku Studio** runs in any browser on macOS/Windows/Linux. Pixel UI, four themes,
  dockable panels, 2D/3D/Game viewports, CodeMirror 6 script editor with Neku autocomplete.
- **Team Create co-op.** Run `npm run coop`, click ◉ Co-op — teammates edit the same
  project live with named colored selections, Roblox Studio style.
- **CRT screen FX** built in: curvature, scanlines, vignette, flicker, noise, glow,
  chromatic aberration — toggle in project settings.
- **Physics, sprite animation, tilemaps** for 2D; **GLTF models, textures, PBR
  materials, shadows, raycast-clickable meshes** for 3D.
- **Keyframe Timeline panel** — animate any numeric property with eased keyframes,
  preview in-editor, play at runtime with `game.playAnim('name')`.
- **Apps, not just games**: `TextInput` node (focus, caret, `onChange`/`onSubmit`),
  buttons, labels — enough UI to build calculator-grade apps on the game canvas.
- **Prefabs**: save any subtree as a reusable ★ prefab, instantiate from the add menu.
- **Single-file export.** 2D games flatten to ~50 KB (Neku Breakout, a complete game,
  is 51 KB). 3D games embed Three.js and land around 1 MB — still ~40× smaller than an
  empty Godot web export. One click also produces an **itch.io-ready ZIP**.

## Quick start

```bash
git clone https://github.com/deviverr/Casino-Calculator-Engine
cd Casino-Calculator-Engine
npm start        # dev server — zero dependencies, needs only Node
```

- **Neku Studio** → http://localhost:8347/editor/
- **Player** → http://localhost:8347/play.html?project=projects/neku-arcade.json

Try the **Neku Arcade** sample (Samples ▾ → 2): a 3D room with an arcade cabinet whose
CRT screen is a live, clickable 2D slot machine, with full CRT post-FX. That one scene
demonstrates most of the engine.

For live co-op: `npm run coop`, then every teammate clicks **◉ Co-op** in the Studio and
enters `ws://YOUR-LAN-IP:8348` (or a tunneled/hosted URL) and the same room name.

## Neku Studio

| Panel | Notes |
|---|---|
| **Scene** | Node tree with type/script/3D badges and peer selection marks. Drag panel tabs between docks; layouts persist. |
| **2D / 3D / Game** | 2D: pan/zoom, drag-move, tilemap painting. 3D: orbit camera, click-select, drag on ground plane. Game: play in editor (`Cmd/Ctrl+Enter`). |
| **Inspector** | Type-aware fields — asset pickers for textures/models, enums for shapes/lights/physics bodies, CRT FX sliders in project settings. |
| **Assets** | Drag-drop import of images, audio, `.glb`/`.gltf` models. Stored as data URLs inside the project JSON — one file is still the whole game. |
| **Script** | CodeMirror 6 with autocomplete for the whole Neku API and hook snippets. |
| **Themes** | Neku Dark · CRT Green · Famicom · Paper. |

## Nodes

**2D** — `Node`, `Rect`, `Circle`, `Label`, `Sprite` (sheet animation: `sheetCols`,
`fps`, `playing`), `Button`, `Particles`, `Tilemap` (paintable, optional `collision`).

**3D** — `Node3D`, `Mesh3D` (box/sphere/plane/cylinder/cone/torus or GLTF `model`,
with `texture`, `metalness`, `roughness`, `emissive`), `Camera3D`, `Light3D`
(directional/ambient/point/hemi, shadows), `Screen3D` (live 2D UI on a mesh).

**Physics (2D)** — set `body: dynamic | static | area` on any 2D node; dynamics get
`vx`/`vy`, gravity, `bounce`, and `onCollide(other, side)`.

## Scripting

Scripts are plain JavaScript attached to nodes. `self` is the node, `game` is the engine:

```js
function ready() { game.on('button', (name) => { /* any Button pressed */ }); }
function update(dt) { self.ry += 90 * dt; }          // spin a Mesh3D
function onPress() { game.audio.play('coin'); }       // clicked (2D Button or 3D mesh!)
function onCollide(other, side) { if (side === 'bottom') jump(); }
function onSignal(name, data) {}                      // game.emit(...) from anywhere
```

API highlights: `game.find/spawn/tween/after/every/emit/on`, `game.audio.play`
(synthesized SFX — zero audio files) & `game.audio.tone`, `game.input`,
`game.gotoScene`, `game.rand/randInt/pick/clamp/lerp`, `node.burst` (particles),
`game.THREE` (escape hatch when a scene uses 3D).

## Co-op (Team Create)

`tools/collab.js` is a zero-dependency WebSocket server (RFC 6455 implemented by hand —
no npm). Rooms hold the latest project; edits broadcast live with presence and colored
peer selections. Simultaneous edits resolve last-write-wins, so agree on who edits which
scene/script at the same time; the project JSON in git remains your history/backup.

## Export & publishing

| Target | How | Size |
|---|---|---|
| Web (2D game) | Export ▾ → HTML, or `node tools/export.js p.json` | ~50 KB, one file |
| Web (3D game) | same — Three.js embeds via import map | ~1 MB, one file |
| **itch.io** | Export ▾ → itch.io ZIP (or `--zip`) | same + zip header |
| Windows/macOS/Linux | wrap the exported HTML with [Tauri](https://tauri.app) | +3–8 MB |
| Android/iOS | [Capacitor](https://capacitorjs.com) or PWA | +1–5 MB |
| Game Boy Advance | Not this engine (no JS on a 16 MHz ARM7). Real path: C/C++ with devkitARM/Butano. Long-term research idea only. | — |

**Publish to itch.io** — Export ▾ → *itch.io ZIP* → itch.io → Upload new project →
kind of project: **HTML** → upload the zip → check *“This file will be played in the
browser”*. Set the viewport to your project's width×height. Done.

**Publish to GitHub Pages** — commit the exported `.html` as `index.html` in a repo (or
`docs/`), then Settings → Pages → deploy from branch. Your game is live at
`https://you.github.io/repo/`. Tip: name an asset `icon.png` and it becomes the favicon.

## Repo layout

```
engine/    runtime — core, renderer2d, render3d (Three), physics2d, fx (CRT), audio, input, bundler
editor/    Neku Studio — dock, viewports, inspector, assets, CodeMirror wrapper, collab client
vendor/    three.js + codemirror.js, vendored as committed single-file bundles (no npm install)
projects/  games as JSON — neku-arcade (3D showcase), casino-calculator (2D+3D)
tools/     serve.js · collab.js (co-op server) · export.js · build-*.js (sample generators)
play.html  runs any project by URL
```

Runtime dependency count: **0**. Three.js and CodeMirror are vendored, pinned files in
`vendor/` — `npm install` is never required to use, edit, or ship a game.

## Roadmap

- [x] Keyframe timeline panel (property animation tracks)
- [x] Prefabs · itch.io ZIP export · TextInput node · in-editor help
- [ ] Multi-scene editing UI
- [ ] Op-based co-op sync (per-property merge instead of last-write-wins)
- [ ] Skeletal/GLTF animation playback controls
- [ ] Custom shader nodes; more post-FX (bloom, pixelate, palette-swap)
- [ ] 3D physics (raycast vehicles start; full bodies later)
- [ ] One-click Tauri desktop packaging from the Studio
- [ ] TypeScript definitions surfaced in the editor autocomplete

MIT licensed. Made for shipping silly ideas fast. ▞▚
