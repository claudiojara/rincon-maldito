'use strict';
/* Apocalipsis · La quinta trompeta — historieta animada en pixel art.
   Todo se dibuja a mano, pixel por pixel, sobre un framebuffer de 160×100. */

const W = 160, H = 100;

// ---------- Paleta ----------
const toU32 = h => { const n = parseInt(h.slice(1), 16); return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const C = {};
Object.entries({
  paper: '#efe6cf', paper2: '#d6cbb0', white: '#fffaf0',
  ink: '#161311', ink2: '#3a332c', grey: '#8a8174',
  sky1: '#d7e0dc', sky2: '#9fb3b4', dusk: '#6a4d48', night: '#1d1a22',
  smoke: '#221e1c', smoke2: '#4a413b',
  red: '#d0302a', blood: '#6e1a16', gold: '#ecb52e', gold2: '#a8701a',
  fire: '#f07a2a', fire2: '#ffd35a', green: '#7d9a45', green2: '#3f5527',
  skin: '#d9a878', skin2: '#b07e55', hair: '#5a2f17', lip: '#9c4436', ivory: '#f4ecd6'
}).forEach(([k, v]) => { C[k] = toU32(v); });

// ---------- Utilidades ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const hs = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------- Framebuffer ----------
class FB {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.d = new Uint32Array(this.img.data.buffer);
    this.ox = 0; this.oy = 0;
  }
  fill(c) { this.d.fill(c); }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x]; }
  px(x, y, c) {
    x = Math.floor(x + this.ox); y = Math.floor(y + this.oy);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  hline(x0, x1, y, c, lv = 1) {
    y = Math.floor(y + this.oy);
    if (y < 0 || y >= this.h) return;
    const a = Math.max(0, Math.floor(Math.min(x0, x1) + this.ox));
    const b = Math.min(this.w - 1, Math.floor(Math.max(x0, x1) + this.ox));
    const r = y * this.w, L = lv * 16;
    for (let x = a; x <= b; x++) if (lv >= 1 || BAYER[(y & 3) * 4 + (x & 3)] < L) this.d[r + x] = c;
  }
  rect(x, y, w, h, c) {
    x = Math.floor(x); y = Math.floor(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0) return;
    for (let j = 0; j < h; j++) this.hline(x, x + w - 1, y + j, c);
  }
  circ(cx, cy, r, c, lv = 1) {
    if (r < 0) return;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      const q = r * r - dy * dy; if (q < 0) continue;
      const dx = Math.floor(Math.sqrt(q) + 0.35);
      this.hline(cx - dx, cx + dx, cy + dy, c, lv);
    }
  }
  ell(cx, cy, rx, ry, c, lv = 1) {
    if (ry < 0.5) { this.hline(cx - rx, cx + rx, cy, c, lv); return; }
    const R = Math.ceil(ry);
    for (let dy = -R; dy <= R; dy++) {
      const q = 1 - (dy * dy) / (ry * ry); if (q < 0) continue;
      const dx = Math.floor(rx * Math.sqrt(q) + 0.35);
      this.hline(cx - dx, cx + dx, cy + dy, c, lv);
    }
  }
  ring(cx, cy, r, c, a0 = 0, a1 = Math.PI * 2) {
    const n = Math.max(8, Math.ceil(r * 8));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      this.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c);
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let i = 0; i < 1000; i++) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  thick(x0, y0, x1, y1, w, c) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) this.circ(lerp(x0, x1, i / n), lerp(y0, y1, i / n), w / 2, c);
  }
  poly(pts, c, lv = 1) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) this.hline(Math.round(xs[k]), Math.round(xs[k + 1]), y, c, lv);
    }
  }
  dither(x, y, w, h, c, lv) {
    if (lv <= 0) return;
    const L = lv * 16;
    const X0 = Math.max(0, Math.floor(x)), Y0 = Math.max(0, Math.floor(y));
    const X1 = Math.min(this.w, Math.floor(x + w)), Y1 = Math.min(this.h, Math.floor(y + h));
    for (let j = Y0; j < Y1; j++) for (let i = X0; i < X1; i++) if (BAYER[(j & 3) * 4 + (i & 3)] < L) this.d[j * this.w + i] = c;
  }
  // Mezcla la región con un color (oscurecer/teñir), cuantizado en pasos para mantener el aire retro.
  tint(x, y, w, h, c, amt) {
    amt = Math.round(clamp(amt) * 6) / 6;
    if (amt <= 0) return;
    const cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
    const X0 = Math.max(0, Math.floor(x)), Y0 = Math.max(0, Math.floor(y));
    const X1 = Math.min(this.w, Math.floor(x + w)), Y1 = Math.min(this.h, Math.floor(y + h));
    for (let j = Y0; j < Y1; j++) for (let i = X0; i < X1; i++) {
      const k = j * this.w + i, v = this.d[k];
      const r = (v & 255) + (cr - (v & 255)) * amt, g = ((v >> 8) & 255) + (cg - ((v >> 8) & 255)) * amt, b = ((v >> 16) & 255) + (cb - ((v >> 16) & 255)) * amt;
      this.d[k] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }
  blit(spr, x, y, map, s = 1, flip = false) {
    const h = spr.length, w = spr[0].length;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = map[spr[j][flip ? w - 1 - i : i]];
      if (c !== undefined) this.rect(x + i * s, y + j * s, s, s, c);
    }
  }
  text(str, x, y, c, s = 1) {
    for (const ch of str) {
      const g = FONT[ch];
      if (g) this.blit(g, x, y, { '#': c }, s);
      x += 4 * s;
    }
  }
}
const textW = (str, s = 1) => str.length * 4 * s - s;

// ---------- Fuente 3×5 ----------
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'], M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['###', '#.#', '#.#', '#.#', '###'],
  S: ['###', '#..', '###', '..#', '###'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.']
};

// ---------- Sprites ----------
const KEY = [
  '.ggg.........',
  'gw.gggggggggd',
  'g..gdddddgdgd',
  '.ggd.....d.d.'
];
const KMAP = { g: C.gold, w: C.fire2, d: C.gold2 };


// ---------- Piezas de escenografía ----------
function gradV(fb, y0, y1, a, b) {
  fb.rect(0, y0, fb.w, y1 - y0, a);
  for (let y = y0; y < y1; y++) fb.dither(0, y, fb.w, 1, b, (y - y0) / (y1 - y0));
}

function gradV2(fb, x, y, w, h) {
  fb.rect(x, y, w, h, C.sky2);
  for (let j = 0; j < h; j++) fb.dither(x, y + j, w, 1, C.dusk, j / h * 0.8);
}

function mountains(fb, baseY, peaks, fill, line) {
  for (const [x, h, w] of peaks) {
    fb.poly([[x - w, baseY], [x, baseY - h], [x + w, baseY]], fill);
    fb.line(x - w, baseY, x, baseY - h, line);
    fb.line(x, baseY - h, x + w, baseY, line);
    for (let k = 1; k <= 3; k++) {
      const xk = x + k * w / 4;
      fb.line(xk, baseY - h * (1 - k / 4) + 1, xk - 2, baseY - 1, line);
    }
  }
}

function pine(fb, x, baseY, h, c) {
  for (let i = 0; i < h; i++) {
    const hw = Math.floor(i * 0.33 + (i % 4 === 3 ? 1 : 0));
    fb.hline(x - hw, x + hw, baseY - h + i, c);
  }
  fb.rect(x, baseY, 1, 2, c);
}

function forest(fb, x0, x1, y0, y1, n, seed, c) {
  const trees = [];
  for (let i = 0; i < n; i++) trees.push({ x: lerp(x0, x1, i / Math.max(1, n - 1)) + Math.round((hs(seed + i) - 0.5) * 4), y: Math.round(lerp(y0, y1, hs(seed + i * 2.3))), h: 9 + Math.round(hs(seed + i * 3.7) * 10) });
  trees.sort((a, b) => a.y - b.y).forEach(t => pine(fb, t.x, t.y, t.h, c));
}

