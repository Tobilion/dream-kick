/** ballMesh.js — panel-textured ball with roll rotation and blob shadow. */
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../core/config.js';

export class BallMesh {
  /** @param {import('../engine/ball.js').Ball} ball */
  constructor(ball, shadowsOn) {
    this.ball = ball;
    this.group = new THREE.Group();

    const tex = makeBallTexture();
    const geo = new THREE.IcosahedronGeometry(CONFIG.BALL.RADIUS, 1);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.mesh = new THREE.Mesh(geo, mat);
    if (shadowsOn) this.mesh.castShadow = true;
    this.group.add(this.mesh);

    // blob shadow
    const bc = document.createElement('canvas'); bc.width = bc.height = 64;
    const bg = bc.getContext('2d');
    const grad = bg.createRadialGradient(32, 32, 3, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = grad; bg.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 12),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.axis = new THREE.Vector3();
  }

  addTo(scene) { scene.add(this.group, this.blob); }

  update(dt) {
    const b = this.ball;
    this.group.position.set(b.pos.x, b.pos.y, b.pos.z);
    // blob shadow shrinks/fades with height
    this.blob.position.set(b.pos.x, 0.02, b.pos.z);
    const h = Math.min(1, b.pos.y / 6);
    this.blob.scale.setScalar(1 - h * 0.5);
    this.blob.material.opacity = 1 - h * 0.6;

    // roll: rotate around axis perpendicular to velocity
    const sp = b.speed;
    if (sp > 0.1) {
      this.axis.set(b.vel.z, 0, -b.vel.x).normalize();
      this.mesh.rotateOnWorldAxis(this.axis, (sp / CONFIG.BALL.RADIUS) * dt);
    }
  }
}

function makeBallTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 256, 128);
  // pentagon-ish dark patches
  g.fillStyle = '#15151a';
  for (let i = 0; i < 14; i++) {
    const x = (i % 7) * 38 + (i > 6 ? 19 : 0), y = i > 6 ? 86 : 24;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * 11, py = y + Math.sin(a) * 11;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
