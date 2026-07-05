/** stadium.js — pitch, goals+nets, stands with animated crowd, floodlights, ad boards. */
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../core/config.js';

const P = CONFIG.PITCH;
const HALF_L = P.LENGTH / 2, HALF_W = P.WIDTH / 2;

export class Stadium {
  constructor(scene, shadowsOn) {
    this.group = new THREE.Group();
    this.buildPitch(shadowsOn);
    this.buildGoals();
    this.buildAdBoards();
    this.buildStands();
    this.buildFloodlights();
    scene.add(this.group);
    this.crowdT = 0; this.crowdFrame = 0;
    this.netPulse = [0, 0];
  }

  /* ---------------- pitch ---------------- */
  buildPitch(shadowsOn) {
    const texW = 2048, texH = Math.round(texW * (P.WIDTH + P.MARGIN * 2) / (P.LENGTH + P.MARGIN * 2));
    const c = document.createElement('canvas');
    c.width = texW; c.height = texH;
    const g = c.getContext('2d');
    const sx = texW / (P.LENGTH + P.MARGIN * 2);
    const X = m => (m + HALF_L + P.MARGIN) * sx;
    const Z = m => (m + HALF_W + P.MARGIN) * (texH / (P.WIDTH + P.MARGIN * 2));

    // mow stripes
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#1c7a35' : '#22903f';
      g.fillRect((texW / stripes) * i, 0, texW / stripes + 1, texH);
    }
    // subtle noise
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * texW, Math.random() * texH, 2, 2);
    }

    // markings
    g.strokeStyle = '#f4f8f4'; g.lineWidth = Math.max(3, sx * 0.14); g.lineCap = 'round';
    const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
    // boundary
    g.strokeRect(X(-HALF_L), Z(-HALF_W), X(HALF_L) - X(-HALF_L), Z(HALF_W) - Z(-HALF_W));
    line(0, -HALF_W, 0, HALF_W); // halfway
    // center circle + spot
    g.beginPath(); g.arc(X(0), Z(0), P.CENTER_CIRCLE * sx, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), sx * 0.3, 0, Math.PI * 2); g.fillStyle = '#f4f8f4'; g.fill();

    for (const side of [-1, 1]) {
      const gx = HALF_L * side;
      const bx = gx - P.BOX_LENGTH * side;
      const sbx = gx - P.SMALL_BOX_LENGTH * side;
      // penalty box
      line(gx, -P.BOX_WIDTH / 2, bx, -P.BOX_WIDTH / 2);
      line(bx, -P.BOX_WIDTH / 2, bx, P.BOX_WIDTH / 2);
      line(bx, P.BOX_WIDTH / 2, gx, P.BOX_WIDTH / 2);
      // six-yard box
      line(gx, -P.SMALL_BOX_WIDTH / 2, sbx, -P.SMALL_BOX_WIDTH / 2);
      line(sbx, -P.SMALL_BOX_WIDTH / 2, sbx, P.SMALL_BOX_WIDTH / 2);
      line(sbx, P.SMALL_BOX_WIDTH / 2, gx, P.SMALL_BOX_WIDTH / 2);
      // penalty spot + arc
      const px = gx - P.PENALTY_SPOT * side;
      g.beginPath(); g.arc(X(px), Z(0), sx * 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath();
      const a = Math.acos((P.BOX_LENGTH - P.PENALTY_SPOT) / P.CENTER_CIRCLE);
      if (side > 0) g.arc(X(px), Z(0), P.CENTER_CIRCLE * sx, Math.PI - a, Math.PI + a);
      else g.arc(X(px), Z(0), P.CENTER_CIRCLE * sx, -a, a);
      g.stroke();
      // corner arcs
      for (const zc of [-1, 1]) {
        g.beginPath();
        g.arc(X(gx), Z(HALF_W * zc), P.CORNER_ARC * sx,
          side > 0 ? (zc > 0 ? Math.PI : Math.PI / 2) : (zc > 0 ? -Math.PI / 2 + Math.PI : 0),
          side > 0 ? (zc > 0 ? Math.PI * 1.5 : Math.PI) : (zc > 0 ? Math.PI * 2 : Math.PI / 2));
        g.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(P.LENGTH + P.MARGIN * 2, P.WIDTH + P.MARGIN * 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = shadowsOn;
    this.group.add(mesh);

    // outer apron
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(P.LENGTH + 90, P.WIDTH + 90),
      new THREE.MeshLambertMaterial({ color: 0x11361c }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02;
    this.group.add(apron);
  }

  /* ---------------- goals & nets ---------------- */
  buildGoals() {
    this.nets = [];
    const postMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (const side of [-1, 1]) {
      const gx = HALF_L * side;
      const goal = new THREE.Group();
      const r = 0.07;
      const post = () => new THREE.Mesh(new THREE.CylinderGeometry(r, r, P.GOAL_HEIGHT, 8), postMat);
      const p1 = post(); p1.position.set(gx, P.GOAL_HEIGHT / 2, -P.GOAL_WIDTH / 2);
      const p2 = post(); p2.position.set(gx, P.GOAL_HEIGHT / 2, P.GOAL_WIDTH / 2);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, P.GOAL_WIDTH, 8), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(gx, P.GOAL_HEIGHT, 0);
      goal.add(p1, p2, bar);

      // net: grid of line segments (back + top + sides)
      const netMat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.45 });
      const pts = [];
      const bx = gx + P.GOAL_DEPTH * side;
      const step = 0.45;
      for (let z = -P.GOAL_WIDTH / 2; z <= P.GOAL_WIDTH / 2 + 0.01; z += step) {
        pts.push(bx, 0, z, bx, P.GOAL_HEIGHT * 0.9, z);              // back verticals
        pts.push(gx, P.GOAL_HEIGHT, z, bx, P.GOAL_HEIGHT * 0.9, z);  // top slope
      }
      for (let y = 0; y <= P.GOAL_HEIGHT * 0.9 + 0.01; y += step) {
        pts.push(bx, y, -P.GOAL_WIDTH / 2, bx, y, P.GOAL_WIDTH / 2); // back horizontals
      }
      for (const zc of [-1, 1]) {
        const z = zc * P.GOAL_WIDTH / 2;
        for (let y = 0; y <= P.GOAL_HEIGHT * 0.9; y += step) pts.push(gx, y, z, bx, y, z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const net = new THREE.LineSegments(geo, netMat);
      goal.add(net);
      this.nets.push(net);
      this.group.add(goal);
    }
  }

  /** trigger a ripple on the net at end +1/-1 */
  rippleNet(side) { this.netPulse[side > 0 ? 1 : 0] = 1; }

  /* ---------------- ad boards ---------------- */
  buildAdBoards() {
    const brands = ['DREAM KICK', 'VOLT COLA', 'AEROFLY', 'NOVA BANK', 'PITCHPRO', 'ORBIT TEL'];
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 64;
    const g = c.getContext('2d');
    const seg = c.width / brands.length;
    brands.forEach((b, i) => {
      g.fillStyle = i % 2 ? '#101828' : '#00d4a3';
      g.fillRect(i * seg, 0, seg, 64);
      g.fillStyle = i % 2 ? '#00d4a3' : '#07131f';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b, i * seg + seg / 2, 34);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshLambertMaterial({ map: tex });

    const mk = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, 0.15), mat);
      m.position.set(x, 0.5, z); m.rotation.y = ry;
      this.group.add(m);
    };
    mk(P.LENGTH + 6, 0, HALF_W + P.MARGIN - 1, 0);
    mk(P.LENGTH + 6, 0, -(HALF_W + P.MARGIN - 1), Math.PI);
    mk(P.WIDTH + 6, HALF_L + P.MARGIN - 1, 0, -Math.PI / 2);
    mk(P.WIDTH + 6, -(HALF_L + P.MARGIN - 1), 0, Math.PI / 2);
  }

  /* ---------------- stands & crowd ---------------- */
  buildStands() {
    this.crowdTextures = [];
    for (let f = 0; f < CONFIG.RENDER.CROWD_FRAMES; f++) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#0c0f1c'; g.fillRect(0, 0, 512, 128);
      const cols = ['#c9d1e8', '#8891b3', '#d3435c', '#3b6fd4', '#e0c34a', '#57b98a', '#b06fd4', '#e28743'];
      for (let i = 0; i < 5200; i++) {
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        const x = Math.random() * 512, y = Math.random() * 128;
        g.fillRect(x, y + (f === 1 ? Math.random() : 0), 2.4, 2.4);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      this.crowdTextures.push(tex);
    }
    this.crowdMat = new THREE.MeshLambertMaterial({ map: this.crowdTextures[0] });
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0x1a2136 });

    const stand = (len, x, z, ry, repeat) => {
      const grp = new THREE.Group();
      // sloped seating face
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 20), this.crowdMat.clone());
      face.material.map = this.crowdMat.map;
      face.material.map.repeat.set(repeat, 1);
      face.rotation.x = -Math.PI / 5.2;
      face.position.set(0, 9.4, 7.2);
      grp.add(face);
      this.crowdFaces = this.crowdFaces || [];
      this.crowdFaces.push(face);
      // base wall + roof
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 1), concreteMat);
      wall.position.set(0, 1.6, -0.5); grp.add(wall);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 9), new THREE.MeshLambertMaterial({ color: 0x232c4a }));
      roof.position.set(0, 17.4, 11.5); grp.add(roof);
      grp.position.set(x, 0, z); grp.rotation.y = ry;
      this.group.add(grp);
    };

    const dNS = HALF_W + P.MARGIN + 4, dEW = HALF_L + P.MARGIN + 4;
    stand(P.LENGTH + 26, 0, dNS, Math.PI, 6);
    stand(P.LENGTH + 26, 0, -dNS, 0, 6);
    stand(P.WIDTH + 20, dEW, 0, Math.PI / 2, 4);
    stand(P.WIDTH + 20, -dEW, 0, -Math.PI / 2, 4);
  }

  buildFloodlights() {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x39415f });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff7d6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 34, 8), poleMat);
      pole.position.y = 17; grp.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1), poleMat);
      head.position.set(0, 34, 0);
      head.lookAt(0, 8, 0);
      grp.add(head);
      for (let i = 0; i < 8; i++) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 6), lampMat);
        lamp.position.set((i % 4 - 1.5) * 1.4, 33.3 + Math.floor(i / 4) * 1.3, 0.6);
        grp.add(lamp);
      }
      grp.position.set(sx * (HALF_L + 16), 0, sz * (HALF_W + 16));
      grp.lookAt(0, 0, 0); grp.rotation.x = 0; grp.rotation.z = 0;
      this.group.add(grp);
    }
  }

  update(dt) {
    // crowd shimmer
    this.crowdT += dt;
    if (this.crowdT > 1 / CONFIG.RENDER.CROWD_FPS) {
      this.crowdT = 0;
      this.crowdFrame = (this.crowdFrame + 1) % this.crowdTextures.length;
      for (const f of this.crowdFaces) {
        f.material.map = this.crowdTextures[this.crowdFrame];
        f.material.map.repeat.set(f.material.map.repeat.x || 6, 1);
        f.material.needsUpdate = true;
      }
    }
    // net ripple pulses
    for (let i = 0; i < 2; i++) {
      if (this.netPulse[i] > 0) {
        this.netPulse[i] = Math.max(0, this.netPulse[i] - dt * 1.6);
        const net = this.nets[i];
        const s = 1 + Math.sin(this.netPulse[i] * Math.PI * 3) * 0.05 * this.netPulse[i];
        net.scale.set(1, s, s);
      }
    }
  }
}