function bareTree(fb, x, base, h, c, seed) {
  fb.thick(x, base, x, base - h, 2, c);
  const branch = (bx, by, ang, len, d) => {
    if (d === 0 || len < 2) return;
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    fb.line(bx, by, ex, ey, c);
    branch(ex, ey, ang - 0.5 - hs(seed + d) * 0.3, len * 0.65, d - 1);
    branch(ex, ey, ang + 0.5 + hs(seed + d * 2) * 0.3, len * 0.6, d - 1);
  };
  for (let k = 0; k < 3; k++) {
    const by = base - h * (0.45 + k * 0.2);
    branch(x, by, -Math.PI / 2 + (k % 2 ? 0.7 : -0.7), h * 0.35, 3);
  }
}

function tufts(fb, y0, y1, n, seed, c) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hs(seed + i) * W), y = Math.floor(y0 + hs(seed + i * 3.1) * (y1 - y0));
    fb.px(x, y, c); fb.px(x - 1, y - 1, c); fb.px(x + 1, y - 1, c);
  }
}

function sunFace(fb, cx, cy, r, o = {}) {
  if (o.rays) {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + (o.t || 0) * 0.4;
      fb.line(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3), cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), C.gold2);
    }
  }
  fb.circ(cx, cy, r + 1, C.ink);
  fb.circ(cx, cy, r, C.white);
  const e = Math.max(2, Math.round(r * 0.4));
  if (o.fear) {
    fb.rect(cx - e - 1, cy - 3, 2, 3, C.ink); fb.rect(cx + e, cy - 3, 2, 3, C.ink);
    fb.rect(cx - 1, cy + 2, 3, 3, C.ink); fb.px(cx, cy + 3, C.blood);
  } else if (o.sad) {
    fb.rect(cx - e, cy - 2, 1, 2, C.ink); fb.rect(cx + e, cy - 2, 1, 2, C.ink);
    fb.px(cx - e - 1, cy - 4, C.ink); fb.px(cx - e, cy - 3 - 1, C.ink);
    fb.px(cx + e + 1, cy - 4, C.ink); fb.px(cx + e, cy - 4, C.ink);
    fb.hline(cx - 1, cx + 1, cy + 3, C.ink); fb.px(cx - 2, cy + 4, C.ink); fb.px(cx + 2, cy + 4, C.ink);
    if (Math.floor((o.t || 0) * 2) % 2) fb.px(cx + e, cy + 1, C.sky2);
  } else {
    fb.rect(cx - e, cy - 2, 1, 2, C.ink); fb.rect(cx + e, cy - 2, 1, 2, C.ink);
    fb.hline(cx - 1, cx + 1, cy + 3, C.ink);
  }
}

function drawSmoke(fb, blobs) {
  for (const b of blobs) fb.circ(b.x, b.y, b.r + 1, C.ink);
  for (const b of blobs) fb.circ(b.x, b.y, b.r, C.smoke);
  for (const b of blobs) if (b.r > 3) fb.circ(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.35, C.smoke2, 0.5);
}

function man(fb, x, y, t, o = {}) {
  const c = o.c ?? C.ink, k = o.s || 1;
  const ph = o.run ? (Math.floor(t * 8 + (o.ph || 0)) & 1) : 0;
  const b = ph * k;
  const L = (x0, y0, x1, y1) => k > 1 ? fb.thick(x + x0 * k, y + y0 * k - b, x + x1 * k, y + y1 * k - b, k, c) : fb.line(x + x0, y + y0 - b, x + x1, y + y1 - b, c);
  fb.rect(x - k, y - 10 * k - b, 3 * k, 3 * k, c);
  fb.rect(x, y - 7 * k - b, k, 4 * k, c);
  if (o.armsUp) {
    const w = Math.floor(t * 6 + (o.ph || 0)) & 1;
    L(0, -6, -2, -10 - w); L(0, -6, 2, -11 + w);
  } else { L(0, -6, -2, -3); L(0, -6, 2, -3); }
  if (o.run && ph) { L(0, -3, -2, 0); L(0, -3, 1, 0); }
  else if (o.run) { L(0, -3, -1, 0); L(0, -3, 2, 0); }
  else { L(0, -3, -1, 0); L(0, -3, 1, 0); }
  if (o.seal) fb.rect(x, y - 9 * k - b, k, k, C.gold);
}

function trumpet(fb, x, y, s) {
  fb.rect(x - 2 * s, y - s, 2 * s, 3 * s, C.gold2);
  fb.rect(x, y, 18 * s, s, C.gold);
  fb.rect(x + 4 * s, y + 2 * s, 9 * s, s, C.gold);
  fb.rect(x + 4 * s, y + s, s, s, C.gold); fb.rect(x + 12 * s, y + s, s, s, C.gold);
  for (const v of [6, 8, 10]) fb.rect(x + v * s, y - 2 * s, s, 2 * s, C.gold2);
  fb.poly([[x + 18 * s, y], [x + 26 * s, y - 5 * s], [x + 26 * s, y + 6 * s], [x + 18 * s, y + s]], C.gold);
  fb.rect(x + 26 * s, y - 5 * s, s, 11 * s, C.gold2);
  fb.hline(x, x + 17 * s, y, C.fire2);
}

function shake(fb, t, amp) {
  fb.ox = Math.round((hs(Math.floor(t * 40)) - 0.5) * 2 * amp);
  fb.oy = Math.round((hs(Math.floor(t * 40) + 9) - 0.5) * 2 * amp);
}

// ---------- Escenas ----------

// Portada: suena la quinta trompeta
function sTitle(fb, t) {
  gradV(fb, 0, H, C.night, C.blood);
  for (let i = 0; i < 45; i++) if (Math.sin(t * 3 + i * 2.1) > -0.2) fb.px(hs(i) * W, hs(i + 50) * 62, i % 5 ? C.grey : C.white);
  const ph = (t % 6) / 1.4;
  if (ph < 1) for (let k = 0; k < 8; k++) fb.px(lerp(118, 152, ph) - k, lerp(4, 30, ph) - k * 0.75, k < 2 ? C.white : C.fire);
  mountains(fb, H, [[20, 16, 32], [72, 22, 36], [132, 18, 36]], C.ink, C.ink);
  const ty = 50 + Math.round(Math.sin(t * 2));
  for (let k = 0; k < 4; k++) {
    const r = ((t * 22 + k * 11) % 44) + 3;
    fb.ring(92, ty + 1, r, r < 26 ? C.gold : C.gold2, -0.7, 0.7);
  }
  trumpet(fb, 40, ty, 2);
}

// 9:1 — la estrella cae y recibe la llave
function sStar(fb, t) {
  const T = 3, IX = 56, IY = 77, a = t - T;
  if (a > 0 && a < 0.8) shake(fb, t, 3 * (1 - a / 0.8));
  gradV(fb, 0, 68, C.sky2, C.sky1);
  sunFace(fb, 128, 18, 7, { fear: t > 1.2, rays: t < 1.2, t });
  mountains(fb, 68, [[18, 20, 24], [48, 15, 20], [78, 22, 22], [112, 13, 18], [150, 18, 20]], C.paper, C.ink);
  fb.rect(0, 68, W, 32, C.paper2);
  tufts(fb, 72, 99, 40, 3, C.ink2);
  forest(fb, 98, 152, 72, 90, 15, 11, C.ink);

  const pos = p => [lerp(-6, IX, p), lerp(-8, IY, p * p * 0.4 + p * 0.6)];
  if (a < 0) {
    for (let k = 16; k >= 0; k--) {
      const p = (t - k * 0.035) / T; if (p < 0) continue;
      const [x, y] = pos(p);
      fb.circ(x, y, Math.max(0, 2.4 - k * 0.14), k < 2 ? C.white : k < 5 ? C.fire2 : k < 9 ? C.fire : C.grey);
    }
    const [x, y] = pos(t / T);
    if (Math.floor(t * 10) % 2) { fb.px(x - 4, y, C.white); fb.px(x + 4, y, C.white); fb.px(x, y - 4, C.white); fb.px(x, y + 4, C.white); }
  } else {
    fb.ell(IX, IY, 9, 2, C.ink);
    fb.ell(IX, IY, 5, 1, Math.floor(t * 8) % 2 ? C.fire : C.blood);
    for (let i = 0; i < 16; i++) {
      const dx = (hs(i) - 0.5) * 60 * a, dy = -45 * a * (0.4 + hs(i + 3)) + 70 * a * a;
      if (dy < 6) fb.px(IX + dx, IY + dy, i % 3 ? C.ink2 : C.fire);
    }
    for (let i = 0; i < 6; i++) {
      const w = (a * 0.8 + i / 6) % 1;
      fb.circ(IX + Math.sin(w * 6 + i) * 3, IY - 3 - w * 22, 1 + w * 3, C.grey, 0.5 * (1 - w));
    }
    if (a > 0.6) {
      const k = ease(clamp((a - 0.6) / 1.2));
      const ky = lerp(IY - 2, 50, k) + Math.sin(t * 3) * 1.5;
      if (k > 0.4) for (let j = 0; j < 8; j++) {
        const ang = j * Math.PI / 4 + t * 0.6, len = 9 + ((Math.floor(t * 8) + j) % 3) * 2;
        fb.line(IX + Math.cos(ang) * 15, ky + 3 + Math.sin(ang) * 9, IX + Math.cos(ang) * (15 + len), ky + 3 + Math.sin(ang) * (9 + len * 0.6), C.fire2);
      }
      fb.blit(KEY, IX - 13, ky, KMAP, 2);
      const g = (t * 30) % 40;
      if (g < 26) fb.px(IX - 13 + g, ky + 2, C.white);
    }
    const fl = 1 - a / 0.6;
    if (fl > 0) fb.dither(0, 0, W, H, C.white, fl);
  }
  fb.ox = fb.oy = 0;
}

