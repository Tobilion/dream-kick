/** effects.js — goal confetti particles + helper triggers. */
import * as THREE from '../../vendor/three.module.js';

const COUNT = 420;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(COUNT * 3);
    this.velocities = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const palette = [[1, 0.83, 0.26], [0, 0.83, 0.64], [0.24, 0.42, 1], [1, 0.3, 0.43], [1, 1, 1]];
    for (let i = 0; i < COUNT; i++) {
      const c = palette[i % palette.length];
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      this.positions[i * 3 + 1] = -50; // hidden below ground
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.points.visible = false;
    scene.add(this.points);
    this.life = 0;
  }

  /** burst confetti above a goal mouth */
  goalBurst(x, z) {
    this.life = 3.2;
    this.points.visible = true;
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = x + (Math.random() * 2 - 1) * 8;
      this.positions[i * 3 + 1] = 6 + Math.random() * 10;
      this.positions[i * 3 + 2] = z + (Math.random() * 2 - 1) * 14;
      this.velocities[i * 3] = (Math.random() * 2 - 1) * 3;
      this.velocities[i * 3 + 1] = -(1 + Math.random() * 2.2);
      this.velocities[i * 3 + 2] = (Math.random() * 2 - 1) * 3;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    if (this.life <= 0) { this.points.visible = false; return; }
    this.life -= dt;
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      // flutter
      this.velocities[i * 3] += Math.sin((this.life * 7 + i) * 1.3) * dt * 1.4;
      if (this.positions[i * 3 + 1] < 0.05) this.positions[i * 3 + 1] = 0.05;
    }
    this.points.material.opacity = Math.min(1, this.life);
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
