# Neku 1.0 "Cwat" — release plan

Goal: a fully working, finished, debugged engine product for ultra-lightweight
games and apps, publishable to itch.io / GitHub Pages, with desktop Studio
builds for macOS / Windows / Linux.

## A. Branding & mascot
- [ ] A1 cwat pixel-art mascot (from deviverr/cwat, the `>w<` cat): SVG for UI + PNG icons (zero-dep PNG encoder in tools/gen-mascot.js)
- [ ] A2 Mascot everywhere: Studio logo, main menu, empty states, favicon, desktop app icon, README

## B. Studio shell
- [ ] B1 Main Menu (welcome screen): mascot, recent projects, new-from-template (Blank / 2D Game / 3D Game / App), samples, open file
- [ ] B2 Floating window system (draggable pixel windows) for Paint / Settings / About
- [ ] B3 Settings window: theme picker + custom theme editor, autosave toggle, editor prefs, project metadata (author / version / description / icon)
- [ ] B4 Dock layout templates: Default / Code / Animation / Art presets
- [ ] B5 New themes: Cwat (purple), Gameboy, Synthwave (7 total)
- [ ] B6 Built-in Paint: pixel editor window (pencil / eraser / fill / eyedropper / palette / zoom) that saves to project assets and edits existing image assets

## C. Panels
- [ ] C1 Explorer panel: scenes (multi-scene add/rename/delete/set-main/switch) + scripts + assets + anims + prefabs in one tree
- [ ] C2 Errors panel: live syntax checking of all scripts + runtime errors, click to jump, count badge
- [ ] C3 Output panel: export/build log with sizes and timings
- [ ] C4 Debugging: FPS/nodes overlay, game.watch() watch panel, pause / resume / step controls in play mode

## D. Engine
- [ ] D1 3D physics via vendored cannon-es: body3d dynamic/static, mass, friction, restitution, box/sphere/cylinder colliders, onCollide, applyImpulse — dynamically loaded only when used
- [ ] D2 Debug hooks: game.watch(name, value), pause/step support in the loop
- [ ] D3 Export metadata: author/version/description meta tags in exported HTML

## E. File formats & plugins
- [ ] E1 `.neku` / `.nk` project files (save/open in Studio + CLI + play.html)
- [ ] E2 `.nkp` prefab files (export/import a subtree)
- [ ] E3 `.nkt` theme files (export/import custom themes)
- [ ] E4 `.nkx` plugin files: JS with a `neku` API — registerTheme / registerTemplate / registerTool / registerNodeType / on(event); managed in Settings, persisted
- [ ] E5 Desktop file associations for the formats (best effort per OS)

## F. Desktop builds (Neutralino)
- [ ] F1 desktop app shell: native Open/Save dialogs, real filesystem, recent project paths, window title = project name
- [ ] F2 App icons from the mascot
- [ ] F3 Binaries for macOS (arm64+x64), Windows (x64), Linux (x64) → dist/desktop/*.zip
- [ ] F4 One-command rebuild: `npm run desktop`

## G. Docs & release
- [ ] G1 docs/API.md — complete scripting/engine reference
- [ ] G2 README overhaul: mascot, downloads section, file formats, plugins
- [ ] G3 docs/PUBLISHING.md — itch.io + GitHub Pages for games; putting Neku Studio itself on itch.io
- [ ] G4 GitHub Release v1.0.0: desktop zips + sample game exports attached
- [ ] G5 Full browser + desktop verification pass

Execution order: A → F (testers get builds even if time runs short) → B → C → D → E → G.
