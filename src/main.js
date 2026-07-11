/** main.js — boot, fixed-timestep loop, screen routing, wiring. */
import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './core/config.js';
import { StateMachine } from './core/state.js';
import { loadSave, writeSave, recordResult } from './core/save.js';
import { CLUBS } from './data/teams.js';
import { Match, MATCH_STATE } from './engine/match.js';
import { SceneMgr } from './render/scene.js';
import { Stadium } from './render/stadium.js';
import { PlayerMesh } from './render/playerMesh.js';
import { BallMesh } from './render/ballMesh.js';
import { CameraController, CAMERA_PRESETS, PRESET_LABELS, migratePreset } from './render/cameraController.js';
import { Effects } from './render/effects.js';
import { Input } from './input/input.js';
import { Screens } from './ui/screens.js';
import { Hud } from './ui/hud.js';
import { LineupIntro } from './ui/lineupIntro.js';
import { showTeamManagementModal } from './ui/teamManagement.js';
import { showSettingsModal } from './ui/settingsScreen.js';

const canvas = document.getElementById('gameCanvas');
const uiRoot = document.getElementById('ui');
const hudRoot = document.getElementById('hudRoot');

const save = loadSave();
const sceneMgr = new SceneMgr(canvas);
const stadium = new Stadium(sceneMgr.scene, sceneMgr.shadowsOn);
const cam = new CameraController(sceneMgr.aspect);
sceneMgr.onResize = a => cam.setAspect(a);
cam.setOccludables(stadium.standsList);

// Clean hierarchy: all match actors live under one group
const playersGroup = new THREE.Group();
playersGroup.name = 'PlayersAndBall';
sceneMgr.scene.add(playersGroup);
const effects = new Effects(sceneMgr.scene);
const input = new Input();
const fsm = new StateMachine();

// Apply persisted camera settings on startup (migrating legacy v1 preset names)
cam.preset = migratePreset(save.cameraPreset);
save.cameraPreset = cam.preset;
cam.setDistance(save.cameraDistance ?? save.cameraZoom ?? 1.0);
save.cameraDistance = cam.distance;

/** name-plate projection helper used by hud.js */
const _pv = new THREE.Vector3();
window.__projectPoint = (x, y, z, size) => {
  _pv.set(x, y, z).project(cam.cam);
  if (_pv.z > 1) return null;
  return { x: (_pv.x * 0.5 + 0.5) * size.w, y: (-_pv.y * 0.5 + 0.5) * size.h };
};

let match = null;
let meshes = [];
let ballMesh = null;
let hud = null;
let paused = false;

/** Camera preset order for in-game cycling */
function cycleCamera() {
  const idx = CAMERA_PRESETS.indexOf(cam.preset);
  cam.preset = CAMERA_PRESETS[(idx + 1) % CAMERA_PRESETS.length];
  save.cameraPreset = cam.preset;
  writeSave(save);
  hud?.ticker(`Camera: ${PRESET_LABELS[cam.preset].toUpperCase()}`);
}

const screens = new Screens(uiRoot, save, {
  startMatch: opts => fsm.go('MATCH', opts),
  toMenu: () => fsm.go('MENU'),
  openSettings: () => showSettingsModal(save, null, cam),
});

hud = new Hud(hudRoot, {
  togglePause: () => setPaused(!paused),
  pauseAction: act => {
    if (act === 'resume') {
      setPaused(false);
    } else if (act === 'teamMgmt') {
      showTeamManagementModal(match, 0, () => {});
    } else if (act === 'settings') {
      showSettingsModal(save, match, cam, () => {});
    } else if (act === 'simEnd') {
      const confirmed = confirm('Simulate the rest of the match? The engine will auto-play to full time.');
      if (confirmed) {
        setPaused(false);
        match.simToEnd();
      }
    } else if (act === 'forfeit') {
      const confirmed = confirm('Forfeit the match? You will concede 3 goals and be taken to the results screen.');
      if (confirmed) {
        setPaused(false);
        match.forfeit();
      }
    } else if (act === 'quit') {
      const confirmed = confirm('Exit to the main menu? Your current match progress will be lost.');
      if (confirmed) {
        setPaused(false);
        fsm.go('MENU');
      }
    }
  },
});

