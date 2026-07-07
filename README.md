# Dream Kick ⚽

A browser-based 3D football game — live, playable 11v11 matches with a premium, animated FIFA-style interface and a full career mode, built entirely in vanilla JavaScript and Three.js. No frameworks, no build step, no external assets: every texture, badge and icon is generated in code at runtime.

## Premium UI Overhaul Features (FIFA-Style Language)

We have rebuilt the user interface from the ground up to match the standards of a premium product site, incorporating the following components and motion rules:
- **Design Tokens**: Defined color theme using rich dark-navy surfaces (`#0a0c10`), vibrant teal-green (`#00d4a3`), and secondary blue accents (`#3d6bff`).
- **FIFA Skewed Styling**: Parallelogram motifs on cards and buttons via custom CSS `clip-path` rules.
- **SpotlightCard & TiltCard**: Radial cursor-following glows combined with smooth 3D tilting on main menu tiles, lineup cards, and stats containers.
- **MagneticButtons**: CTAs and main actions attract to the pointer and scale down slightly on click/tap.
- **GlowOrbs**: Multi-layered ambient orbs (`blur(180px)`) positioned behind content to defeat the "flat black page" look.
- **TextScramble**: Headline scramble animations resolving left-to-right on first load.
- **TubelightNav**: Segmented controls with sliding active indicator pills that glow.
- **ProgressRing & Counters**: circular percentage indicators (used in MOTM ratings) and viewport-trigged ease-out count-ups.
- **WebAudio Sound Effects**: Audio chimes playing on hover and click actions (can be toggled in the menu).
- **Toast System & Modals**: Bottom-right stacked notification toasts and trap-focused backdrop-blurred dialogs.
- **Lineup Splash & Signature Wipes**: Diagonal screen wipes (300ms) transition screens. Staggered team slide-in lineups before matches.
- **Classic Career Dashboard**: A full week-by-week league table simulation (20 clubs) where other match results are simulated, allowing you to guide your club directly to the top.

## How to Run it

**Easiest (Windows): double-click `play.bat`** — it starts a local server and opens the game in your browser. Keep the black window open while playing; close it to stop.

Or play the live version: **[dream-kick.vercel.app](https://dream-kick.vercel.app/)**

Or manually with any static file server:

```bash
cd dream-kick
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> **Note:** double-clicking `index.html` won't work — ES modules and the service worker require the page to be served over http(s). If you see `http://[::]:8000` in the terminal, that's normal; still browse to `localhost:8000`.

Alternatives: `npx serve`, VS Code's Live Server extension, or any web host.

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
  ui/             screens, HUD, inline SVG icons, components helper
```

All gameplay tuning (physics, AI difficulty, camera, timings) lives in `src/core/config.js`.
