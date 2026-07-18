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
import { showHalfTimeMenu, showMatchStatsModal } from './ui/matchFlow.js';
import { migrateCareer, applyCareerToClubs, userFixture, completeRound, syncSeasonStats } from './core/career.js';
import { ReplayRecorder, ReplayPlayer } from './render/replay.js';

const canvas = document.getElementById('gameCanvas');
const uiRoot = document.getElementById('ui');
const hudRoot = document.getElementById('hudRoot');

const save = loadSave();
migrateCareer(save);            // upgrade any pre-V3 career shape
applyCareerToClubs(save.career); // re-apply progression + season stats to CLUBS
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
let replayRec = null;
let replayPlayer = null;

/** Play the last ~8s in slow-mo. `onDone` runs after entity state is restored. */
function startReplay(onDone) {
  if (!replayRec || replayRec.length < 60) { hud.ticker('Nothing to replay yet.'); onDone?.(); return false; }
  replayPlayer = new ReplayPlayer(replayRec, () => { replayPlayer = null; onDone?.(); });
  if (!replayPlayer.start()) { replayPlayer = null; onDone?.(); return false; }
  hud.phaseBanner('INSTANT REPLAY');
  return true;
}

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
    } else if (act === 'stats') {
      showMatchStatsModal(match);
    } else if (act === 'replay') {
      // hide the pause overlay (UI only — match stays PAUSED), replay, then re-show
      hud.setPaused(false);
      const ok = startReplay(() => { if (paused) hud.setPaused(true); });
      if (!ok) hud.setPaused(true);
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
          // Full half-time menu (V2 Phase 4): management/stats/settings/sim/forfeit/continue
          if (state === MATCH_STATE.HALF_TIME) {
            setTimeout(() => showHalfTimeMenu(match, {
              onTeamMgmt: () => showTeamManagementModal(match, 0, () => {}),
              onSettings: () => showSettingsModal(save, match, cam, () => {}),
              onToast: msg => hud.ticker(msg),
              onReplay: done => startReplay(done),
              onSimEnd: () => match.simToEnd(),
              onForfeit: () => match.forfeit(),
              onContinue: () => match.resumeFromHalfTime(),
            }), 400);
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
    window.__match = match; // debug/testing handle
    replayRec = new ReplayRecorder(match);
    replayPlayer = null;

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
    if (replayPlayer?.playing) return;      // freeze input/sim during replay
    if (input.state.pausePressed) setPaused(!paused);
    if (input.state.cycleCamPressed) cycleCamera();
    match.update(dt, input.state);
    if (!paused && match.state !== MATCH_STATE.HALF_TIME && match.state !== MATCH_STATE.FULL_TIME) {
      replayRec?.capture();
    }
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
  // V3 Phase D: record the user's real result into the round-robin fixture
  // (respecting home/away), sim the other nine fixtures, persist.
  const career = save.career;
  const fx = userFixture(career);
  if (!fx) return;
  const iAmHome = fx.home === career.clubId;
  // in a career match the user club is always match.teams[0]
  const mine = match.score[0], theirs = match.score[1];
  completeRound(career, iAmHome ? { hs: mine, as: theirs } : { hs: theirs, as: mine });
  syncSeasonStats(career);
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
    replayPlayer?.step(dt);
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