// 9:2 — se abre el pozo del abismo
function sWell(fb, t) {
  const WX = 40, WY = 64, E = 1.6, a = t - E;
  if (a > 0 && a < 1.2) shake(fb, t, 2.5 * (1 - a / 1.2));
  gradV(fb, 0, 70, C.sky2, C.sky1);
  fb.tint(0, 0, W, 70, C.smoke2, clamp(a / 6) * 0.6);
  mountains(fb, 70, [[100, 10, 40], [152, 14, 30]], C.paper, C.ink);
  fb.rect(0, 70, W, 30, C.paper2);
  tufts(fb, 74, 99, 36, 7, C.ink2);
  forest(fb, 108, 154, 70, 84, 13, 21, C.ink);
  for (let i = 0; i < 4; i++) { const x = 70 + i * 9; fb.line(x, 84, x - 2, 78, C.ink2); fb.line(x, 84, x + 2, 79, C.ink2); }

  // pozo
  fb.rect(WX - 9, WY - 1, 19, 13, C.ink);
  fb.rect(WX - 8, WY, 17, 11, C.grey);
  for (const [j, off] of [[3, 0], [6, 3], [9, 1]]) {
    fb.hline(WX - 8, WX + 8, WY + j, C.ink2);
    for (let x = WX - 8 + off; x <= WX + 8; x += 6) fb.rect(x, WY + j - 2, 1, 2, C.ink2);
  }
  fb.ell(WX, WY, 9, 2, C.ink);
  if (t > E - 0.3) fb.ell(WX, WY, 6, 1, Math.floor(t * 10) % 2 ? C.fire : C.fire2);
  fb.rect(WX - 9, WY - 14, 1, 14, C.ink2); fb.rect(WX + 9, WY - 14, 1, 14, C.ink2);
  fb.hline(WX - 9, WX + 9, WY - 12, C.ink2);
  if (a < 0) fb.line(WX, WY - 12, WX, WY - 5, C.ink2);
  const rx = a > 0 ? -a * 30 : 0, ry = a > 0 ? -a * 35 - a * a * 60 : 0;
  if (ry > -40) {
    fb.poly([[WX - 12 + rx, WY - 13 + ry], [WX + rx, WY - 22 + ry], [WX + 12 + rx, WY - 13 + ry]], C.ink);
    fb.poly([[WX - 9 + rx, WY - 14 + ry], [WX + rx, WY - 20 + ry], [WX + 9 + rx, WY - 14 + ry]], C.blood);
  }

  // la llave vuela al pozo
  if (t < 1.2) {
    const p = ease(clamp(t / 1.2));
    fb.blit(KEY, lerp(130, WX - 6, p), lerp(28, WY - 3, p) - Math.sin(p * Math.PI) * 12, KMAP, 1);
  }
  if (t > 1.1 && t < E) for (let k = 0; k < 6; k++) { const an = k + t * 9; fb.px(WX + Math.cos(an) * 6, WY - 3 + Math.sin(an) * 3, C.fire2); }

  if (a > 0) {
    const blobs = [];
    for (let i = 0; i < 110; i++) {
      const b = a - i * 0.06; if (b < 0) break;
      const y = WY - 2 - b * 13 - b * b * 1.1;
      if (y < -30) continue;
      blobs.push({ x: WX + Math.sin(b * 1.1 + i * 0.7) * (1 + b * 1.6) - b * b * 1.7 + (y < 20 ? (20 - y) * 1.2 : 0), y, r: Math.min(16, 2 + b * 2.4) });
    }
    drawSmoke(fb, blobs);
    for (let i = 0; i < 22; i++) {
      const e = (a * 1.3 + hs(i) * 3) % 3;
      fb.px(WX + (hs(i + 5) - 0.5) * 10 + Math.sin(e * 3 + i) * 3, WY - 2 - e * 20, i % 2 ? C.fire2 : C.fire);
    }
  }
  fb.ox = fb.oy = 0;
}

// 9:2 — se oscurece el sol y el aire
function sDark(fb, t) {
  const d = ease(clamp((t - 1.2) / 4));
  const cov = clamp((t - 1.8) / 2.2);
  gradV(fb, 0, 72, C.sky2, C.sky1);
  sunFace(fb, 90, 34, 11, { sad: cov > 0.4, rays: cov < 0.3, t });
  mountains(fb, 72, [[20, 12, 26], [60, 16, 24], [118, 10, 30], [150, 14, 20]], C.paper, C.ink);
  fb.rect(0, 72, W, 28, C.paper2);
  tufts(fb, 76, 99, 40, 13, C.ink2);
  forest(fb, 4, 40, 74, 86, 8, 31, C.ink);
  for (let i = 0; i < 3; i++) {
    const bx = 120 - t * (14 + i * 3) + i * 12, by = 20 + i * 6 + Math.sin(t * 4 + i) * 2;
    const w = Math.floor(t * 6 + i) & 1;
    fb.px(bx, by, C.ink); fb.px(bx - 1, by - 1 + w, C.ink); fb.px(bx + 1, by - 1 + w, C.ink); fb.px(bx - 2, by - w, C.ink); fb.px(bx + 2, by - w, C.ink);
  }
  fb.tint(0, 0, W, H, C.night, d * 0.7);
  const cx = lerp(-45, 84, ease(clamp(t / 3.8))) + (t > 3.8 ? (t - 3.8) * 2 : 0);
  const spread = 1 + clamp((t - 3) / 4) * 0.8;
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    const ang = hs(i) * Math.PI * 2, rr = hs(i + 7);
    blobs.push({ x: cx + Math.cos(ang) * 30 * rr * spread + (i - 13) * 1.4, y: 33 + Math.sin(ang) * 8 * rr + Math.sin(t * 1.5 + i), r: 5 + hs(i + 3) * 6 });
  }
  drawSmoke(fb, blobs);
  if (cov > 0.9) for (let k = 0; k < 5; k++) { const an = -2.2 + k * 0.25 + Math.sin(t) * 0.05; fb.px(90 + Math.cos(an) * 19, 34 + Math.sin(an) * 19, C.gold2); }
}