function setPaused(on) {
  if (!match) return;
  paused = on;
  if (on) match.go(MATCH_STATE.PAUSED);
  else match.go('UNPAUSE');
  hud.setPaused(on);
  if (!on) hud.idleTime = 0;
}

/* ---------------- FSM states ---------------- */
fsm.register('MENU', {
  enter() {
    cam.mode = 'orbit';
    hud.show(false);
    input.showTouchUI(false);
    clearMatchVisuals();
    screens.menu();
  },
});

fsm.register('MATCH', {
  enter(opts) {
    screens.hide();
    clearMatchVisuals();
    save.homeTeam = opts.homeClub.id;
    save.awayTeam = opts.awayClub.id;
    save.difficulty = opts.difficulty;
    save.halfLength = opts.halfLength;
    writeSave(save);

    // Build match simulation
    match = new Match({
      ...opts,
      userTeam: 0,
      events: {
        onGoal: (team, scorer, minute) => {
          const club = match.teams[team].club;
          hud.goalBanner(scorer.data.name, minute, club.name);
          stadium.rippleNet(match.teams[team].attackDir);
          effects.goalBurst(match.teams[team].goalX, 0);
          cam.shake(0.9);
        },
        onStateChange: state => {
          const labels = {
            HALF_TIME: 'HALF TIME',
            KICKOFF: 'KICK OFF',
            FULL_TIME: 'FULL TIME',
          };
          if (labels[state]) hud.phaseBanner(labels[state]);
          // Show half-time screen then resume automatically
          if (state === MATCH_STATE.HALF_TIME) {
            setTimeout(() => screens.halfTime(match, () => match.resumeFromHalfTime()), 400);
          }
          if (state === MATCH_STATE.FULL_TIME) {
            onFullTime();
          }
        },
        onPhase: phase => {
          const labels = {
            THROW_IN: 'THROW IN', CORNER: 'CORNER', GOAL_KICK: 'GOAL KICK',
            FREE_KICK: 'FREE KICK',
          };
          if (labels[phase]) hud.phaseBanner(labels[phase]);
        },
        onKick: (kind, power) => { if (kind === 'shot' && power > 0.7) cam.shake(0.35); },
        onCommentary: text => hud.ticker(text),
        onFullTime: () => {},  // handled via onStateChange above
      },
    });
    match._opts = opts;

    // Build 3D player meshes and wire back-reference for subs
    for (const team of match.teams) {
      const kitKey = team.index === 0 ? 'home' : 'away';
      for (const p of team.players) {
        const m = new PlayerMesh(p, team.club.kits[kitKey], sceneMgr.shadowsOn);
        playersGroup.add(m.group);
        meshes.push(m);
      }
    }
    match._meshes = meshes;

    ballMesh = new BallMesh(match.ball, sceneMgr.shadowsOn);
    ballMesh.addTo(playersGroup);
    ringMesh = makeRing();
    playersGroup.add(ringMesh);

    cam.mode = 'follow';
    input.showTouchUI(true);
    paused = false;

    // Run skippable lineup intro before kickoff
    const intro = new LineupIntro(uiRoot, match, () => {
      // Intro done → start kickoff
      match.go(MATCH_STATE.KICKOFF);
      hud.bind(match);
      hud.show(true);
    });
  },

  update(dt) {
    input.update();
    if (input.state.pausePressed) setPaused(!paused);
    if (input.state.cycleCamPressed) cycleCamera();
    match.update(dt, input.state);
  },

  exit() {
    input.showTouchUI(false);
    hud.show(false);
  },
});

