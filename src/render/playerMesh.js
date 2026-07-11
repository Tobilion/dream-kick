/** playerMesh.js — articulated low-poly humanoid with procedural animations. */
import * as THREE from '../../vendor/three.module.js';
import { PSTATE } from '../engine/player.js';
import { lerp, clamp } from '../core/math.js';

const SKIN_TONES = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
const HAIR_COLORS = ['#181410', '#2c1c0e', '#5a3b1a', '#171a1e', '#3a3a3a', '#82521d'];

let blobGeo = null, blobMat = null;

export class PlayerMesh {
  /**
   * @param {import('../engine/player.js').PlayerEntity} entity
   * @param {[string,string]} kit [primary, secondary]
   * @param {boolean} shadowsOn
   */
  constructor(entity, kit, shadowsOn) {
    this.e = entity;
    this.group = new THREE.Group();
    this.phase = Math.random() * Math.PI * 2;
    this.build(kit, shadowsOn);
  }

  build(kit, shadowsOn) {
    const skin = new THREE.MeshLambertMaterial({ color: SKIN_TONES[this.e.data.skin % SKIN_TONES.length] });
    const kitMat = new THREE.MeshLambertMaterial({ color: kit[0] });
    const kit2Mat = new THREE.MeshLambertMaterial({ color: kit[1] });
    const shortsMat = this.e.isGK ? new THREE.MeshLambertMaterial({ color: '#222831' }) : kit2Mat;
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
    const cast = m => { if (shadowsOn) m.castShadow = true; return m; };

    // hierarchy root at pelvis height
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.95;
    this.group.add(this.pelvis);

    // torso with number decal on back
    const torsoGeo = new THREE.BoxGeometry(0.34, 0.52, 0.46);
    const numTex = makeNumberTexture(this.e.data.num, kit[0], kit[1]);
    const torsoMats = [kitMat, kitMat, kitMat, kitMat, kitMat, new THREE.MeshLambertMaterial({ map: numTex })];
    // BoxGeometry face order: +x,-x,+y,-y,+z,-z → -z is the back (we face +x via rotation)
    this.torso = cast(new THREE.Mesh(torsoGeo, torsoMats));
    this.torso.position.y = 0.36;
    this.pelvis.add(this.torso);

    // hips block (shorts)
    this.hipsBlock = cast(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.42), shortsMat));
    this.hipsBlock.position.y = 0.02;
    this.pelvis.add(this.hipsBlock);

    // head + hair
    this.head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), skin));
    this.head.position.y = 0.75;
    this.pelvis.add(this.head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.1),
      new THREE.MeshLambertMaterial({ color: HAIR_COLORS[this.e.data.hair % HAIR_COLORS.length] }));
    hair.position.y = 0.77; hair.scale.set(1.02, 0.9, 1.02);
    this.pelvis.add(hair);

    // limbs
    const mkLimb = (mat1, mat2, upperLen, lowerLen, thick) => {
      const joint = new THREE.Group();
      const upper = cast(new THREE.Mesh(new THREE.BoxGeometry(thick, upperLen, thick), mat1));
      upper.position.y = -upperLen / 2;
      joint.add(upper);
      const kneeJ = new THREE.Group();
      kneeJ.position.y = -upperLen;
      joint.add(kneeJ);
      const lower = cast(new THREE.Mesh(new THREE.BoxGeometry(thick * 0.85, lowerLen, thick * 0.85), mat2));
      lower.position.y = -lowerLen / 2;
      kneeJ.add(lower);
      return { joint, kneeJ, lowerLen };
    };

    // arms (sleeve = kit, forearm = skin)
    this.armL = mkLimb(kitMat, skin, 0.24, 0.24, 0.1);
    this.armR = mkLimb(kitMat, skin, 0.24, 0.24, 0.1);
    this.armL.joint.position.set(0, 0.58, -0.29);
    this.armR.joint.position.set(0, 0.58, 0.29);
    this.pelvis.add(this.armL.joint, this.armR.joint);

    // legs (thigh = shorts color skin below)
    this.legL = mkLimb(skin, skin, 0.4, 0.4, 0.13);
    this.legR = mkLimb(skin, skin, 0.4, 0.4, 0.13);
    this.legL.joint.position.set(0, -0.06, -0.11);
    this.legR.joint.position.set(0, -0.06, 0.11);
    this.pelvis.add(this.legL.joint, this.legR.joint);

    // boots
    for (const leg of [this.legL, this.legR]) {
      const boot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.12), bootMat));
      boot.position.set(0.05, -leg.lowerLen - 0.02, 0);
      leg.kneeJ.add(boot);
    }

    // blob shadow (shared geometry)
    if (!blobGeo) {
      blobGeo = new THREE.CircleGeometry(0.42, 16);
      const bc = document.createElement('canvas'); bc.width = bc.height = 64;
      const bg = bc.getContext('2d');
      const grad = bg.createRadialGradient(32, 32, 4, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0,0,0,0.4)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      bg.fillStyle = grad; bg.fillRect(0, 0, 64, 64);
      blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthWrite: false });
    }
    this.blob = new THREE.Mesh(blobGeo, blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.015;
    this.group.add(this.blob);
  }

  /** advance animation & sync world transform */
  update(dt) {
    const e = this.e;
    this.group.position.set(e.pos.x, 0, e.pos.z);
    this.group.rotation.y = -e.facing;

    const speed = e.speed;
    const st = e.state;

    // reset pose targets
    let pelvisY = 0.95, pelvisRotX = 0, pelvisRotZ = 0;
    let laX = 0, raX = 0, llX = 0, rlX = 0, llK = 0, rlK = 0, lean = 0;

    if (st === PSTATE.NORMAL) {
      if (speed > 0.35) {
        const rate = clamp(speed * 1.5, 4, 14);
        this.phase += rate * dt;
        const s = Math.sin(this.phase), c = Math.cos(this.phase);
        const amp = clamp(speed / 8, 0.3, 1) * 0.85;
        llX = s * amp; rlX = -s * amp;
        llK = Math.max(0, -c) * amp * 1.2; rlK = Math.max(0, c) * amp * 1.2;
        laX = -s * amp * 0.8; raX = s * amp * 0.8;
        lean = clamp(speed / 11, 0, 1) * (e.sprinting ? 0.34 : 0.18);
        pelvisY = 0.95 + Math.abs(Math.sin(this.phase)) * 0.03;
      } else {
        // idle sway
        this.phase += dt * 1.6;
        laX = Math.sin(this.phase) * 0.05;
        raX = -Math.sin(this.phase) * 0.05;
        pelvisY = 0.95 + Math.sin(this.phase * 2) * 0.008;
      }
    } else if (st === PSTATE.KICKING) {
      const t = clamp(e.stateTimer / 0.38, 0, 1);
      const swing = t < 0.4 ? -t / 0.4 : (t - 0.4) / 0.6 * 2 - 1; // windup then follow through
      rlX = swing * 1.5; rlK = Math.max(0, -swing) * 0.8;
      laX = swing * 0.7; raX = -swing * 0.5;
      lean = 0.12;
    } else if (st === PSTATE.SLIDING) {
      pelvisY = 0.42; pelvisRotX = -1.15;
      llX = -0.25; rlX = 1.35; rlK = 0.1; llK = 1.1;
      laX = -1.4; raX = 0.6;
    } else if (st === PSTATE.RECOVER) {
      const t = clamp(e.stateTimer / 0.9, 0, 1);
      pelvisY = lerp(0.5, 0.95, t); pelvisRotX = lerp(-0.9, 0, t);
    } else if (st === PSTATE.FALLEN) {
      const t = clamp(e.stateTimer / 1.1, 0, 1);
      if (t < 0.65) { pelvisY = 0.3; pelvisRotX = -1.5; laX = -1.2; raX = -1.2; }
      else { const r = (t - 0.65) / 0.35; pelvisY = lerp(0.3, 0.95, r); pelvisRotX = lerp(-1.5, 0, r); }
    } else if (st === PSTATE.DIVING) {
      const t = clamp(e.stateTimer / 0.8, 0, 1);
      pelvisY = lerp(0.95, 0.35, Math.min(1, t * 2));
      pelvisRotZ = (e.diveDir.z >= 0 ? -1 : 1) * lerp(0, 1.35, Math.min(1, t * 1.8));
      laX = -2.6; raX = -2.6;
    } else if (st === PSTATE.CELEBRATE) {
      this.phase += dt * 9;
      laX = -2.9; raX = -2.9;
      pelvisY = 0.95 + Math.abs(Math.sin(this.phase)) * 0.22;
    }

    // apply with smoothing
    const k = 1 - Math.exp(-18 * dt);
    this.pelvis.position.y += (pelvisY - this.pelvis.position.y) * k;
    this.pelvis.rotation.z += (pelvisRotX - this.pelvis.rotation.z) * k;      // forward pitch (local z after yaw)
    this.pelvis.rotation.x += (pelvisRotZ - this.pelvis.rotation.x) * k;      // sideways (dive)
    this.torso.rotation.z = lerp(this.torso.rotation.z, lean, k);
    this.armL.joint.rotation.z += (laX - this.armL.joint.rotation.z) * k;
    this.armR.joint.rotation.z += (raX - this.armR.joint.rotation.z) * k;
    this.legL.joint.rotation.z += (llX - this.legL.joint.rotation.z) * k;
    this.legR.joint.rotation.z += (rlX - this.legR.joint.rotation.z) * k;
    this.legL.kneeJ.rotation.z += (llK - this.legL.kneeJ.rotation.z) * k;
    this.legR.kneeJ.rotation.z += (rlK - this.legR.kneeJ.rotation.z) * k;
  }

  updateAppearance(kit) {
    const skinColor = SKIN_TONES[this.e.data.skin % SKIN_TONES.length];
    this.head.material.color.set(skinColor);
    
    // Re-bind shirt number decal
    const numTex = makeNumberTexture(this.e.data.num, kit[0], kit[1]);
    this.torso.material[5].map = numTex;
    this.torso.material[5].needsUpdate = true;
  }
}

/** shirt-back number as a canvas texture */
function makeNumberTexture(num, kitPrimary, kitSecondary) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = kitPrimary; g.fillRect(0, 0, 128, 128);
  g.fillStyle = kitSecondary;
  g.font = '900 74px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