// 9:3 — del humo salen langostas
function sSwarm(fb, t) {
  gradV(fb, 0, 80, C.sky2, C.paper2);
  fb.tint(0, 0, W, 80, C.smoke2, 0.35);
  mountains(fb, 80, [[90, 10, 30], [140, 14, 28]], C.paper2, C.ink);
  fb.rect(0, 80, W, 20, C.paper2);
  tufts(fb, 83, 99, 30, 17, C.ink2);
  const blobs = [];
  for (let i = 0; i < 30; i++) {
    const y = 4 + hs(i + 1) * 84;
    blobs.push({ x: 4 + hs(i) * 26 + (y / 84) * 18 + Math.sin(t * 0.8 + i) * 2, y: y + Math.cos(t * 0.7 + i) * 2, r: 7 + hs(i + 2) * 9 });
  }
  drawSmoke(fb, blobs);
  for (let i = 0; i < 9; i++) if (((t * 2 + hs(i) * 5) % 3) < 0.5) { const x = 12 + hs(i + 2) * 30, y = 10 + hs(i + 4) * 70; fb.px(x, y, C.red); fb.px(x + 2, y, C.red); }
  const N = Math.min(150, Math.floor(t * 20));
  for (let i = 0; i < N; i++) {
    const a = t - i / 20;
    const sx = 26 + hs(i * 1.3) * 22, sy = 12 + hs(i * 2.7) * 62;
    const x = sx + (16 + hs(i * 3.1) * 24) * a, y = sy + (hs(i * 4.3) - 0.55) * 10 * a + Math.sin(a * 5 + i) * 2;
    if (x > W + 6) continue;
    if (i % 24 === 0) bestia(fb, x, y, t, i, false, LANG_S);
    else if (i % 6 === 0) bestia(fb, x, y, t, i);
    else { fb.px(x, y, C.ink); if ((Math.floor(t * 14) + i) & 1) fb.px(x, y - 1, C.grey); }
  }
}

// 9:4 — no dañar la hierba, sólo a los hombres sin el sello
function sForest(fb, t) {
  gradV(fb, 0, 80, C.sky2, C.paper);
  fb.tint(0, 0, W, 80, C.smoke2, 0.25);
  for (let i = 0; i < 5; i++) bareTree(fb, 10 + i * 34 + hs(i) * 8, 82, 22 + hs(i + 1) * 14, C.smoke2, i);
  forest(fb, 2, 158, 80, 86, 22, 41, C.ink);
  fb.rect(0, 84, W, 16, C.green2);
  for (let i = 0; i < 140; i++) {
    const gx = hs(i) * W, gy = 86 + hs(i + 0.5) * 14, sw = Math.round(Math.sin(t * 3 + gx * 0.2));
    fb.line(gx, gy, gx + sw, gy - 3, i % 3 ? C.green : C.paper2);
  }
  // el sellado
  const sx = 28, sy = 96;
  const pr = 15 + Math.sin(t * 4) * 1.5;
  fb.circ(sx, sy - 11, pr, C.fire2, 0.12);
  fb.ring(sx, sy - 11, pr, C.gold); fb.ring(sx, sy - 11, pr + 2, C.gold2);
  man(fb, sx, sy, t, { armsUp: true, seal: true, c: C.ink, s: 2 });
  if (Math.floor(t * 3) % 2) { fb.px(sx - 3, sy - 22, C.fire2); fb.px(sx + 3, sy - 22, C.fire2); fb.px(sx, sy - 25, C.fire2); }
  // los que huyen
  const men = [{ x: 64 + t * 8, y: 97 }, { x: 92 + t * 6.5, y: 93 }];
  men.forEach((m, k) => {
    const hit = hs(k + Math.floor(t * 5)) > 0.6 && t > 2;
    man(fb, m.x, m.y, t, { run: true, armsUp: true, ph: k, c: hit ? C.red : C.ink, s: 2 });
  });
  for (let i = 0; i < 30; i++) {
    const m = men[i % 2];
    const p = ease(clamp((t - 0.3 - hs(i) * 1.5) / 1.8));
    const ang = t * (6 + hs(i + 9) * 3) + i;
    const tx = m.x + Math.cos(ang) * (7 + hs(i + 2) * 6), ty = m.y - 14 + Math.sin(ang) * 7;
    const x = lerp(-10 + hs(i + 4) * 40, tx, p), y = lerp(4 + hs(i + 6) * 25, ty, p);
    if (i % 3 === 0) bestia(fb, x, y, t, i, Math.cos(ang) < 0 && p >= 1);
    else fb.px(x, y, C.ink);
  }
  // unas langostas se acercan al sellado y rebotan
  for (let i = 0; i < 3; i++) {
    const c = (t * 0.7 + i / 3) % 1;
    const r = pr + 4 + Math.abs(Math.sin(c * Math.PI * 2)) * 14;
    const ang = -1.2 - i * 0.6;
    bestia(fb, sx + Math.cos(ang) * r, sy - 11 + Math.sin(ang) * r, t, i, true);
  }
}

// ---------- La bestia de la viñeta 9:7 ----------
// Sale del dibujo original (sprites.js). Aquí se le cierran las puntas de la corona,
// se colorea con la paleta de la historieta y se generan versiones chicas para las otras viñetas.
const TOPE = 10; // filas agregadas arriba para las puntas de la corona

function insidePoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function flood(v, sx, sy, box, mark, wall = () => false) {
  const st = [[sx, sy]];
  while (st.length) {
    const [x, y] = st.pop();
    if (x < box[0] || y < box[1] || x > box[2] || y > box[3] || v[y][x] || mark[y][x] || wall(x, y)) continue;
    mark[y][x] = 1;
    st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function buildCabeza() {
  const w = BESTIA.cabeza[0].length;
  const v = [...Array(TOPE)].map(() => Array(w).fill(0)).concat(BESTIA.cabeza.map(r => [...r].map(ch => ch === '#' ? 2 : ch === '+' ? 1 : 0)));
  const h = v.length;
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) v[y][x] = 2; };
  const seg = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) { const x = Math.round(lerp(x0, x1, i / n)), y = Math.round(lerp(y0, y1, i / n)); set(x, y); set(x + 1, y); } };
  // puntas de la corona: cada gota del dibujo se cierra en punta hacia arriba
  const puntas = [[23, 33, 28], [42, 51, 47], [57, 69, 63], [78, 88, 83]];
  for (const [l, r, ax] of puntas) { seg(l, TOPE + 2, ax, 1); seg(r, TOPE + 2, ax, 1); }
  seg(92, TOPE + 2, 93, TOPE - 4);
  // oro dentro de las puntas y las gotas
  const oro = v.map(r => r.map(() => 0));
  for (const [l, r, ax] of puntas) flood(v, ax, TOPE + 6, [l - 4, 0, r + 4, TOPE + 26], oro);
  // colores
  const sil = [[0, 40], [10, 33], [21, 28], [22, 26], [96, 26], [100, 10], [109, 10], [109, 24], [104, 26], [103, 38], [106, 48], [109, 54], [108, 100], [110, 106], [100, 111], [46, 111], [34, 110], [22, 108], [6, 97], [0, 97]]
    .map(([x, y]) => [x, y + TOPE]);
  // la piel se rellena desde la cara; lo que queda encerrado entre los trazos del pelo es pelo
  const inSil = v.map((r, y) => r.map((_, x) => insidePoly(sil, x + 0.5, y + 0.5) && y - TOPE >= 26));
  const piel = v.map(r => r.map(() => 0));
  for (const [x, y] of [[62, 45], [80, 50], [45, 60], [40, 75], [30, 90], [55, 88], [70, 42]]) flood(v, x, y + TOPE, [0, 0, w - 1, h - 1], piel, (x, y) => !inSil[y][x]);
  // 1) región de cada pixel
  const reg = v.map((row, y) => row.map((val, x) => {
    if (val === 2) return 'ink';
    if (val === 1) return 'soft';
    if (oro[y][x]) return 'gold';
    const oy = y - TOPE;
    if (!inSil[y][x]) return '';
    if (x >= 58 && x <= 104 && oy >= 64 && oy <= 97) return 'ivory';
    if (x >= 40 && oy >= 99) return 'lip';
    return piel[y][x] ? 'skin' : 'hair';
  }));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? '' : reg[y][x];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // 2) limpieza: trazos suaves y tinta suelta toman el color de la zona vecina
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = reg[y][x];
    if (r !== 'soft' && r !== 'ink') continue;
    const nb = N4.map(([dx, dy]) => at(x + dx, y + dy));
    if (r === 'ink' && nb.some(n => n === 'ink')) continue;
    const fill = nb.find(n => n && n !== 'ink' && n !== 'soft' && n !== 'shadeOf');
    reg[y][x] = fill ? fill : (r === 'soft' && nb.some(n => n === 'ink') ? 'ink' : r === 'soft' ? '' : 'ink');
  }
  // 3) pintura con luz desde arriba a la izquierda
  const PAL = {
    skin: [C.skin, toU32('#b07e55'), toU32('#eec79c')], hair: [toU32('#5a2f17'), toU32('#3a1d0e'), toU32('#80492a')],
    gold: [C.gold, C.gold2, C.fire2], ivory: [C.ivory, toU32('#c9ba94'), C.white], lip: [C.lip, C.blood, toU32('#c45e4a')]
  };
  const B = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const out = reg.map((row, y) => row.map((r, x) => {
    if (r === 'ink') return C.ink;
    const pal = PAL[r]; if (!pal) return 0;
    const [base, dark, light] = pal;
    const sh = at(x + 1, y) === 'ink' || at(x, y + 1) === 'ink' || at(x + 1, y + 1) === 'ink';
    const hl = at(x - 1, y) === 'ink' || at(x, y - 1) === 'ink';
    const oy = y - TOPE;
    if (r === 'skin') {
      if (sh) return dark;
      if (x > 84 && B(x, y) < 8) return dark;          // mejilla derecha en sombra
      if (hl && x < 70 && oy < 60) return light;
      return base;
    }
    if (r === 'hair') return sh ? dark : ((x * 2 + y) % 6 === 0 ? light : base);
    if (r === 'gold') return sh ? dark : hl ? light : base;
    if (r === 'ivory') return sh || B(x, y) < 3 && oy > 90 ? dark : hl ? light : base;
    if (r === 'lip') return sh ? dark : hl ? light : base;
    return base;
  }));
  // joyas rojas en la base de cada punta
  for (const [, , ax] of puntas) {
    const jy = TOPE + 8;
    if (reg[jy][ax] === 'gold') { out[jy][ax] = C.red; out[jy][ax + 1] = C.red; out[jy + 1][ax] = C.blood; out[jy + 1][ax + 1] = C.red; out[jy][ax] = C.fire2; }
  }
  return out;
}

