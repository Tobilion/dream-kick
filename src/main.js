/** main.js — boot, fixed-timestep loop, screen routing, wiring. */
import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './core/config.js';
import { StateMachine } from './core/state.js';
import { loadSave, writeSave, recordResult } from './core/save.js';
import { CLUBS } from './data/teams.js';
import { Match } from './engine/match.js';
import { SceneMgr } from './render/scene.js';
import { Stadium } from './render/stadium.js';
import { PlayerMesh } from './render/playerMesh.js';
import { BallMesh } from './render/ballMesh.js';
import { BroadcastCam } from './render/camera.js';
import { Effects } from './render/effects.js';
import { Input } from './input/input.js';
import { Screens } from './ui/screens.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('gameCanvas');
const uiRoot = document.getElementById('ui');
const hudRoot = document.getElementById('hudRoot');

const save = loadSave();
const sceneMgr = new SceneMgr(canvas);
const stadium = new Stadium(sceneMgr.scene, sceneMgr.shadowsOn);
const cam = new BroadcastCam(sceneMgr.aspect);
sceneMgr.onResize = a => cam.setAspect(a);
const effects = new Effects(sceneMgr.scene);
const input = new Input();
const fsm = new StateMachine();

/** name-plate projection helper used by hud.js */
const _pv = new THREE.Vector3();
window.__projectPoint = (x, y, z, size) => {
  _pv.set(x, y, z).project(cam.cam);
  if (_pv.z > 1) return null;
  return { x: (_pv.x * 0.5 + 0.5) * size.w, y: (-_pv.y * 0.5 + 0.5) * size.h };
};

let match = null;
let meshes = [];         // PlayerMesh list
let ballMesh = null;
let hud = null;
let paused = false;

const screens = new Screens(uiRoot, save, {
  startMatch: opts => fsm.go('MATCH', opts),
  toMenu: () => fsm.go('MENU'),
});

hud = new Hud(hudRoot, {
  togglePause: () => setPaused(!paused),
  pauseAction: act => {
    if (act === 'resume') setPaused(false);
    else if (act === 'restart') { const o = match._opts; setPaused(false); fsm.go('MATCH', o); }
    else if (act === 'quit') { setPaused(false); fsm.go('MENU'); }
  },
});

function setPaused(on) {
  if (!match) return;
  paused = on;
  match.paused = on;
  hud.setPaused(on);
}

