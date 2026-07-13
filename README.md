<p align="center"><img src="editor/cwat.svg" width="96" alt=">w<"></p>

# NEKU ENGINE

**Ultra-lightweight 2D/3D game & app engine** with a professional pixel-UI Studio
(desktop + browser), internet co-op, CRT effects, and one-click exports to
web, itch.io, and native desktop apps. Mascot: **cwat** `>w<`.

- A complete 2D game exports to a **~50 KB single HTML file** (3D games ≈ 1 MB with
  Three.js embedded) — or to **runnable macOS / Windows / Linux apps**, straight
  from the Studio, no tooling installed.
- **Neku Studio** runs in any browser *and* as a **1–2 MB native app** for
  macOS / Windows / Linux (grab it from [Releases](https://github.com/deviverr/NEKU-Engine/releases)).
- Hosted browser Studio: [deviverr.github.io/NEKU-Engine/editor/](https://deviverr.github.io/NEKU-Engine/editor/).
- **Co-op from anywhere**: host a session, share a 5-letter room code, teammates
  join from the web or desktop Studio on any platform — no server to run.
- Runtime dependencies: **zero**. Three.js, cannon-es and CodeMirror are vendored,
  pinned files — `npm install` is never required to use, edit, or ship a game.

## Highlights

| | |
|---|---|
| **2D + 3D in one scene** | Canvas2D UI over a Three.js world — or *on* it: `Screen3D` maps the live 2D scene onto any mesh and clicks pass through (the Casino Calculator arcade-cabinet trick, built in). |
| **Physics** | 2D arcade physics (gravity, AABB, collision signals, tilemap colliders) + full 3D rigid bodies via cannon-es (mass, friction, restitution, stacking) — each loads only when used. |
| **Studio** | Real menu bar (File/Edit/View/Project/Tools/Help) · boot splash · status bar · dockable panels + layout presets · modal dialogs & toasts (no browser popups) · Explorer · live Errors panel · Output log · Timeline keyframe editor · CodeMirror 6 scripting with Neku autocomplete · play-mode debug bar. |
| **3D editing** | Move/rotate/scale gizmos (W/E/R) · orbit camera · click-select · snapping · focus (F) · visible camera & light markers · material sliders (metalness/roughness/emissive/opacity) · GLTF model import. |
| **Paint 2.0** | Built-in pixel editor: layers, pencil/fill/line/rect/circle/select-move, undo/redo, content-preserving resize, spritesheet frames with animated preview + onion skin, edit any texture via ✎ in the Inspector. |
| **Co-op** | Roblox-style Team Create over the hosted Neku relay (Cloudflare, free) — host, share the room code, done. Assets sync separately from edits, chunked, so keystrokes stay light. Self-host with `npm run coop` for LAN/offline. |
| **Exports** | Single HTML file · itch.io ZIP · **native desktop apps for macOS / Windows / Linux** (Neutralino shell, built entirely in the Studio — even the hosted one). |
| **Looks** | 7 pixel themes + a custom theme editor (shareable `.nkt` files), CRT post-FX (curvature/scanlines/vignette/glow/aberration), synthesized SFX — games ship no audio files. |
| **Extendable** | `.nkx` plugins add themes, templates, and tools to the Studio via a tiny `neku.register*` API. |

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
most of the engine. Help → Cheatsheet (or `?`) for the full API, or read
[docs/API.md](docs/API.md).

## Make → ship

1. Pick a template (Blank / 2D Game / 3D Game / App) in the main menu.
2. Build scenes in the 2D/3D viewports; script nodes in plain JavaScript
   (`self` = node, `game` = engine); animate on the Timeline; draw sprites in Paint.
3. **File → Export** → HTML file, **itch.io ZIP**, or **Desktop apps**
   (mac/win/linux zips with your game's name and icon). Publishing walkthroughs:
   [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Team Create (co-op)

Click **◉ Co-op → Host new session** and share the room code. Teammates click
**Join** with the code — from the hosted Studio, a local clone, or the desktop
app, on any OS. Live edits, colored selections, per-peer presence. Rooms live on
the hosted relay (`relay/` — a tiny Cloudflare Durable Object, deploy your own
with `npm run relay`) and clean themselves up after a week of inactivity.
Offline/LAN: `npm run coop` and point the Co-op window at `ws://YOUR-LAN-IP:8348`.

## File formats

`.neku`/`.nk` project · `.nkp` prefab · `.nkt` theme · `.nkx` Studio plugin —
all JSON/JS, all diff-friendly, all openable from the Studio.

## Repo layout

```
engine/    runtime — core, renderer2d, render3d (Three), physics2d, physics3d (cannon),
           fx (CRT), audio synth, input, bundler (exports), desktop-export (asar+zip)
editor/    Neku Studio — menubar, dock, dialogs, viewports (2D + gizmo 3D), timeline,
           paint 2.0, panels, settings (Preferences + Project Settings), co-op client
desktop/   Neutralino shell + cwat icons + player binaries  →  npm run desktop
relay/     hosted co-op relay (Cloudflare Worker + Durable Object)  →  npm run relay
vendor/    three.js (+Orbit/Transform controls, GLTFLoader) · cannon.js · codemirror.js
projects/  samples: neku-arcade · neku-breakout · casino-calculator
tools/     serve · co-op server · export CLIs · vendor/sample/desktop/pages builders
docs/      API.md · PUBLISHING.md · PLAN.md
```

## For testers

Desktop zips are on the [Releases page](https://github.com/deviverr/NEKU-Engine/releases)
along with playable sample exports. Bug reports → GitHub issues. Things to poke:
paint a layered sprite, gizmo a mesh around in 3D, host a co-op room and join it
from your phone's browser, export your game as a desktop app and double-click it.

## Roadmap (post-2.0)

- Op-based co-op merging (currently last-write-wins)
- GLTF skeletal animation controls · custom shader nodes
- TypeScript definitions in the script editor
- In-Studio relay room browser

MIT. Made for shipping silly ideas fast. `>w<`