function buildLangosta() {
  const src = BESTIA.langosta.map(r => [...r].map(ch => ch === '#' ? 2 : ch === '+' ? 1 : 0));
  const h = src.length, w = src[0].length;
  const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y][x] === 2;
  const body = toU32('#4b3b2a'), bodyL = toU32('#6d5638'), wing = toU32('#7d7a70');
  // tinta en el borde; por dentro cuerpo pardo con brillo arriba, cerdas del lomo grisáceas
  const g = src.map((row, y) => row.map((v, x) => {
    if (!v) return 0;
    if (v === 1) return ink(x - 1, y) || ink(x + 1, y) || ink(x, y - 1) || ink(x, y + 1) ? C.ink2 : 0;
    const inner = ink(x - 1, y) && ink(x + 1, y) && ink(x, y - 1) && ink(x, y + 1) && ink(x - 2, y) && ink(x + 2, y) && ink(x, y - 2) && ink(x, y + 2);
    if (!inner) return C.ink;
    if (y < 40 && x >= 44 && x < 100) return (x + y) % 3 ? wing : C.ink2;
    return !ink(x, y - 3) ? bodyL : body;
  }));
  // ojo rojo en la cabeza
  for (const [x, y] of [[92, 13], [93, 13], [92, 14]]) g[y][x] = C.red;
  g[13][93] = C.fire2;
  return g;
}

// Reduce un sprite de colores: la tinta, el rojo y el oro mandan para no perder la silueta.
function shrink(g, f) {
  const h = Math.floor(g.length / f), w = Math.floor(g[0].length / f), out = [];
  for (let j = 0; j < h; j++) {
    const row = [];
    for (let i = 0; i < w; i++) {
      let ink = 0, any = 0, red = 0, gold = 0; const cnt = new Map();
      for (let y = 0; y < f; y++) for (let x = 0; x < f; x++) {
        const c = g[j * f + y][i * f + x]; if (!c) continue;
        any++;
        if (c === C.ink || c === C.ink2) ink++; else cnt.set(c, (cnt.get(c) || 0) + 1);
        if (c === C.red) red++; if (c === C.gold || c === C.fire2) gold++;
      }
      const n = f * f;
      let c = 0;
      if (red) c = C.red;
      else if (ink / n >= 0.3) c = C.ink;
      else if (any / n >= 0.45) { let best = 0; cnt.forEach((k, col) => { if (k > best) { best = k; c = col; } }); if (!c) c = C.ink; if (gold && gold * 2 >= any - ink) c = C.gold; }
      row.push(c);
    }
    out.push(row);
  }
  return out;
}

const CABEZA = buildCabeza(), LANGOSTA = buildLangosta();
const CABEZA_S = shrink(CABEZA, 3);
const LANG_M = shrink(LANGOSTA, 3), LANG_S = shrink(LANGOSTA, 6), LANG_XS = shrink(LANGOSTA, 10);

function drawGrid(fb, g, x0, y0, flip = false) {
  const w = g[0].length;
  for (let y = 0; y < g.length; y++) for (let x = 0; x < w; x++) {
    const c = g[y][flip ? w - 1 - x : x]; if (c) fb.px(x0 + x, y0 + y, c);
  }
}

// Langosta de la historieta en tamaño chico, con aleteo (sube y baja la mitad delantera).
function bestia(fb, x, y, t, ph = 0, flip = false, g = LANG_XS) {
  const w = g[0].length, h = g.length, up = (Math.floor(t * 14 + ph * 7) & 1);
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = g[j][flip ? w - 1 - i : i]; if (!c) continue;
    const front = flip ? i < w * 0.55 : i > w * 0.45;
    fb.px(x0 + i, y0 + j - (front && j < h * 0.45 && up ? 1 : 0), c);
  }
}

// 9:7 — coronas de oro, caras humanas, cabello de mujer, dientes de león.
function sFace(fb, t) {
  const jaw = Math.round((Math.sin(t * 2.6) * 0.5 + 0.5) * 4);
  if (jaw >= 4) shake(fb, t, 0.6);
  gradV(fb, 0, fb.h, C.sky2, C.paper2);
  fb.tint(0, 0, fb.w, fb.h, C.smoke2, 0.3);
  fb.rect(0, 132, fb.w, fb.h - 132, C.paper2);
  fb.hline(0, fb.w, 132, C.ink2);
  for (let i = 0; i < 30; i++) { const x = hs(i + 70) * fb.w, y = 136 + hs(i + 90) * 12; fb.px(x, y, C.ink2); fb.px(x - 1, y - 1, C.ink2); fb.px(x + 1, y - 1, C.ink2); }
  for (let i = 0; i < 8; i++) {
    const x = fb.w + 10 - ((t * (10 + hs(i) * 8) + hs(i + 3) * fb.w) % (fb.w * 0.6)), y = 104 + hs(i + 1) * 40 + Math.sin(t * 4 + i) * 1.5;
    bestia(fb, x, y, t, i, true);
  }

  // cabeza: respira, el pelo se mece y la mandíbula muerde
  const HX = 4, HY = 14 + Math.round(Math.sin(t * 1.5) * 0.8), J = TOPE + 80;
  for (let y = 0; y < CABEZA.length; y++) {
    const row = CABEZA[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x]; if (!c) continue;
      let dx = 0, dy = 0;
      if (x < 32 && y > TOPE + 29 && y < TOPE + 103) dx = Math.round(Math.sin(t * 2.5 + y * 0.18) * 1.3 * (1 - x / 32));
      if (y >= J && x >= 44) dy = jaw;
      fb.px(HX + x + dx, HY + y + dy, c);
    }
  }
  if (jaw > 0) { fb.rect(HX + 52, HY + J, 52, jaw, C.blood); fb.hline(HX + 52, HX + 103, HY + J, C.ink); }
  // destellos en las puntas de la corona de oro
  const tips = [28, 47, 63, 83];
  for (let k = 0; k < tips.length; k++) {
    const ph = (t * 0.7 + k / 4) % 1;
    if (ph > 0.3) continue;
    const gx = HX + tips[k], gy = HY, r = ph < 0.15 ? 2 : 1;
    fb.px(gx, gy, C.white);
    for (let q = 1; q <= r; q++) { fb.px(gx - q, gy, C.fire2); fb.px(gx + q, gy, C.fire2); fb.px(gx, gy - q, C.fire2); fb.px(gx, gy + q, C.fire2); }
  }

  // langosta con cola de escorpión: vuela, la cola se balancea y las cerdas vibran
  const BX = 112 + Math.round(Math.sin(t * 0.9) * 3), BY = 8 + Math.round(Math.sin(t * 2.2) * 2);
  const flap = Math.floor(t * 16) & 1;
  for (let y = 0; y < LANGOSTA.length; y++) {
    const row = LANGOSTA[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x]; if (!c) continue;
      let dx = 0, dy = 0;
      if (x < 12 && y > 58) dx = Math.round(Math.sin(t * 3 + (y - 58) * 0.12) * (y - 58) / 14);
      if (y < 41 && x >= 40 && x < 100) dy = ((flap + (x >> 2)) & 1) ? -1 : 0;
      if (x >= 100 && c !== C.red && hs(x + y * 7 + Math.floor(t * 12)) > 0.85) continue;
      fb.px(BX + x + dx, BY + y + dy, c);
    }
  }
  fb.ox = fb.oy = 0;
}

