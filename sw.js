/* sw.js — offline cache for Dream Kick v2 */
const CACHE = 'dreamkick-v2.8.0'; // bumped: V3 Phase D career mode
const ASSETS = [
  './',
  './index.html',
  './legacy_v1.html',
  './manifest.json',
  './styles/ui.css',
  './vendor/three.module.js',
  './src/main.js',
  './src/core/config.js',
  './src/core/math.js',
  './src/core/state.js',
  './src/core/save.js',
  './src/core/career.js',
  './src/data/names.js',
  './src/data/teams.js',
  './src/engine/ball.js',
  './src/engine/ballPhysics.js',
  './src/engine/possessionSystem.js',
  './src/engine/passingSystem.js',
  './src/engine/shootingSystem.js',
  './src/engine/player.js',
  './src/engine/team.js',
  './src/engine/ai.js',
  './src/engine/goalkeeper.js',
  './src/engine/rules.js',
  './src/engine/ratings.js',
  './src/engine/match.js',
  './src/render/scene.js',
  './src/render/stadium.js',
  './src/render/playerMesh.js',
  './src/render/ballMesh.js',
  './src/render/camera.js',
  './src/render/cameraController.js',
  './src/render/effects.js',
  './src/input/input.js',
  './src/input/keyboard.js',
  './src/input/touch.js',
  './src/ui/icons.js',
  './src/ui/draw.js',
  './src/ui/screens.js',
  './src/ui/hud.js',
  './src/ui/components.js',
  './src/ui/playerCard.js',
  './src/ui/lineupIntro.js',
  './src/ui/teamManagement.js',
  './src/ui/settingsScreen.js',
  './src/ui/matchFlow.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
