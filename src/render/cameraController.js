/**
 * cameraController.js — V2 camera rebuild (Phase 1 of the reinvention).
 * DLS-style presets: Sideline (default), Broadcast-high, Top-Down classic, End-to-End.
 * Damped ball follow + look-ahead, distance 80–130%, stadium occlusion culling.
 * Replaces the retired BroadcastCam (src/render/camera.js).
 */
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../core/config.js';
import { clamp, damp } from '../core/math.js';

const C = CONFIG.CAMERA;
const P = CONFIG.PITCH;
const HALF_L = P.LENGTH / 2;
const HALF_W = P.WIDTH / 2;

export const CAMERA_PRESETS = ['sideline', 'broadcast', 'topDown', 'endToEnd'];

export const PRESET_LABELS = {
  sideline: 'Sideline',
  broadcast: 'Broadcast High',
  topDown: 'Top-Down Classic',
  endToEnd: 'End-to-End',
};

/** Map legacy v1 preset names (tele/broadcast/dynamic/topDown/endToEnd) to v2. */
export function migratePreset(name) {
  if (CAMERA_PRESETS.includes(name)) return name;
  if (name === 'broadcast') return 'broadcast';
  if (name === 'topDown') return 'topDown';
  if (name === 'endToEnd') return 'endToEnd';
  return 'sideline'; // tele, dynamic, anything unknown → new default
}

export class CameraController {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(C.FOV, aspect, 0.5, 600);

    this.preset = 'sideline';
    this.distance = 1.0;       // 0.8 .. 1.3 (Camera Distance setting)
    this.mode = 'follow';      // 'follow' | 'orbit' (menus)

    this.target = new THREE.Vector3();     // smoothed look target on the pitch
    this.lookY = 1.2;
    this.shakeMag = 0;
    this.orbitAngle = 0;

    // Occlusion culling
    this.occludables = [];
    this._ray = new THREE.Raycaster();
    this._rayDir = new THREE.Vector3();
    this._occlusionT = 0;