// 9:10 — poder para dañar a los hombres durante cinco meses
function sMonths(fb, t) {
  gradV(fb, 0, 88, C.paper2, C.paper);
  fb.rect(78, 20, 40, 68, C.white);
  fb.line(78, 20, 78, 88, C.ink); fb.line(78, 20, 118, 20, C.ink);
  fb.line(0, 88, W, 88, C.ink);
  fb.rect(0, 89, W, 11, C.paper2);
  tufts(fb, 91, 99, 22, 51, C.ink2);
  drawSmoke(fb, [[124, 26, 6], [133, 23, 8], [143, 26, 6], [151, 27, 5], [137, 29, 5]].map(([x, y, r]) => ({ x, y: y + Math.sin(t + x) * 0.8, r })));
  for (let i = 0; i < 50; i++) {
    const a = (t * 0.5 + hs(i)) % 1;
    const x = 106 + hs(i + 1) * 50 - a * 22, y = 30 + a * 58;
    fb.px(x, y, C.ink); if ((Math.floor(t * 12) + i) & 1) fb.px(x + 1, y - 1, C.grey);
  }
  man(fb, 112, 88, t, { armsUp: true, ph: 0 });
  man(fb, 134, 88, t, { armsUp: true, ph: 1, c: Math.floor(t * 4) % 3 ? C.ink : C.red });
  fb.hline(92, 99, 87, C.ink); fb.rect(100, 86, 2, 2, C.ink);

  // el hombre atormentado
  const s = Math.sin(t * 1.7) * 1.5;
  fb.poly([[29, 70], [36, 70], [35, 96], [29, 96]], C.ink);
  fb.poly([[40, 70], [47, 70], [48, 96], [41, 96]], C.ink);
  fb.rect(26, 95, 9, 2, C.ink); fb.rect(41, 95, 9, 2, C.ink);
  fb.poly([[28 + s * 0.3, 38], [48 + s * 0.3, 38], [47, 72], [29, 72]], C.ink);
  fb.circ(38 + s, 30, 6, C.ink);
  const hy = 12 + Math.sin(t * 5);
  fb.thick(47 + s * 0.3, 40, 56 + s, hy, 3, C.ink);
  for (const [dx, dy] of [[-3, -4], [-1, -5], [1, -5], [3, -3]]) fb.line(56 + s, hy, 56 + s + dx, hy + dy, C.ink);
  fb.thick(29 + s * 0.3, 40, 22, 64, 3, C.ink);
  for (const dx of [-2, 0, 2]) fb.line(22, 64, 22 + dx, 68, C.ink);
  for (let y = 8; y < 98; y++) for (let x = 14; x < 64; x++) {
    if (fb.get(x, y) !== C.ink) continue;
    if ((x + y) % 4 === 0 || hs(x * 7 + y * 13) > 0.9) fb.d[y * W + x] = C.grey;
  }
  fb.px(36 + s, 29, C.paper); fb.px(40 + s, 29, C.paper);
  fb.rect(37 + s, 32, 3, 2 + (Math.floor(t * 3) & 1), C.blood);
  const spots = [[33, 45], [42, 52], [37, 60], [31, 80], [44, 84], [50, 30], [25, 55], [39, 40], [45, 66], [34, 90]];
  spots.forEach(([x, y], i) => { if (((t * 3 + hs(i) * 7) % 2) < 0.6) fb.rect(x, y, 2, 1, C.red); });
  for (let i = 0; i < 9; i++) {
    const ang = t * (2 + hs(i)) + i * 0.8;
    bestia(fb, 40 + Math.cos(ang) * (i % 3 === 0 ? 27 : 20), 50 + Math.sin(ang) * (18 + (i % 3) * 7), t, i, Math.sin(ang) > 0, i % 3 === 0 ? LANG_S : LANG_XS);
  }
  // cinco meses
  const n = Math.min(5, 1 + Math.floor(t / 1.3));
  fb.text('MES ' + n, 66, 4, C.ink);
  for (let m = 0; m < 5; m++) {
    const x = 94 + m * 10, y = 7;
    if (m < n) { fb.circ(x, y, 3, m === n - 1 ? C.gold : C.paper2); fb.ring(x, y, 4, C.ink); }
    else fb.ring(x, y, 3, C.grey);
  }
}

// 9:11 — tienen por rey al ángel del abismo
function sKing(fb, t) {
  fb.fill(C.paper);
  const frames = [[4, 6, 48, 70], [56, 6, 48, 70], [108, 6, 48, 70]];
  const rev = [0.2, 1.6, 3.0];
  frames.forEach(([x, y, w, h], k) => {
    fb.rect(x - 1, y - 1, w + 2, h + 2, C.ink);
    fb.rect(x, y, w, h, C.blood);
    fb.dither(x, y, w, h, C.night, 0.6);
    if (t < rev[k]) return;
    const a = t - rev[k], cx = x + w / 2;
    if (k === 0) {
      fb.dither(x, y + 10, w, h - 10, C.blood, 0.25 + 0.15 * Math.sin(t * 3));
      fb.poly([[cx - 4, y + 38], [cx - 22, y + 20], [cx - 19, y + 36], [cx - 23, y + 52]], C.ink);
      fb.poly([[cx + 4, y + 38], [cx + 22, y + 20], [cx + 19, y + 36], [cx + 23, y + 52]], C.ink);
      fb.poly([[cx - 18, y + h], [cx - 8, y + 34], [cx + 8, y + 34], [cx + 18, y + h]], C.ink2);
      fb.circ(cx, y + 27, 7, C.ink);
      fb.rect(cx - 7, y + 17, 15, 3, C.gold);
      for (const dx of [-6, 0, 6]) fb.poly([[cx + dx - 2, y + 18], [cx + dx, y + 12], [cx + dx + 2, y + 18]], C.gold);
      const ec = Math.floor(t * 4) % 3 ? C.red : C.fire2;
      fb.rect(cx - 4, y + 26, 2, 1, ec); fb.rect(cx + 2, y + 26, 2, 1, ec);
      fb.blit(KEY, cx + 3, y + 46 + Math.round(Math.sin(t * 2)), KMAP, 1);
    } else if (k === 1) {
      const cy = y + h / 2;
      let open = ease(clamp(a / 1.1));
      if ((a % 3) > 2.8) open *= 0.1;
      for (let dx = -20; dx <= 20; dx++) {
        const hh = open * 11 * (1 - (dx / 20) ** 2);
        if (hh < 0.5) { fb.px(cx + dx, cy, C.grey); continue; }
        fb.rect(cx + dx, cy - hh, 1, hh * 2, C.white);
        fb.px(cx + dx, cy - hh - 1, C.grey); fb.px(cx + dx, cy + hh, C.grey);
      }
      const lx = Math.sin(a * 1.2) * 6;
      const r = Math.min(7, open * 11 * (1 - (lx / 20) ** 2) - 1);
      if (r > 1) {
        fb.circ(cx + lx, cy, r, C.red);
        fb.circ(cx + lx, cy, r - 2, C.fire, 0.5);
        fb.rect(cx + lx, cy - r + 1, 2, r * 2 - 1, C.ink);
        fb.px(cx + lx - 2, cy - 2, C.white);
      }
      for (let q = -3; q <= 3; q++) {
        const qx = q * 5, ty = cy - open * 11 * (1 - (qx / 20) ** 2) - 1;
        fb.line(cx + qx, ty, cx + qx * 1.25, ty - 4, C.grey);
      }
      for (let v = 0; v < 6; v++) { const an = v * 1.05 + 0.3; fb.line(cx + Math.cos(an) * 18, cy + Math.sin(an) * 16, cx + Math.cos(an) * 23, cy + Math.sin(an) * 30, C.blood); }
    } else {
      gradV2(fb, x, y, w, h);
      for (let i = 0; i < 14; i++) fb.px(x + ((hs(i) * w + a * 20 * (0.5 + hs(i + 1))) % w), y + 4 + hs(i + 2) * (h - 8), C.ink2);
      bestia(fb, cx, y + h / 2 + Math.sin(t * 3) * 3, t, 0, false, LANG_M);
    }
    if (a < 0.25) fb.dither(x, y, w, h, C.white, 1 - a / 0.25);
  });
  if (t > 4.6) {
    const s2 = 2, str = 'ABADON';
    fb.text(str, (W - textW(str, s2)) / 2, 82, Math.floor(t * 4) % 4 ? C.blood : C.red, s2);
  }
}