fsm.register('RESULTS', {
  enter() {
    cam.mode = 'orbit';
    input.showTouchUI(false);
    screens.results(match);
  },
});

/** Called when the match FSM emits FULL_TIME */
function onFullTime() {
  recordResult(save, {
    home: match.teams[0].club.code,
    away: match.teams[1].club.code,
    hs: match.score[0],
    as: match.score[1],
  });

  // Career mode: update standings
  if (match._opts.isCareer) {
    updateCareerStandings();
  }

  setTimeout(() => fsm.go('RESULTS'), 900);
}

function updateCareerStandings() {
  const myClubId = save.career.clubId;
  const oppClubId = match._opts.awayClub.id;
  const myScore = match.score[0];
  const oppScore = match.score[1];

  const updateRow = (stats, gf, ga) => {
    if (!stats) return;
    stats.pld++;
    stats.gf += gf; stats.ga += ga;
    if (gf > ga) { stats.w++; stats.pts += 3; }
    else if (gf === ga) { stats.d++; stats.pts += 1; }
    else { stats.l++; }
  };

  updateRow(save.career.stats.find(s => s.id === myClubId), myScore, oppScore);
  updateRow(save.career.stats.find(s => s.id === oppClubId), oppScore, myScore);

  // Simulate other club fixtures this week
  const week = save.career.week;
  const stats = save.career.stats;
  const played = new Set([myClubId, oppClubId]);
  for (let i = 0; i < stats.length; i++) {
    const st = stats[i];
    if (played.has(st.id)) continue;
    const oppIdx = (st.id + week) % stats.length;
    const oppSt = stats[oppIdx];
    if (oppSt && !played.has(oppSt.id)) {
      played.add(st.id); played.add(oppSt.id);
      const r1 = CLUBS[st.id]?.rating || 75;
      const r2 = CLUBS[oppSt.id]?.rating || 75;
      let s1 = Math.floor(Math.random() * 2), s2 = Math.floor(Math.random() * 2);
      if (r1 > r2 + 4) s1 += Math.floor(Math.random() * 2);
      else if (r2 > r1 + 4) s2 += Math.floor(Math.random() * 2);
      updateRow(st, s1, s2);
      updateRow(oppSt, s2, s1);
    }
  }

  save.career.week++;
  writeSave(save);
}

let ringMesh = null;
function makeRing() {
  const geo = new THREE.RingGeometry(0.55, 0.72, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00d4a3, transparent: true, opacity: 0.85, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

function clearMatchVisuals() {
  playersGroup.clear();
  meshes = [];
  ballMesh = null;
  ringMesh = null;
  if (match) match._meshes = [];
}

/* ---- half-time screen hook (Screens must expose halfTime method) ---- */

/* ---------------- main loop (fixed timestep) ---------------- */
const FIXED = 1 / 60;
let acc = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.1);

  acc += dt;
  while (acc >= FIXED) {
    fsm.update(FIXED);
    acc -= FIXED;
  }

  // Render-rate updates
  const camPos = cam.cam.position;
  stadium.update(dt, camPos);
  effects.update(dt);
  sceneMgr.probeQuality(dt);

  if (fsm.is('MATCH') && match) {
    for (const m of meshes) m.update(dt);
    if (ballMesh) ballMesh.update(dt);
    if (ringMesh && match.controlled) {
      ringMesh.position.x = match.controlled.pos.x;
      ringMesh.position.z = match.controlled.pos.z;
      ringMesh.visible = true;
    } else if (ringMesh) {
      ringMesh.visible = false;
    }
    const attackDir = match.teams[0].attackDir;
    cam.update(dt, match.ball.pos, match.ball.vel, attackDir);
    hud.update(match, cam.cam, { w: window.innerWidth, h: window.innerHeight }, dt);
  } else {
    cam.update(dt, { x: 0, y: 0, z: 0 }, null);
  }

  sceneMgr.render(cam.cam);
}

fsm.go('MENU');
requestAnimationFrame(frame);

/* PWA service worker */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
