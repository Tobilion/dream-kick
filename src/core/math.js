/** math.js — small vector/scalar helpers used across engine & render. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent damping factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const len2 = (x, z) => Math.hypot(x, z);
export const dist2 = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

export function norm2(x, z) {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
}

export const dot2 = (ax, az, bx, bz) => ax * bx + az * bz;

/** Shortest-path angle interpolation. */
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Distance from point P to segment AB (2D, xz plane). */
export function pointSegDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  if (l2 < 1e-9) return dist2(px, pz, ax, az);
  let t = ((px - ax) * abx + (pz - az) * abz) / l2;
  t = clamp(t, 0, 1);
  return dist2(px, pz, ax + abx * t, az + abz * t);
}

/** Deterministic seeded RNG (mulberry32). */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const irand = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/** Format seconds of a scaled match clock as MM:SS. */
export function formatClock(matchSeconds) {
  const m = Math.floor(matchSeconds / 60);
  const s = Math.floor(matchSeconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