    this.cam.position.set(0, C.SIDELINE.HEIGHT, C.SIDELINE.DIST);
    this.cam.lookAt(0, 0, 0);
  }

  setAspect(a) {
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }

  setDistance(d) { this.distance = clamp(d, C.DIST_MIN, C.DIST_MAX); }

  /** Register stadium groups (stands, roofs) that may block the view. */
  setOccludables(groups) { this.occludables = groups || []; }

  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }

  /**
   * @param {number} dt
   * @param {{x:number,y:number,z:number}} ballPos
   * @param {{x:number,z:number}|null} ballVel
   * @param {number} attackDir user attack direction (+1 | -1)
   */
  update(dt, ballPos, ballVel, attackDir = 1) {
    if (this.mode === 'orbit') {
      this._updateOrbit(dt);
      return;
    }

    // --- Smoothed look target: ball + velocity look-ahead in direction of play ---
    const vx = ballVel?.x || 0, vz = ballVel?.z || 0;
    const tx = clamp(ballPos.x + vx * C.LOOKAHEAD_TIME, -HALF_L, HALF_L);
    const tz = clamp(ballPos.z + vz * C.LOOKAHEAD_TIME * 0.5, -HALF_W, HALF_W);

    const k = damp(C.FOLLOW_RATE, dt);
    this.target.x += (tx - this.target.x) * k;
    this.target.z += (tz - this.target.z) * k;

    // --- Desired camera position per preset ---
    let px, py, pz;
    const d = this.distance;

    switch (this.preset) {
      case 'broadcast': {
        // High TV gantry: wider framing, steeper angle than sideline.
        const S = C.BROADCAST;
        px = this.target.x * 0.92;
        py = S.HEIGHT * d;
        pz = clamp(this.target.z * 0.35, -8, 8) + S.DIST * d;
        this.lookY = 1.0;
        break;
      }

      case 'topDown': {
        // Classic bird's-eye, straight down with slight tilt for depth cue.
        const S = C.TOPDOWN;
        px = this.target.x;
        py = S.HEIGHT * d;
        pz = this.target.z + S.TILT_OFFSET;
        this.lookY = 0;
        break;
      }

      case 'endToEnd': {
        // Behind the goal the user defends, looking down-pitch.
        const S = C.END_TO_END;
        const side = -attackDir;
        px = (HALF_L + S.BEHIND_GOAL) * side * d;
        py = S.HEIGHT * d;
        pz = clamp(this.target.z * 0.7, -HALF_W * 0.6, HALF_W * 0.6);
        this.lookY = 1.0;
        break;
      }

      case 'sideline':
      default: {
        // DLS-style: off the +z sideline, low and elevated, ~28° pitch angle,
        // framing roughly a third of the pitch so players read as 3D bodies.
        const S = C.SIDELINE;
        px = this.target.x;
        py = S.HEIGHT * d + (ballPos.y > 1.5 ? (ballPos.y - 1.5) * 0.35 : 0);
        pz = clamp(this.target.z * 0.45, -6, 6) + S.DIST * d;
        this.lookY = 1.1;
        break;
      }
    }

    // Airborne ball: gentle pull-back so lobs stay in frame (never snap).
    const air = clamp(ballPos.y / 8, 0, 1);
    if (this.preset !== 'topDown') { py += air * 3; pz += (this.preset === 'endToEnd' ? 0 : air * C.AIR_ZOOM); }

    // Camera shake
    if (this.shakeMag > 0.001) {
      px += (Math.random() * 2 - 1) * this.shakeMag;
      py += (Math.random() * 2 - 1) * this.shakeMag * 0.6;
      this.shakeMag *= Math.max(0, 1 - C.SHAKE_DECAY * dt);
    }

    // Damped position (spring-style, framerate independent — never snaps)
    const pk = damp(C.POSITION_RATE, dt);
    this.cam.position.x += (px - this.cam.position.x) * pk;
    this.cam.position.y += (py - this.cam.position.y) * pk;
    this.cam.position.z += (pz - this.cam.position.z) * pk;

    this.cam.lookAt(this.target.x, this.lookY, this.target.z);

    this._updateOcclusion(dt);
  }

  _updateOrbit(dt) {
    this.orbitAngle += C.ORBIT_SPEED * dt;
    const baseAngle = -Math.PI / 2;
    const drift = baseAngle + Math.sin(this.orbitAngle * 0.2) * (3 * Math.PI / 180);
    const r = 68;
    this.cam.position.set(Math.cos(drift) * r, 28, Math.sin(drift) * r);
    this.cam.lookAt(0, 2, 0);
    // In menus nothing should be culled.
    for (const g of this.occludables) g.visible = true;
  }

  /**
   * Cull any registered stadium group sitting between the camera and the pitch.
   * Rays are cast from the camera to the look target and two flanking samples;
   * throttled to a few times per second — culling is binary so no need per-frame.
   */
  _updateOcclusion(dt) {
    this._occlusionT -= dt;
    if (this._occlusionT > 0 || this.occludables.length === 0) return;
    this._occlusionT = C.OCCLUSION_INTERVAL;

    const samples = [
      [this.target.x, 0.5, this.target.z],
      [clamp(this.target.x - 14, -HALF_L, HALF_L), 0.5, this.target.z],
      [clamp(this.target.x + 14, -HALF_L, HALF_L), 0.5, this.target.z],
      [this.target.x, 0.5, clamp(this.target.z + 12, -HALF_W, HALF_W)],
      [this.target.x, 0.5, clamp(this.target.z - 12, -HALF_W, HALF_W)],
    ];

    const blocked = new Set();
    for (const [sx, sy, sz] of samples) {
      this._rayDir.set(sx, sy, sz).sub(this.cam.position);
      const dist = this._rayDir.length();
      this._rayDir.normalize();
      this._ray.set(this.cam.position, this._rayDir);
      this._ray.far = dist;
      for (const group of this.occludables) {
        if (blocked.has(group)) continue;
        group.visible = true; // must be visible to raycast
        const hits = this._ray.intersectObject(group, true);
        if (hits.length > 0) blocked.add(group);
      }
    }
    for (const group of this.occludables) group.visible = !blocked.has(group);
  }
}
