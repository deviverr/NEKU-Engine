# Publishing Neku games (and Neku Studio itself)

## Your game on itch.io

1. In the Studio: **Export ▾ → itch.io ZIP** (2D games ≈ 50 KB, 3D ≈ 1 MB).
2. itch.io → *Upload new project*:
   - **Kind of project:** HTML
   - Upload the zip, check **“This file will be played in the browser”**.
   - **Viewport dimensions:** your project's width × height (or “Click to launch in fullscreen”).
   - Mobile: tick “Mobile friendly” — Neku games handle touch out of the box.
3. Save & view. That's the whole pipeline.

Tips: name an asset `icon.png` for a favicon · fill **Settings → Project metadata**
(author/version/description become meta tags) · itch's dark page theme suits the CRT look.

## Your game on GitHub Pages

1. **Export ▾ → HTML file**, rename it `index.html`.
2. Put it in a repo (root or `docs/`), push.
3. Repo → Settings → Pages → *Deploy from a branch* → pick branch/folder.
4. Live at `https://YOU.github.io/REPO/`. Every export overwrite + push = instant update.

## Your game as a desktop app

Built in: **File → Export → Desktop apps** in the Studio produces
`<game>-{macos,windows,linux}.zip` — a native Neutralino app with your game's
name, window size, and icon (name an image asset `icon.png`). Works from the
browser Studio, the hosted Studio, and the desktop Studio; no tooling installed.
CLI twin: `node tools/export-desktop.js mygame.neku`.

Prefer another wrapper? The exported HTML also drops straight into
[Tauri](https://tauri.app) (`npm create tauri-app`) for ~3–8 MB installers.

## Neku Studio itself on itch.io (as a tool)

1. `npm run desktop` → `dist/desktop/NekuStudio-{macos,windows,linux}.zip`.
2. itch.io → Upload new project → **Kind of project: Downloadable**.
3. Upload all three zips; label each with its platform checkbox (Windows/Mac/Linux).
4. Classification: **Tools**. Suggested tags: `game-engine`, `2d`, `3d`, `pixel-art`.
5. Optional web version: `npm run pages`, deploy `dist/pages` to a `gh-pages`
   branch, and link `…/editor/` as “Use in browser”.

Current hosted Studio: https://deviverr.github.io/NEKU-Engine/editor/

Tester notes to include on the page:
- macOS: unsigned build — right-click → Open on first launch.
- Windows: needs WebView2 (preinstalled on Win 10/11).
- Linux: needs `libwebkit2gtk` (`sudo apt install libwebkit2gtk-4.1-0`).

## Releases on GitHub

```bash
npm run samples && npm run export     # refresh sample exports
npm run desktop                        # rebuild the three Studio zips
npm run pages                          # refresh GitHub Pages payload
gh release create v1.x.x dist/desktop/*.zip dist/*.html --title "Neku v1.x.x" --notes "…"
```
