/**
 * Premium icon generator for Twitch, Prime Video & YouTube ad skipper extensions.
 * Renders gradient backgrounds, symbol glow, drop shadows, and glass overlay.
 * Anti-aliased via 4× supersampling. Pure Node.js — no external dependencies.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── Platform colour configs ───────────────────────────────────────

const PLATFORMS = {
  twitch: {
    dir: path.join(__dirname, '..', 'packages', 'extension-twitch', 'src', 'icons'),
    bgA: [168, 85, 247],   bgB: [88, 28, 135],      // #A855F7 → #581C87
    glow: [192, 132, 252],                            // #C084FC
    symA: [255, 255, 255],  symB: [233, 213, 255],   // #FFF → #E9D5FF
    shad: [30, 10, 60],                               // shadow tint
  },
  prime: {
    dir: path.join(__dirname, '..', 'packages', 'extension-prime', 'src', 'icons'),
    bgA: [14, 165, 233],   bgB: [30, 58, 95],        // #0EA5E9 → #1E3A5F
    glow: [56, 189, 248],                             // #38BDF8
    symA: [255, 255, 255],  symB: [186, 230, 253],   // #FFF → #BAE6FD
    shad: [12, 30, 51],                               // shadow tint
  },
  youtube: {
    dir: path.join(__dirname, '..', 'packages', 'extension-youtube', 'src', 'icons'),
    bgA: [239, 68, 68],    bgB: [127, 29, 29],       // #EF4444 → #7F1D1D
    glow: [252, 165, 165],                            // #FCA5A5
    symA: [255, 255, 255],  symB: [254, 202, 202],   // #FFF → #FECACA
    shad: [59, 0, 0],                                 // shadow tint
  },
};

const SIZES = [16, 48, 128];
const SS = 4; // supersampling factor

// ─── Utilities ─────────────────────────────────────────────────────

const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix   = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ─── Pixel buffer with Porter-Duff "over" compositing ──────────────

class Buf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float64Array(w * h * 4);
  }

  set(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) << 2;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) << 2;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }

  over(x, y, sr, sg, sb, sa) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || sa <= 0) return;
    const i = (y * this.w + x) << 2;
    const sA = sa / 255, dA = this.d[i + 3] / 255;
    const oA = sA + dA * (1 - sA);
    if (oA <= 0) return;
    this.d[i]     = (sr * sA + this.d[i]     * dA * (1 - sA)) / oA;
    this.d[i + 1] = (sg * sA + this.d[i + 1] * dA * (1 - sA)) / oA;
    this.d[i + 2] = (sb * sA + this.d[i + 2] * dA * (1 - sA)) / oA;
    this.d[i + 3] = oA * 255;
  }

  comp(src) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) << 2;
        if (src.d[i + 3] > 0)
          this.over(x, y, src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]);
      }
  }

  down(f) {
    const nw = (this.w / f) | 0, nh = (this.h / f) | 0, f2 = f * f;
    const out = new Buf(nw, nh);
    for (let dy = 0; dy < nh; dy++)
      for (let dx = 0; dx < nw; dx++) {
        let tr = 0, tg = 0, tb = 0, ta = 0;
        for (let sy = 0; sy < f; sy++)
          for (let sx = 0; sx < f; sx++) {
            const i = ((dy * f + sy) * this.w + dx * f + sx) << 2;
            tr += this.d[i]; tg += this.d[i + 1]; tb += this.d[i + 2]; ta += this.d[i + 3];
          }
        out.set(dx, dy, tr / f2, tg / f2, tb / f2, ta / f2);
      }
    return out;
  }

  toU8() {
    const buf = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < buf.length; i++)
      buf[i] = clamp(Math.round(this.d[i]), 0, 255);
    return buf;
  }
}

// ─── Shape primitives ──────────────────────────────────────────────

function inRR(lx, ly, w, h, r) {
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
  if (lx < r && ly < r) return (lx - r) ** 2 + (ly - r) ** 2 <= r * r;
  if (lx >= w - r && ly < r) return (lx - w + r + 1) ** 2 + (ly - r) ** 2 <= r * r;
  if (lx < r && ly >= h - r) return (lx - r) ** 2 + (ly - h + r + 1) ** 2 <= r * r;
  if (lx >= w - r && ly >= h - r) return (lx - w + r + 1) ** 2 + (ly - h + r + 1) ** 2 <= r * r;
  return true;
}

function drawRR(buf, ox, oy, w, h, r, fn) {
  const x0 = Math.max(0, ox), y0 = Math.max(0, oy);
  const x1 = Math.min(buf.w, ox + w), y1 = Math.min(buf.h, oy + h);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (inRR(x - ox, y - oy, w, h, r)) {
        const c = fn(x, y);
        buf.over(x, y, c[0], c[1], c[2], c[3]);
      }
}

function pit(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function dSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function dTri(px, py, ax, ay, bx, by, cx, cy) {
  if (pit(px, py, ax, ay, bx, by, cx, cy)) return 0;
  return Math.min(dSeg(px, py, ax, ay, bx, by), dSeg(px, py, bx, by, cx, cy), dSeg(px, py, cx, cy, ax, ay));
}

function drawTri(buf, ax, ay, bx, by, cx, cy, r, fn) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - r));
  const x1 = Math.min(buf.w - 1, Math.ceil(Math.max(ax, bx, cx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - r));
  const y1 = Math.min(buf.h - 1, Math.ceil(Math.max(ay, by, cy) + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (dTri(x, y, ax, ay, bx, by, cx, cy) <= r) {
        const c = fn(x, y);
        buf.over(x, y, c[0], c[1], c[2], c[3]);
      }
}

// ─── Bezier curve stroke ───────────────────────────────────────────

function drawBezier(buf, p0x, p0y, p1x, p1y, p2x, p2y, thick, fn) {
  const N = 100, ht = thick / 2;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, mt = 1 - t;
    pts.push([mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x,
              mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y]);
  }
  const x0 = Math.max(0, Math.floor(Math.min(p0x, p1x, p2x) - ht));
  const x1 = Math.min(buf.w - 1, Math.ceil(Math.max(p0x, p1x, p2x) + ht));
  const y0 = Math.max(0, Math.floor(Math.min(p0y, p1y, p2y) - ht));
  const y1 = Math.min(buf.h - 1, Math.ceil(Math.max(p0y, p1y, p2y) + ht));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let md = Infinity;
      for (const [sx, sy] of pts) { const d = Math.hypot(x - sx, y - sy); if (d < md) md = d; }
      if (md <= ht) { const c = fn(x, y); buf.over(x, y, c[0], c[1], c[2], c[3]); }
    }
}

function drawCircle(buf, cx, cy, r, fn) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(buf.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(buf.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (Math.hypot(x - cx, y - cy) <= r) {
        const c = fn(x, y); buf.over(x, y, c[0], c[1], c[2], c[3]);
      }
}

// ─── Blur (3× box blur ≈ Gaussian) ────────────────────────────────

function boxBlur(buf, rad) {
  const { w, h, d } = buf;
  const diam = 2 * rad + 1;
  const tmp = new Float64Array(w * h * 4);

  // horizontal pass
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = -rad; k <= rad; k++) {
        const i = (y * w + clamp(x + k, 0, w - 1)) << 2;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3];
      }
      const j = (y * w + x) << 2;
      tmp[j] = r / diam; tmp[j + 1] = g / diam; tmp[j + 2] = b / diam; tmp[j + 3] = a / diam;
    }

  // vertical pass
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = -rad; k <= rad; k++) {
        const i = (clamp(y + k, 0, h - 1) * w + x) << 2;
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; a += tmp[i + 3];
      }
      const j = (y * w + x) << 2;
      d[j] = r / diam; d[j + 1] = g / diam; d[j + 2] = b / diam; d[j + 3] = a / diam;
    }
}

function gBlur(buf, sigma) {
  const r = Math.max(1, Math.round(sigma));
  boxBlur(buf, r);
  boxBlur(buf, r);
  boxBlur(buf, r);
}

// ─── Render one icon ───────────────────────────────────────────────

function render(key, size) {
  const p = PLATFORMS[key];
  const S = size * SS;
  const sc = S / 128;
  const canvas = new Buf(S, S);
  const cornerR = Math.round(28 * sc);

  // 1. Background gradient (diagonal top-left → bottom-right)
  drawRR(canvas, 0, 0, S, S, cornerR, (x, y) => {
    const t = clamp((x + y) / (2 * S), 0, 1);
    return [...mix(p.bgA, p.bgB, t), 255];
  });

  // 2. Radial glow hotspot (upper-left)
  drawRR(canvas, 0, 0, S, S, cornerR, (x, y) => {
    const d = Math.hypot(x - 0.35 * S, y - 0.35 * S) / (0.65 * S);
    return [...p.glow, clamp(1 - d, 0, 1) * 77];
  });

  // 3. Symbol geometry (in supersampled coordinates)
  const chevrons = [
    [29 * sc, 36 * sc, 59 * sc, 64 * sc, 29 * sc, 92 * sc],
    [55 * sc, 36 * sc, 85 * sc, 64 * sc, 55 * sc, 92 * sc],
  ];
  const barX = Math.round(91 * sc), barY = Math.round(36 * sc);
  const barW = Math.round(9 * sc),  barH = Math.round(56 * sc);
  const barR = Math.round(4.5 * sc);
  const symR = Math.round(3 * sc); // Minkowski radius for rounded chevrons

  // 3b. Twitch Glitch face behind symbol (looking upper-right)
  if (key === 'twitch') {
    // Face rect (very faint)
    drawRR(canvas, Math.round(82 * sc), Math.round(10 * sc),
      Math.round(34 * sc), Math.round(34 * sc), Math.round(5 * sc),
      () => [255, 255, 255, 23]);   // ~9%
    // Face outline: left edge + bottom edge
    const lnC = () => [255, 255, 255, 51]; // ~20%
    // Left edge (diagonal top: upper-right slant)
    drawTri(canvas, 83*sc,18*sc, 89*sc,14*sc, 89*sc,38*sc, 0, lnC);
    drawTri(canvas, 83*sc,18*sc, 89*sc,38*sc, 83*sc,38*sc, 0, lnC);
    // Bottom edge (diagonal right: upper-right slant)
    drawTri(canvas, 83*sc,38*sc, 112*sc,38*sc, 108*sc,44*sc, 0, lnC);
    drawTri(canvas, 83*sc,38*sc, 108*sc,44*sc, 83*sc,44*sc, 0, lnC);
    // Eyes — shifted to upper-right of face, narrow gap
    const ew = Math.round(2 * sc), eh = Math.round(9 * sc), er = Math.round(0.8 * sc);
    drawRR(canvas, Math.round(99 * sc), Math.round(18 * sc), ew, eh, er,
      () => [255, 255, 255, 51]);   // ~20%
    drawRR(canvas, Math.round(105 * sc), Math.round(18 * sc), ew, eh, er,
      () => [255, 255, 255, 51]);
  }

  // 3c. Prime smile behind symbol (mouth arc + dimple)
  if (key === 'prime') {
    const smC = () => [255, 255, 255, 51]; // ~20%
    // Background rect
    drawRR(canvas, Math.round(82 * sc), Math.round(10 * sc),
      Math.round(34 * sc), Math.round(34 * sc), Math.round(5 * sc),
      () => [255, 255, 255, 23]);   // ~9%
    // Letter "P" via CSG: outer rounded-rect bowl - inner hole + stem below
    // Right-only rounded rect test
    const inRRR = (px, py, rx, ry, rw, rh, cr) => {
      const lx = px - rx, ly = py - ry;
      if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) return false;
      if (lx >= rw - cr && ly < cr)
        return (lx - (rw - cr)) ** 2 + (ly - cr) ** 2 <= cr * cr;
      if (lx >= rw - cr && ly >= rh - cr)
        return (lx - (rw - cr)) ** 2 + (ly - (rh - cr)) ** 2 <= cr * cr;
      return true;
    };
    const bx0 = Math.floor(90 * sc), bx1 = Math.ceil(108 * sc);
    const by0 = Math.floor(14 * sc), by1 = Math.ceil(40 * sc);
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++) {
        const inOuter = inRRR(x, y, 90*sc, 14*sc, 18*sc, 16*sc, 6*sc);
        const inHole  = inRRR(x, y, 95*sc, 18*sc, 9*sc, 8*sc, 4*sc);
        const inStem  = x >= 90*sc && x < 95*sc && y >= 30*sc && y < 40*sc;
        if ((inOuter && !inHole) || inStem)
          canvas.over(x, y, 255, 255, 255, 51);
      }
  }

  // 3d. YouTube play button behind symbol
  if (key === 'youtube') {
    // Rounded rectangle (play button background)
    drawRR(canvas, Math.round(82 * sc), Math.round(12 * sc),
      Math.round(34 * sc), Math.round(24 * sc), Math.round(6 * sc),
      () => [255, 255, 255, 38]);   // ~15%
    // Play triangle inside
    const tx1 = 94 * sc, ty1 = 17 * sc;
    const tx2 = 94 * sc, ty2 = 33 * sc;
    const tx3 = 107 * sc, ty3 = 25 * sc;
    drawTri(canvas, tx1, ty1, tx2, ty2, tx3, ty3, 0,
      () => [255, 255, 255, 51]);   // ~20%
  }

  // 4. Symbol aura glow
  const aura = new Buf(S, S);
  const auraR = symR + Math.round(2 * sc);
  const auraFn = () => [...p.glow, 90];
  for (const c of chevrons) drawTri(aura, c[0], c[1], c[2], c[3], c[4], c[5], auraR, auraFn);
  drawRR(aura, barX - 1, barY - 1, barW + 2, barH + 2, barR + 1, auraFn);
  gBlur(aura, 5 * sc);
  canvas.comp(aura);

  // 5. Drop shadow (offset down 2px in design space)
  const shadow = new Buf(S, S);
  const shOff = Math.round(2 * sc);
  const shFn = () => [...p.shad, 128];
  for (const c of chevrons)
    drawTri(shadow, c[0], c[1] + shOff, c[2], c[3] + shOff, c[4], c[5] + shOff, symR, shFn);
  drawRR(shadow, barX, barY + shOff, barW, barH, barR, shFn);
  gBlur(shadow, 2.5 * sc);
  canvas.comp(shadow);

  // 6. Main symbol (white → tinted gradient, top to bottom)
  const symFn = (x, y) => {
    const t = clamp((y / S - 36 / 128) / (56 / 128), 0, 1);
    return [...mix(p.symA, p.symB, t), 255];
  };
  for (const c of chevrons) drawTri(canvas, c[0], c[1], c[2], c[3], c[4], c[5], symR, symFn);
  drawRR(canvas, barX, barY, barW, barH, barR, symFn);

  // 7. Glass overlay (top-half highlight)
  drawRR(canvas, 0, 0, S, S, cornerR, (x, y) => {
    const t = y / S;
    const a = t < 0.4 ? lerp(0.15, 0.03, t / 0.4)
            : t < 0.5 ? lerp(0.03, 0, (t - 0.4) / 0.1)
            : 0;
    return [255, 255, 255, a * 255];
  });

  // 8. Downsample for anti-aliasing
  return canvas.down(SS);
}

// ─── PNG encoder ───────────────────────────────────────────────────

function encodePNG(pixels, width, height) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // no filter
    pixels.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw);
  const chunks = [];
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); // signature

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  chunks.push(makeChunk('IHDR', ihdr));
  chunks.push(makeChunk('IDAT', compressed));
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])) >>> 0, 0);
  return Buffer.concat([len, tb, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return crc ^ 0xFFFFFFFF;
}

// ─── Generate all icons ────────────────────────────────────────────

console.log('Generating premium icons...\n');

for (const [key, p] of Object.entries(PLATFORMS)) {
  if (!fs.existsSync(p.dir)) fs.mkdirSync(p.dir, { recursive: true });

  for (const size of SIZES) {
    const t0 = Date.now();
    const result = render(key, size);
    const png = encodePNG(result.toU8(), size, size);
    const outPath = path.join(p.dir, `icon-${size}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`  ${key}/icon-${size}.png  (${png.length} bytes, ${Date.now() - t0}ms)`);
  }
  console.log();
}

console.log('Done!');