/* ---------------- states ---------------- */
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
    save.homeTeam = opts.homeClub.id; save.awayTeam = opts.awayClub.id;
    save.difficulty = opts.difficulty; save.halfLength = opts.halfLength;
    writeSave(save);

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
        onPhase: phase => {
          const labels = {
            THROW_IN: 'THROW IN', CORNER: 'CORNER', GOAL_KICK: 'GOAL KICK',
            FREE_KICK: 'FREE KICK', HALF_TIME: 'HALF TIME', KICKOFF: 'KICK OFF',
          };
          if (labels[phase]) hud.phaseBanner(labels[phase]);
        },
        onKick: (kind, power) => { if (kind === 'shot' && power > 0.7) cam.shake(0.35); },
        onCommentary: text => hud.ticker(text),
        onFullTime: () => {
          recordResult(save, {
            home: match.teams[0].club.code, away: match.teams[1].club.code,
            hs: match.score[0], as: match.score[1],
          });
          
          if (match._opts.isCareer) {
            const myClubId = save.career.clubId;
            const oppClubId = match._opts.awayClub.id;
            const myScore = match.score[0];
            const oppScore = match.score[1];
            
            const myStats = save.career.stats.find(st => st.id === myClubId);
            if (myStats) {
              myStats.pld++;
              myStats.gf += myScore;
              myStats.ga += oppScore;
              if (myScore > oppScore) { myStats.w++; myStats.pts += 3; }
              else if (myScore === oppScore) { myStats.d++; myStats.pts += 1; }
              else { myStats.l++; }
            }
            
            const oppStats = save.career.stats.find(st => st.id === oppClubId);
            if (oppStats) {
              oppStats.pld++;
              oppStats.gf += oppScore;
              oppStats.ga += myScore;
              if (oppScore > myScore) { oppStats.w++; oppStats.pts += 3; }
              else if (oppScore === myScore) { oppStats.d++; oppStats.pts += 1; }
              else { oppStats.l++; }
            }
            
            const week = save.career.week;
            const stats = save.career.stats;
            const playedThisWeek = new Set([myClubId, oppClubId]);
            
            for (let i = 0; i < stats.length; i++) {
              const st = stats[i];
              if (playedThisWeek.has(st.id)) continue;
              
              const oppIdx = (st.id + week) % stats.length;
              const oppSt = stats[oppIdx];
              
              if (oppSt && !playedThisWeek.has(oppSt.id)) {
                playedThisWeek.add(st.id);
                playedThisWeek.add(oppSt.id);
                
                const r1 = CLUBS[st.id].rating;
                const r2 = CLUBS[oppSt.id].rating;
                
                let s1 = Math.floor(Math.random() * 2);
                let s2 = Math.floor(Math.random() * 2);
                
                if (r1 > r2 + 4) s1 += Math.floor(Math.random() * 2);
                else if (r2 > r1 + 4) s2 += Math.floor(Math.random() * 2);
                
                st.pld++;
                st.gf += s1;
                st.ga += s2;
                
                oppSt.pld++;
                oppSt.gf += s2;
                oppSt.ga += s1;
                
                if (s1 > s2) {
                  st.w++; st.pts += 3;
                  oppSt.l++;
                } else if (s1 === s2) {
                  st.d++; st.pts += 1;
                  oppSt.d++; oppSt.pts += 1;
                } else {
                  st.l++;
                  oppSt.w++; oppSt.pts += 3;
                }
              }
            }
            
            save.career.week++;
            writeSave(save);
          }
          
          setTimeout(() => fsm.go('RESULTS'), 900);
        },
      },
    });
    match._opts = opts;

    // build visuals
    for (const team of match.teams) {
      const kitKey = team.index === 0 ? 'home' : 'away';
      for (const p of team.players) {
        const m = new PlayerMesh(p, team.club.kits[kitKey], sceneMgr.shadowsOn);
        sceneMgr.scene.add(m.group);
        meshes.push(m);
      }
    }
    ballMesh = new BallMesh(match.ball, sceneMgr.shadowsOn);
    ballMesh.addTo(sceneMgr.scene);

    // controlled-player ring
    ringMesh = makeRing();
    sceneMgr.scene.add(ringMesh);

    cam.mode = 'follow';
    hud.bind(match);
    input.showTouchUI(true);
    paused = false;
  },
  update(dt) {
    input.update();
    if (input.state.pausePressed) setPaused(!paused);
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
  for (const m of meshes) sceneMgr.scene.remove(m.group);
  meshes = [];
  if (ballMesh) { sceneMgr.scene.remove(ballMesh.group, ballMesh.blob); ballMesh = null; }
  if (ringMesh) { sceneMgr.scene.remove(ringMesh); ringMesh = null; }
}

/* ---------------- main loop (fixed timestep) ---------------- */
const FIXED = 1 / 60;
let acc = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.1); // avoid spiral of death after tab switch

  // simulation at fixed rate
  acc += dt;
  while (acc >= FIXED) {
    fsm.update(FIXED);
    acc -= FIXED;
  }

  // render-side updates at display rate
  stadium.update(dt);
  effects.update(dt);
  sceneMgr.probeQuality(dt);

  if (fsm.is('MATCH') && match) {
    for (const m of meshes) m.update(dt);
    ballMesh.update(dt);
    if (ringMesh && match.controlled) {
      ringMesh.position.x = match.controlled.pos.x;
      ringMesh.position.z = match.controlled.pos.z;
      ringMesh.visible = true;
    }
    cam.update(dt, match.ball.pos, match.ball.vel);
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
