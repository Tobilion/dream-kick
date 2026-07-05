/** draw.js — procedural canvas art: club badges, kit previews, player portraits. */

/** Draw a club badge onto a canvas (5 style variants). */
export function drawBadge(canvas, club, size = canvas.width) {
  const g = canvas.getContext('2d');
  const [c1, c2] = club.kits.home;
  const s = size, h = s / 2;
  g.clearRect(0, 0, s, s);
  g.save();

  const style = club.badgeStyle % 5;
  // badge silhouette
  g.beginPath();
  if (style === 0) { // shield
    g.moveTo(h, s * 0.97); g.bezierCurveTo(s * 0.08, s * 0.75, s * 0.06, s * 0.4, s * 0.1, s * 0.08);
    g.lineTo(s * 0.9, s * 0.08); g.bezierCurveTo(s * 0.94, s * 0.4, s * 0.92, s * 0.75, h, s * 0.97);
  } else if (style === 1) { // circle
    g.arc(h, h, s * 0.45, 0, Math.PI * 2);
  } else if (style === 2) { // diamond
    g.moveTo(h, s * 0.04); g.lineTo(s * 0.94, h); g.lineTo(h, s * 0.96); g.lineTo(s * 0.06, h);
  } else if (style === 3) { // hexagon
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = h + Math.cos(a) * s * 0.45, y = h + Math.sin(a) * s * 0.45;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  } else { // pointed crest
    g.moveTo(s * 0.1, s * 0.06); g.lineTo(s * 0.9, s * 0.06); g.lineTo(s * 0.9, s * 0.6);
    g.lineTo(h, s * 0.96); g.lineTo(s * 0.1, s * 0.6);
  }
  g.closePath();
  g.fillStyle = c1; g.fill();
  g.lineWidth = s * 0.035; g.strokeStyle = c2; g.stroke();
  g.clip();

  // inner pattern
  if (style % 2 === 0) {
    g.fillStyle = c2; g.globalAlpha = 0.85;
    for (let i = -1; i < 4; i++) g.fillRect(i * s * 0.28 + s * 0.05, 0, s * 0.09, s);
    g.globalAlpha = 1;
  } else {
    g.fillStyle = c2; g.globalAlpha = 0.85;
    g.fillRect(0, h - s * 0.09, s, s * 0.18);
    g.globalAlpha = 1;
  }

  // center roundel + initials
  g.beginPath(); g.arc(h, h, s * 0.23, 0, Math.PI * 2);
  g.fillStyle = luminance(c1) > 0.5 ? '#111522' : '#f2f5ff';
  g.fill();
  g.fillStyle = luminance(c1) > 0.5 ? '#f2f5ff' : '#111522';
  g.font = `900 ${s * 0.17}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(club.code, h, h + s * 0.01);
  g.restore();
}

/** Draw a kit (shirt) preview. */
export function drawKit(canvas, colors) {
  const g = canvas.getContext('2d');
  const [c1, c2] = colors;
  const w = canvas.width, hh = canvas.height;
  g.clearRect(0, 0, w, hh);
  const x = w / 2;
  // body
  g.beginPath();
  g.moveTo(x - w * 0.22, hh * 0.18);
  g.lineTo(x - w * 0.38, hh * 0.28); g.lineTo(x - w * 0.3, hh * 0.46); g.lineTo(x - w * 0.24, hh * 0.42);
  g.lineTo(x - w * 0.24, hh * 0.9); g.lineTo(x + w * 0.24, hh * 0.9); g.lineTo(x + w * 0.24, hh * 0.42);
  g.lineTo(x + w * 0.3, hh * 0.46); g.lineTo(x + w * 0.38, hh * 0.28); g.lineTo(x + w * 0.22, hh * 0.18);
  g.bezierCurveTo(x + w * 0.1, hh * 0.26, x - w * 0.1, hh * 0.26, x - w * 0.22, hh * 0.18);
  g.closePath();
  g.fillStyle = c1; g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
  // sleeve cuffs + collar in secondary
  g.fillStyle = c2;
  g.save(); g.clip();
  g.fillRect(x - w * 0.4, hh * 0.26, w * 0.13, hh * 0.2);
  g.fillRect(x + w * 0.27, hh * 0.26, w * 0.13, hh * 0.2);
  g.beginPath(); g.moveTo(x - w * 0.22, hh * 0.18);
  g.bezierCurveTo(x - w * 0.1, hh * 0.28, x + w * 0.1, hh * 0.28, x + w * 0.22, hh * 0.18);
  g.lineTo(x + w * 0.18, hh * 0.14);
  g.bezierCurveTo(x + w * 0.08, hh * 0.22, x - w * 0.08, hh * 0.22, x - w * 0.18, hh * 0.14);
  g.closePath(); g.fill();
  // center stripe accent
  g.globalAlpha = 0.55;
  g.fillRect(x - w * 0.03, hh * 0.2, w * 0.06, hh * 0.7);
  g.restore();
}

const SKIN_TONES = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
const HAIR_COLORS = ['#181410', '#2c1c0e', '#5a3b1a', '#171a1e', '#3a3a3a', '#82521d'];

/** Stylized head-and-shoulders portrait (no photos, no emojis). */
export function drawPortrait(canvas, player, kitColors) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  // backdrop
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1b2440'); grad.addColorStop(1, '#101527');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);

  const skin = SKIN_TONES[player.skin % SKIN_TONES.length];
  const hair = HAIR_COLORS[player.hair % HAIR_COLORS.length];
  const cx = w / 2;

  // shoulders / shirt
  g.fillStyle = kitColors[0];
  g.beginPath();
  g.moveTo(cx - w * 0.42, h); g.bezierCurveTo(cx - w * 0.4, h * 0.68, cx - w * 0.18, h * 0.6, cx, h * 0.6);
  g.bezierCurveTo(cx + w * 0.18, h * 0.6, cx + w * 0.4, h * 0.68, cx + w * 0.42, h);
  g.closePath(); g.fill();
  g.fillStyle = kitColors[1];
  g.fillRect(cx - w * 0.05, h * 0.62, w * 0.1, h * 0.38);

  // neck
  g.fillStyle = skin;
  g.fillRect(cx - w * 0.06, h * 0.5, w * 0.12, h * 0.15);
  // head
  g.beginPath(); g.ellipse(cx, h * 0.36, w * 0.15, h * 0.19, 0, 0, Math.PI * 2); g.fill();
  // ears
  g.beginPath(); g.arc(cx - w * 0.15, h * 0.37, w * 0.03, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + w * 0.15, h * 0.37, w * 0.03, 0, Math.PI * 2); g.fill();

  // hair variants by index
  g.fillStyle = hair;
  const hv = player.hair % 3;
  g.beginPath();
  if (hv === 0) { g.ellipse(cx, h * 0.25, w * 0.155, h * 0.11, 0, Math.PI, 0); }
  else if (hv === 1) { g.ellipse(cx, h * 0.23, w * 0.16, h * 0.13, 0, Math.PI * 0.95, Math.PI * 0.05); }
  else { g.ellipse(cx, h * 0.27, w * 0.15, h * 0.07, 0, Math.PI, 0); }
  g.fill();

  // eyes + brows + mouth (simple, stylized)
  g.fillStyle = '#10131c';
  g.beginPath(); g.arc(cx - w * 0.055, h * 0.36, w * 0.014, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + w * 0.055, h * 0.36, w * 0.014, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hair; g.lineWidth = Math.max(1.5, w * 0.014);
  g.beginPath(); g.moveTo(cx - w * 0.085, h * 0.325); g.lineTo(cx - w * 0.025, h * 0.32); g.stroke();
  g.beginPath(); g.moveTo(cx + w * 0.025, h * 0.32); g.lineTo(cx + w * 0.085, h * 0.325); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = Math.max(1.5, w * 0.012);
  g.beginPath(); g.moveTo(cx - w * 0.035, h * 0.45); g.quadraticCurveTo(cx, h * 0.47, cx + w * 0.035, h * 0.45); g.stroke();
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * gr + 0.114 * b) / 255;
}