// 9:12 — el primer ay pasó; vienen aún dos ayes
function sWoe(fb, t) {
  const clear = ease(clamp(t / 4));
  gradV(fb, 0, 78, C.sky2, C.sky1);
  fb.tint(0, 0, W, 78, C.smoke2, 0.5 * (1 - clear));
  sunFace(fb, 30, 22, 8, { sad: t < 3, rays: t > 3, t });
  drawSmoke(fb, [[0, 20, 5], [8, 17, 7], [16, 21, 5], [4, 24, 4]].map(([x, y, r]) => ({ x: x + 14 - t * 5, y, r })));
  mountains(fb, 78, [[70, 8, 30], [120, 11, 34]], C.paper, C.ink);
  fb.rect(0, 78, W, 22, C.paper2);
  tufts(fb, 80, 99, 30, 61, C.ink2);
  bareTree(fb, 62, 79, 16, C.ink, 7);
  fb.rect(80, 68, 1, 11, C.ink); fb.rect(77, 71, 7, 1, C.ink);
  for (let i = 0; i < 40; i++) {
    const x = 90 - t * 20 - hs(i) * 40 + Math.sin(t * 4 + i) * 2, y = 36 + hs(i + 2) * 22;
    if (x > -8) { if (i % 5 === 0) bestia(fb, x, y, t, i, true); else fb.px(x, y, C.ink); }
  }
  if (t > 2) for (let i = 0; i < 3; i++) {
    const bx = W + 10 - (t - 2) * 12 + i * 10, by = 30 + i * 5 + Math.sin(t * 3 + i) * 2, w = Math.floor(t * 5 + i) & 1;
    fb.px(bx, by, C.ink); fb.px(bx - 1, by - 1 + w, C.ink); fb.px(bx + 1, by - 1 + w, C.ink); fb.px(bx - 2, by - w, C.ink); fb.px(bx + 2, by - w, C.ink);
  }
  if (t > 1) {
    fb.text('AY', 8, 82, C.ink, 3);
    const p = clamp((t - 1.8) / 0.6);
    if (p > 0) fb.thick(5, 92, lerp(5, 34, p), lerp(92, 83, p), 2, C.red);
  }
  if (t > 3) {
    const vis = t > 4 || Math.floor(t * 12) % 2;
    if (vis) {
      for (const [x, y] of [[104, 18], [112, 38]]) {
        fb.circ(x + 24, y, 7 + Math.sin(t * 5 + x) * 1.5, C.fire2, 0.35);
        for (let q = 0; q < 3; q++) { const r = ((t * 14 + q * 6) % 18) + 8; fb.ring(x + 26, y, r, C.gold2, -0.6, 0.6); }
        trumpet(fb, x, y + Math.round(Math.sin(t * 2 + x)), 1);
      }
    }
  }
  if (t > 4 && Math.floor(t * 3) % 2) fb.text('AY AY', 104, 84, C.red, 2);
}

// ---------- Guion ----------
const SCENES = [
  { ref: '9:1', draw: sStar, amb: 'wind', sfx: [[3, 'boom']], text: 'Y vi una estrella que cayó del cielo a la tierra; y se le dio la llave del pozo del abismo.' },
  { ref: '9:2', draw: sWell, amb: 'wind', sfx: [[1.6, 'boom']], text: 'Y abrió el pozo del abismo, y subió humo del pozo como humo de un gran horno.' },
  { ref: '9:2', draw: sDark, amb: 'wind', sfx: [], text: 'Y se oscureció el sol y el aire por el humo del pozo.' },
  { ref: '9:3', draw: sSwarm, amb: 'buzz', sfx: [], text: 'Y del humo salieron langostas sobre la tierra.' },
  { ref: '9:4', draw: sForest, amb: 'buzz', sfx: [], text: 'Y se les mandó que no dañasen a la hierba de la tierra, sino solamente a los hombres que no tuvieran el sello.' },
  { ref: '9:7', draw: sFace, amb: 'pad', w: 240, h: 150, sfx: [[0.3, 'roar']], text: 'Tenían como coronas de oro; sus caras eran como caras humanas, tenían cabello como de mujer y dientes como de león.' },
  { ref: '9:10', draw: sMonths, amb: 'wind', sfx: [[0.05, 'bell'], [1.3, 'bell'], [2.6, 'bell'], [3.9, 'bell'], [5.2, 'bell']], text: 'Tenían poder para dañar a los hombres durante 5 meses.' },
  { ref: '9:11', draw: sKing, amb: 'pad', sfx: [[4.6, 'boom']], text: 'Y tienen por rey al ángel del abismo.' },
  { ref: '9:12', draw: sWoe, amb: null, sfx: [[3, 'trumpet']], text: 'El primer ay pasó; he aquí vienen aún dos ayes después de esto.' }
];
SCENES.forEach(s => { s.dur = Math.max(7.5, s.text.length / 30 + 5); });

// Orden de las viñetas en la hoja original (dos columnas)
const LAYOUT = [[0, 2, 4, 6], [1, 3, 5, 7, 8]];

// ---------- Sonido (sintetizado, sin archivos) ----------
const Snd = {
  ac: null, on: true,
  ensure() {
    if (!this.ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; this.ac = new A(); }
    if (this.ac.state === 'suspended') this.ac.resume();
    return this.ac;
  },
  trumpet() {
    if (!this.on) return; const ac = this.ensure(); if (!ac) return;
    const notes = [[392, 0, 0.18], [523, 0.2, 0.18], [659, 0.4, 0.18], [784, 0.6, 1.2]];
    for (const [f, st, d] of notes) {
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 2000;
      const t0 = ac.currentTime + st;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 0.04);
      g.gain.setValueAtTime(0.09, t0 + d - 0.1); g.gain.linearRampToValueAtTime(0, t0 + d);
      o.connect(lp).connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.05);
    }
  },
  noise(dur, freq, vol) {
    if (!this.on) return; const ac = this.ensure(); if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = freq; g.gain.value = vol;
    src.connect(lp).connect(g).connect(ac.destination); src.start();
  },
  boom() { this.noise(1.2, 380, 0.7); },
  roar() { this.noise(0.8, 600, 0.22); },
  bell() {
    if (!this.on) return; const ac = this.ensure(); if (!ac) return;
    const t0 = ac.currentTime;
    for (const [f, v] of [[196, 0.1], [392, 0.04], [523, 0.02]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 1.9);
    }
  },

  // Ambientes de fondo: sólo suena uno a la vez y se cambian con fundido.
  amb: null, ambNodes: null,
  ambient(kind) {
    if (!this.on) kind = null;
    if (kind === this.amb) return;
    const ac = this.ac;
    if (this.ambNodes && ac) {
      const { gain, srcs } = this.ambNodes, t0 = ac.currentTime;
      gain.gain.cancelScheduledValues(t0); gain.gain.setValueAtTime(gain.gain.value, t0);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.8);
      srcs.forEach(n => n.stop(t0 + 0.85));
    }
    this.amb = kind; this.ambNodes = null;
    if (!kind) return;
    const A = this.ensure(); if (!A) return;
    const gain = A.createGain(), srcs = [], t0 = A.currentTime;
    gain.gain.setValueAtTime(0, t0);
    gain.connect(A.destination);
    const osc = (type, f) => { const o = A.createOscillator(); o.type = type; o.frequency.value = f; srcs.push(o); return o; };
    const lfo = (f, depth, target) => { const l = osc('sine', f), g = A.createGain(); g.gain.value = depth; l.connect(g).connect(target); };
    const filt = (type, f, q = 1) => { const n = A.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    let vol = 0.04;
    if (kind === 'buzz') {
      // zumbido de langostas: suave y con vaivén, no un tono fijo
      const lp = filt('lowpass', 700), am = A.createGain(); am.gain.value = 0.6;
      lfo(19, 0.35, am.gain);
      for (const f of [147, 151.5]) osc('sawtooth', f).connect(lp);
      lp.connect(am).connect(gain);
      vol = 0.022;
    } else if (kind === 'wind') {
      const len = A.sampleRate * 2, buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const n = A.createBufferSource(); n.buffer = buf; n.loop = true; srcs.push(n);
      const bp = filt('bandpass', 450, 0.8);
      lfo(0.13, 220, bp.frequency);
      n.connect(bp).connect(gain);
      vol = 0.09;
    } else if (kind === 'pad') {
      // acorde suave y misterioso (nada de tonos rasposos)
      const lp = filt('lowpass', 1400), am = A.createGain(); am.gain.value = 0.8;
      lfo(0.25, 0.2, am.gain);
      for (const f of [220, 261.6, 329.6, 440]) { const o = osc('sine', f); lfo(0.1 + f / 5000, 1.5, o.frequency); o.connect(lp); }
      lp.connect(am).connect(gain);
      vol = 0.03;
    }
    gain.gain.linearRampToValueAtTime(vol, t0 + 1.2);
    srcs.forEach(n => n.start());
    this.ambNodes = { gain, srcs };
  }
};

