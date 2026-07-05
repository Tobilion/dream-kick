/** camera.js — broadcast follow camera with context zoom, shake, orbit modes. */
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../core/config.js';
import { clamp, damp } from '../core/math.js';

const C = CONFIG.CAMERA, P = CONFIG.PITCH;

export class BroadcastCam {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(C.FOV, aspect, 0.5, 600);
    this.target = new THREE.Vector3();
    this.shakeMag = 0;
    this.mode = 'follow'; // 'follow' | 'orbit'
    this.orbitAngle = 0;
    this.cam.position.set(0, C.HEIGHT, C.DISTANCE);
    this.cam.lookAt(0, 0, 0);
  }

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); }

  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }

  /**
   * @param {{x:number,y:number,z:number}} ballPos
   * @param {{x:number,z:number}} ballVel
   */
  update(dt, ballPos, ballVel) {
    if (this.mode === 'orbit') {
      this.orbitAngle += C.ORBIT_SPEED * dt;
      const r = 68;
      this.cam.position.set(Math.cos(this.orbitAngle) * r, 34, Math.sin(this.orbitAngle) * r);
      this.cam.lookAt(0, 2, 0);
      return;
    }

    // follow target with lookahead
    const la = C.LOOKAHEAD;
    const tx = clamp(ballPos.x + (ballVel?.x || 0) * 0.32 * la / 6, -P.LENGTH / 2, P.LENGTH / 2);
    const tz = clamp(ballPos.z * 0.55, -P.WIDTH / 2 * 0.5, P.WIDTH / 2 * 0.5);

    const k = damp(C.LERP, dt);
    this.target.x += (tx - this.target.x) * k;
    this.target.z += (tz - this.target.z) * k;

    // context zoom: pull back when airborne, push in near goals
    const nearGoal = clamp((Math.abs(ballPos.x) - P.LENGTH / 2 + 24) / 24, 0, 1);
    const air = clamp(ballPos.y / 7, 0, 1);
    const dist = C.DISTANCE + air * C.AIR_ZOOM - nearGoal * C.GOAL_ZOOM;
    const height = C.HEIGHT + air * 4 - nearGoal * 8;

    let px = this.target.x, py = height, pz = this.target.z + dist;

    // shake
    if (this.shakeMag > 0.001) {
      px += (Math.random() * 2 - 1) * this.shakeMag;
      py += (Math.random() * 2 - 1) * this.shakeMag * 0.6;
      this.shakeMag *= Math.max(0, 1 - C.SHAKE_DECAY * dt);
    }

    this.cam.position.x += (px - this.cam.position.x) * k;
    this.cam.position.y += (py - this.cam.position.y) * k;
    this.cam.position.z += (pz - this.cam.position.z) * k;
    this.cam.lookAt(this.target.x, 1.2, this.target.z);
  }
}
