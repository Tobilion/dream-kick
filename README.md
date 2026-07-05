# Dream Kick ⚽

A browser-based 3D football game — live, playable 11v11 matches with a FIFA-style interface and a full career mode, built entirely in vanilla JavaScript and Three.js. No frameworks, no build step, no external assets: every texture, badge and icon is generated in code at runtime.

## Features

- **Live match engine** — real-time 11v11 on a 3D pitch: move, pass, shoot, tackle, sprint and switch players against AI opponents, with ball physics (arc, bounce, spin), goalkeepers, and a HUD with score, clock and mini-radar
- **Controls that adapt** — keyboard on desktop (WASD/arrows, X pass, Z/Space shoot, Shift sprint, C switch), virtual joystick + buttons on mobile, auto-detected
- **Career mode** — create your club (name, kit colors, generated badge), climb from Division 2 to Division 1, sign real-name players, train your squad, upgrade your stadium and meet board objectives
- **Fully offline** — installable PWA: after the first visit it runs with no internet, and progress saves locally
- **Zero assets** — 100% code-drawn graphics; the only dependency is Three.js, vendored locally

## Tech

Vanilla JavaScript (ES modules) · Three.js · Canvas-generated textures · Service worker + localStorage. No npm, no bundler.

## Run it

Any static file server works. Easiest with Python (preinstalled on most systems):

```bash
cd dream-kick
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> **Note:** double-clicking `index.html` won't work — ES modules and the service worker require the page to be served over http(s). If you see `http://[::]:8000` in the terminal, that's normal; still browse to `localhost:8000`.

Alternatives: `npx serve`, VS Code's Live Server extension, or any web host.

## Deploying live

The game is a static site — upload the folder to any static host:

- **GitHub Pages:** push the repo, enable Pages on the main branch — done.
- **Netlify / Vercel:** drag-and-drop the folder or connect the repo (no build command, publish directory = root).

HTTPS (which these hosts provide automatically) is required for the offline/PWA install feature.

## Project structure

```
index.html        app shell
styles/ui.css     all UI styling
vendor/           three.module.js (only third-party code)
src/
  main.js         boot, game loop, screen router
  core/           config (all tunables), math, state machine, saves
  data/           clubs, squads, player names
  engine/         match logic: ball, players, AI, goalkeeper, rules
  render/         Three.js scene, stadium, meshes, camera, effects
  input/          keyboard + touch abstraction
  ui/             screens, HUD, inline SVG icons
```

All gameplay tuning (physics, AI difficulty, camera, timings) lives in `src/core/config.js`.
