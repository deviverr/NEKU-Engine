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

Wrap the exported HTML with [Tauri](https://tauri.app) (`npm create tauri-app`, point it
at the file) for ~3–8 MB installers, or reuse Neku's own Neutralino setup: copy
`desktop/`, replace `resources` with your exported game, `npm run desktop`.

## Neku Studio itself on itch.io (as a tool)

1. `npm run desktop` → `dist/desktop/NekuStudio-{macos,windows,linux}.zip`.
2. itch.io → Upload new project → **Kind of project: Downloadable**.
3. Upload all three zips; label each with its platform checkbox (Windows/Mac/Linux).
4. Classification: **Tools**. Suggested tags: `game-engine`, `2d`, `3d`, `pixel-art`.
5. Optional web version: the Studio also runs hosted — put the whole repo on GitHub
   Pages and link `…/editor/` as “Use in browser”.

Tester notes to include on the page:
- macOS: unsigned build — right-click → Open on first launch.
- Windows: needs WebView2 (preinstalled on Win 10/11).
- Linux: needs `libwebkit2gtk` (`sudo apt install libwebkit2gtk-4.1-0`).

## Releases on GitHub

```bash
npm run samples && npm run export     # refresh sample exports
npm run desktop                        # rebuild the three Studio zips
gh release create v1.x.x dist/desktop/*.zip dist/*.html --title "Neku v1.x.x" --notes "…"
```
