<p align="center"><img src="editor/cwat.svg" width="96" alt=">w<"></p>

# NEKU ENGINE

**Ultra-lightweight 2D/3D game & app engine** with a pixel-UI desktop/browser Studio,
live team co-op, CRT effects, and single-file exports. Mascot: **cwat** `>w<`.

- A complete 2D game exports to a **~50 KB single HTML file** (3D games ≈ 1 MB with
  Three.js embedded). Upload straight to **itch.io** or GitHub Pages.
- **Neku Studio** runs in any browser *and* as a **1–2 MB native app** for
  macOS / Windows / Linux (grab it from [Releases](https://github.com/deviverr/NEKU-Engine/releases)).
- Hosted browser Studio: [deviverr.github.io/NEKU-Engine/editor/](https://deviverr.github.io/NEKU-Engine/editor/).
- Runtime dependencies: **zero**. Three.js, cannon-es and CodeMirror are vendored,
  pinned files — `npm install` is never required to use, edit, or ship a game.

## Highlights

| | |
|---|---|
| **2D + 3D in one scene** | Canvas2D UI over a Three.js world — or *on* it: `Screen3D` maps the live 2D scene onto any mesh and clicks pass through (the Casino Calculator arcade-cabinet trick, built in). |
| **Physics** | 2D arcade physics (gravity, AABB, collision signals, tilemap colliders) + full 3D rigid bodies via cannon-es (mass, friction, restitution, stacking) — each loads only when used. |
| **Studio** | Main menu with templates & recents · dockable panels + layout presets · 2D/3D/Game viewports · Explorer (multi-scene) · Errors list (live syntax check) · Output log · Timeline keyframe editor · built-in pixel **Paint** · CodeMirror 6 scripting with Neku autocomplete · play-mode debug bar (fps, watches, pause/step). |
| **Co-op** | Roblox-style Team Create: `npm run coop`, teammates join with the ◉ Co-op button, colored live selections. Zero-dependency WebSocket server. |
| **Looks** | 7 pixel themes + a custom theme editor (shareable `.nkt` files), CRT post-FX (curvature/scanlines/vignette/glow/aberration), synthesized SFX — games ship no audio files. |
| **Extendable** | `.nkx` plugins add themes, templates, and tools to the Studio via a tiny `neku.register*` API. |
| **Local sessions** | Autosave, recents, themes, plugins, layouts, and co-op defaults are scoped per client/session so one hosted Studio does not stomp another. |

## Quick start

**Desktop:** download your OS zip from [Releases](https://github.com/deviverr/NEKU-Engine/releases), unzip, run. (macOS: right-click → Open the first time. Linux: needs `libwebkit2gtk`.)

**Browser:**
```bash
git clone https://github.com/deviverr/NEKU-Engine
cd NEKU-Engine
npm start        # → http://localhost:8347/editor/
```

Try the **Neku Arcade** sample from the main menu: a 3D room where the arcade
cabinet's CRT is a live, clickable 2D slot machine — one scene that shows off
most of the engine. Press `?` in the toolbar for the full API cheatsheet, or read
[docs/API.md](docs/API.md).

## Make → ship

1. Pick a template (Blank / 2D Game / 3D Game / App) in the main menu.
2. Build scenes in the 2D/3D viewports; script nodes in plain JavaScript
   (`self` = node, `game` = engine); animate on the Timeline; draw sprites in Paint.
3. **Export ▾** → HTML file or **itch.io ZIP**. Publishing walkthroughs (itch.io,
   GitHub Pages, desktop wrapping): [docs/PUBLISHING.md](docs/PUBLISHING.md).

## File formats

`.neku`/`.nk` project · `.nkp` prefab · `.nkt` theme · `.nkx` Studio plugin —
all JSON/JS, all diff-friendly, all openable from the Studio.

## Repo layout

```
engine/    runtime — core, renderer2d, render3d (Three), physics2d, physics3d (cannon),
           fx (CRT), audio synth, input, bundler (exports: flatten / import-map / zip)
editor/    Neku Studio — dock, viewports, timeline, paint, panels, main menu, plugins,
           collab client, native bridge (Neutralino)
desktop/   Neutralino shell + cwat icons  →  npm run desktop
vendor/    three.js · cannon.js · codemirror.js (pinned single-file bundles)
projects/  samples: neku-arcade · neku-breakout · casino-calculator
tools/     serve · collab server · export CLI · sample builders · mascot/desktop builders
docs/      API.md · PUBLISHING.md · PLAN.md
```

## For testers

Desktop zips are on the [Releases page](https://github.com/deviverr/NEKU-Engine/releases)
along with playable sample exports. Bug reports → GitHub issues. Things to poke:
draw something in Paint, animate it on the Timeline, break a script and watch the
Errors panel, export the arcade to a single file, and try two Studios in co-op.

## Roadmap (post-1.0)

- Op-based co-op merging (currently last-write-wins)
- GLTF skeletal animation controls · custom shader nodes
- One-click Tauri packaging of exported games from the Studio
- TypeScript definitions in the script editor

MIT. Made for shipping silly ideas fast. `>w<`