// ---------- Motor ----------
const $ = id => document.getElementById(id);
const fbs = {};
const fbFor = s => { const w = s.w || W, h = s.h || H, k = w + 'x' + h; return fbs[k] || (fbs[k] = new FB(w, h)); };
let fb = fbFor({});
const screen = $('screen').getContext('2d');
const panel = $('panel'), refEl = $('ref'), textEl = $('text'), prog = $('prog'), dots = $('dots');
let mode = 'title', idx = 0, t0 = 0, paused = false, pausedAt = 0, lastChars = -1;
const fired = new Set();
const grid = [];

SCENES.forEach((s, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.title = 'Apocalipsis ' + s.ref; b.setAttribute('aria-label', 'Viñeta ' + (i + 1));
  b.addEventListener('click', () => { if (mode !== 'story') startStory(); go(i); });
  li.appendChild(b); dots.appendChild(li);
});

function sceneTime(now) { return ((paused ? pausedAt : now) - t0) / 1000; }

function setPaused(p) {
  const now = performance.now();
  if (p === paused) return;
  if (p) pausedAt = now; else t0 += now - pausedAt;
  paused = p;
  $('play').textContent = paused ? '▶' : '❚❚';
  $('play').setAttribute('aria-label', paused ? 'Reproducir' : 'Pausar');
}

function go(i) {
  idx = clamp(i, 0, SCENES.length - 1);
  setPaused(false);
  t0 = performance.now(); fired.clear(); lastChars = -1;
  refEl.textContent = 'Apocalipsis ' + SCENES[idx].ref;
  panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter');
  [...dots.children].forEach((li, k) => li.classList.toggle('on', k === idx));
  Snd.ambient(SCENES[idx].amb);
}

function startStory() {
  mode = 'story';
  $('title').hidden = true;
  $('final').hidden = true;
  $('story').hidden = false;
}

function showFinal() {
  mode = 'final';
  Snd.ambient(null);
  $('story').hidden = true;
  $('final').hidden = false;
  if (!grid.length) {
    LAYOUT.forEach((colIdx, c) => {
      const col = $(c ? 'colR' : 'colL');
      colIdx.forEach(i => {
        const fig = document.createElement('figure');
        fig.className = 'mini';
        const cv = document.createElement('canvas');
        cv.width = SCENES[i].w || W; cv.height = SCENES[i].h || H;
        const cap = document.createElement('figcaption');
        const b = document.createElement('b'); b.textContent = SCENES[i].ref + ' ';
        cap.append(b, SCENES[i].text);
        fig.append(cv, cap);
        fig.addEventListener('click', () => { startStory(); go(i); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        col.appendChild(fig);
        grid.push({ i, ctx: cv.getContext('2d') });
      });
    });
  }
  $('final').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCaption(s, t) {
  const n = Math.min(s.text.length, Math.floor(Math.max(0, t - 0.4) * 32));
  if (n === lastChars) return;
  lastChars = n;
  const shown = document.createElement('span'); shown.textContent = s.text.slice(0, n);
  const ghost = document.createElement('span'); ghost.className = 'ghost'; ghost.textContent = s.text.slice(n);
  textEl.replaceChildren(shown, ghost);
}

let lastGrid = 0;
function frame(now) {
  if (mode === 'title') {
    sTitle(fb, now / 1000);
    screen.putImageData(fb.img, 0, 0);
  } else if (mode === 'story') {
    const s = SCENES[idx], t = sceneTime(now);
    fb = fbFor(s);
    if (screen.canvas.width !== fb.w) { screen.canvas.width = fb.w; screen.canvas.height = fb.h; }
    fb.fill(C.paper); s.draw(fb, Math.min(t, s.dur)); fb.ox = fb.oy = 0;
    screen.putImageData(fb.img, 0, 0);
    renderCaption(s, t);
    for (const [at, name] of s.sfx) {
      const key = at + name;
      if (t >= at && !fired.has(key)) { fired.add(key); if (t - at < 0.4) Snd[name](); }
    }
    prog.style.width = (clamp(t / s.dur) * 100) + '%';
    if (!paused && t >= s.dur + 0.6) { if (idx < SCENES.length - 1) go(idx + 1); else showFinal(); }
  } else if (mode === 'final' && now - lastGrid > 40) {
    lastGrid = now;
    for (const it of grid) {
      const s = SCENES[it.i], cyc = s.dur + 2;
      const t = (now / 1000 + it.i * 2.3) % cyc;
      fb = fbFor(s);
      fb.fill(C.paper); s.draw(fb, Math.min(t, s.dur)); fb.ox = fb.oy = 0;
      it.ctx.putImageData(fb.img, 0, 0);
    }
  }
  requestAnimationFrame(frame);
}

// ---------- Controles ----------
$('start').addEventListener('click', () => { Snd.trumpet(); startStory(); go(0); });
$('prev').addEventListener('click', () => go(idx - 1));
$('next').addEventListener('click', () => { if (idx < SCENES.length - 1) go(idx + 1); else showFinal(); });
$('play').addEventListener('click', () => setPaused(!paused));
$('all').addEventListener('click', showFinal);
$('replay').addEventListener('click', () => { startStory(); go(0); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('orig').addEventListener('click', () => {
  const f = $('origFig'); f.hidden = !f.hidden;
  $('orig').textContent = f.hidden ? 'Ver el dibujo original' : 'Ocultar el dibujo original';
  if (!f.hidden) f.scrollIntoView({ behavior: 'smooth' });
});
const sndBtn = $('sound');
sndBtn.addEventListener('click', () => {
  Snd.on = !Snd.on;
  sndBtn.textContent = Snd.on ? '🔊' : '🔇';
  sndBtn.setAttribute('aria-label', Snd.on ? 'Silenciar' : 'Activar sonido');
  if (Snd.on) Snd.ensure();
  Snd.ambient(Snd.on && mode === 'story' ? SCENES[idx].amb : null);
});
$('screen').addEventListener('click', () => { if (mode === 'story') $('next').click(); });
document.addEventListener('keydown', e => {
  if (mode === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('start').click(); return; }
  if (mode !== 'story') return;
  if (e.key === 'ArrowRight') $('next').click();
  else if (e.key === 'ArrowLeft') go(idx - 1);
  else if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
});

requestAnimationFrame(frame);
