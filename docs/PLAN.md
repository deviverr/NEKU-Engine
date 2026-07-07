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

Execution order: A → F (testers get builds even if time runs short) → B → C → D → E → G.
