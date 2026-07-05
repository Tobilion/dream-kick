/** scene.js — renderer, lights, resize, quality autodetect. */
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../core/config.js';

const R = CONFIG.RENDER;

export class SceneMgr {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0x0d1226, 160, 340);

    // lighting
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1c3a24, 1.05);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    this.sun.position.set(-40, 80, 30);
    this.scene.add(this.sun);

    this.isTouch = matchMedia('(pointer:coarse)').matches;
    this.shadowsOn = R.SHADOWS_DESKTOP && !this.isTouch;
    if (this.shadowsOn) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const s = 70;
      Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 220 });
      this.sun.shadow.bias = -0.0008;
    }

    // quality probe
    this.probe = { t: 0, frames: 0, done: false };

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.onResize?.(this.aspect);
  }

  /** call each frame; degrades quality if fps is poor during the probe window */
  probeQuality(dt) {
    if (this.probe.done) return;
    this.probe.t += dt; this.probe.frames++;
    if (this.probe.t >= R.QUALITY_PROBE_SECONDS) {
      const fps = this.probe.frames / this.probe.t;
      if (fps < R.QUALITY_MIN_FPS) {
        this.renderer.shadowMap.enabled = false;
        this.sun.castShadow = false;
        this.renderer.setPixelRatio(1);
        this.lowQuality = true;
      }
      this.probe.done = true;
    }
  }

  render(camera) { this.renderer.render(this.scene, camera); }
}

/** Vertical gradient night-sky background texture. */
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#070a18');
  grad.addColorStop(0.55, '#101833');
  grad.addColorStop(1, '#1b2a4a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
