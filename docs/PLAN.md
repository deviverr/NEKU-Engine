# Neku 1.0 "Cwat" — release plan

Goal: a fully working, finished, debugged engine product for ultra-lightweight
games and apps, publishable to itch.io / GitHub Pages, with desktop Studio
builds for macOS / Windows / Linux.

## A. Branding & mascot
- [x] A1 cwat pixel-art mascot (decoded from assets/cwat-ascii.txt, the attached `>w<` block art): SVG for UI + PNG icons (zero-dep PNG encoder in tools/gen-mascot.js)
- [x] A2 Mascot everywhere: Studio logo, main menu, empty states, favicon, desktop app icon, README

## B. Studio shell
- [x] B1 Main Menu (welcome screen): mascot, recent projects, new-from-template (Blank / 2D Game / 3D Game / App), samples, open file
- [x] B2 Floating window system (draggable pixel windows) for Paint / Settings / About
- [x] B3 Settings window: theme picker + custom theme editor, autosave toggle, editor prefs, project metadata (author / version / description / icon)
- [x] B4 Dock layout templates: Default / Code / Animation / Art presets
- [x] B5 New themes: Cwat (purple), Gameboy, Synthwave (7 total)
- [x] B6 Built-in Paint: pixel editor window (pencil / eraser / fill / eyedropper / palette / zoom) that saves to project assets and edits existing image assets

## C. Panels
- [x] C1 Explorer panel: scenes (multi-scene add/rename/delete/set-main/switch) + scripts + assets + anims + prefabs in one tree
- [x] C2 Errors panel: live syntax checking of all scripts + runtime errors, click to jump, count badge
- [x] C3 Output panel: export/build log with sizes and timings
- [x] C4 Debugging: FPS/nodes overlay, game.watch() watch panel, pause / resume / step controls in play mode

## D. Engine
- [x] D1 3D physics via vendored cannon-es: body3d dynamic/static, mass, friction, restitution, box/sphere/cylinder colliders, onCollide, applyImpulse — dynamically loaded only when used
- [x] D2 Debug hooks: game.watch(name, value), pause/step support in the loop
- [x] D3 Export metadata: author/version/description meta tags in exported HTML

## E. File formats & plugins
- [x] E1 `.neku` / `.nk` project files (save/open in Studio + CLI + play.html)
- [x] E2 `.nkp` prefab files (export/import a subtree)
- [x] E3 `.nkt` theme files (export/import custom themes)
- [x] E4 `.nkx` plugin files: JS with a `neku` API — registerTheme / registerTemplate / registerTool / registerNodeType / on(event); managed in Settings, persisted
- [x] E5 Desktop file associations for the formats (best effort per OS)

## F. Desktop builds (Neutralino)
- [x] F1 desktop app shell: native Open/Save dialogs, real filesystem, recent project paths, window title = project name
- [x] F2 App icons from the mascot
- [x] F3 Binaries for macOS (arm64+x64), Windows (x64), Linux (x64) → dist/desktop/*.zip
- [x] F4 One-command rebuild: `npm run desktop`

## G. Docs & release
- [x] G1 docs/API.md — complete scripting/engine reference
- [x] G2 README overhaul: mascot, downloads section, file formats, plugins
- [x] G3 docs/PUBLISHING.md — itch.io + GitHub Pages for games; putting Neku Studio itself on itch.io
- [x] G4 GitHub Release v1.0.0: desktop zips + sample game exports attached
- [x] G5 Full browser + desktop verification pass
- [x] G6 GitHub Pages hosted Studio + v1.0.1 rebuild with mascot decoded from the attached ASCII art
- [x] G7 v1.0.2: non-locking cheatsheet overlay + per-client/session local settings

Execution order: A → F (testers get builds even if time runs short) → B → C → D → E → G.

---

# Neku 2.0 — the professional pass

Goal: Studio that feels like a real tool (Godot/Photoshop-grade placement logic),
co-op that works from anywhere on any platform, real 3D editing, Paint worth
using, and one-click desktop game exports.

## H. Studio shell 2.0
- [x] H1 Menu bar (File/Edit/View/Project/Tools/Help) replacing loose toolbar buttons + Tools junk drawer
- [x] H2 One logical home per feature: themes ONLY in Preferences; Project Settings window (display/physics/FX/metadata) split from editor Preferences; Inspector no longer doubles as project settings
- [x] H3 Modal dialogs + toasts replace every alert/confirm/prompt
- [x] H4 Boot splash with animated cwat + staged progress (web + desktop)
- [x] H5 Status bar: contextual viewport hints, autosave time, co-op room, version
- [x] H6 Shortcuts: ⌘S/⌘O/⌘D/F2/⌘1-2-3 + cheatsheet update

## I. Co-op 2.0 (any platform, anywhere)
- [x] I1 Hosted relay: Cloudflare Worker + Durable Object (relay/), rooms persist a week, free tier — wss://neku-coop.dedpul3000a.workers.dev
- [x] I2 Protocol v2: doc syncs without assets; assets chunked (≤256 KB frames) and pushed only when changed
- [x] I3 Room codes (NEKU-style 5 letters), Host/Join window, peer list with live selections
- [x] I4 Auto-reconnect with backoff + ping keepalive; local server speaks the same protocol
- [x] I5 Verified live: browser Studio hosted, external client joined + edited over the internet

## J. 3D editor
- [x] J1 Move/rotate/scale gizmos (TransformControls, vendored) with W/E/R keys
- [x] J2 Snapping (toggle + shift), focus-on-selection (F), grid toggle
- [x] J3 Visible, pickable markers for cameras, lights, empties
- [x] J4 Material section with sliders (metalness/roughness/emissive/opacity) + edit-texture-in-Paint button
- [x] J5 Grouped Inspector (Transform/Shape/Material/Physics/…)

## K. Paint 2.0
- [x] K1 Layers (add/delete/reorder/merge/visibility)
- [x] K2 Tools: pencil, eraser, fill, picker, line, rect, circle, select/move
- [x] K3 Undo/redo, content-preserving resize up to 128×128
- [x] K4 Spritesheet frames: boundaries, animated preview, onion skin

## L. Desktop game export
- [x] L1 Export → Desktop apps from the Studio (browser or native): mac/win/linux zips
- [x] L2 Zero-dep asar (resources.neu) writer + zip with Unix exec bits
- [x] L3 Player binaries tracked in desktop/player + served from Pages for hosted Studios
- [x] L4 CLI twin: node tools/export-desktop.js project.neku
- [x] L5 Verified: exported mac app boots and runs

## M. Release
- [x] M1 Vendor rebuild pinned to three 0.166.1 (+TransformControls), tools/build-vendor.js
- [x] M2 Full verification pass (browser flows, relay, local server, desktop Studio + game boot)
- [x] M3 v2.0.0: push, tag, GitHub Release with Studio zips + samples
