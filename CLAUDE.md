# Dream Kick — CLAUDE.md

Browser-based 3D football game (FIFA-style UI, Dream League Soccer gameplay feel). Full spec in `MASTER_PROMPT.md`; feature list in `FEATURES.md`.

## Stack
- Vanilla JavaScript ES modules — **no build step, no npm, no framework**
- Three.js (r160+) vendored at `vendor/three.module.js` — the ONLY third-party lib; no CDN calls
- Zero external assets: all icons are inline SVG (`src/ui/icons.js`), textures are runtime `THREE.CanvasTexture`, badges/avatars procedural
- PWA: `manifest.json` + `sw.js` (cache name `dreamkick-v1`), saves in localStorage

## Run
No install. Serve the folder with any static server, e.g.:
```
python -m http.server 8000   # then open http://localhost:8000
```
ES modules require http(s) — opening index.html via file:// will not work.

## Folder structure
```
index.html          shell only (canvas + UI root, <100 lines)
styles/ui.css       all UI styling (CSS custom properties)
vendor/             three.module.js
src/main.js         boot, game loop, screen router
src/core/           config.js (all tunables), math.js, state.js (FSM: MENU→TEAM_SELECT→MATCH→RESULTS), save.js
src/data/           teams.js (20 clubs + squads), names.js
src/engine/         match.js (phase orchestrator), ball.js, player.js, team.js, ai.js, goalkeeper.js, rules.js
src/render/         scene.js, stadium.js, playerMesh.js, ballMesh.js, camera.js, effects.js
src/input/          input.js (action abstraction), keyboard.js, touch.js
src/ui/             icons.js, screens.js, hud.js
legacy_v1.html      old single-file v1 (reference only, don't extend)
```

## Conventions
- No file over ~400 lines; keep modules in the layout above
- All tunable constants (physics, AI, camera, timings) live in `src/core/config.js`
- FIFA 20 visual language: navy `#0b0e1a` bg, accent `#00d4a3`, skewed card/button edges — see MASTER_PROMPT.md

## Known gotchas / current state (2026-07-04)
- **`index.html`, `src/main.js`, `styles/ui.css`, `src/ui/screens.js`, `src/ui/hud.js` do not exist yet** — build is mid-refactor from legacy_v1.html. manifest.json and sw.js already reference `./index.html`, so nothing loads until it's created.
- `styles/` directory is empty.
- `sw.js` only precaches `./`, `index.html`, `manifest.json` but its fetch handler caches everything on first hit; bump `CACHE` name (`dreamkick-v1`) whenever files change or stale caches will serve old code.
- Three.js is imported via relative path `../../vendor/three.module.js` — keep that path if moving files.
