/**
 * Generate PNG icon files for the extension.
 * Creates simple fast-forward icon at 16, 48, 128 sizes.
 * Pure Node.js - no external dependencies needed.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT_DIR = path.join(__dirname, '..', 'packages', 'extension', 'src', 'icons');

// Colors
const BG = [26, 26, 46, 255];       // #1a1a2e
const FG = [155, 89, 182, 255];     // #9b59b6

function createPNG(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cornerRadius = Math.round(size * 0.156); // ~20/128

  // Fill background with rounded corners
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (isInsideRoundedRect(x, y, size, size, cornerRadius)) {
        pixels[idx] = BG[0];
        pixels[idx + 1] = BG[1];
        pixels[idx + 2] = BG[2];
        pixels[idx + 3] = BG[3];
      } else {
        pixels[idx + 3] = 0; // transparent
      }
    }
  }

  // Draw fast-forward icon (two triangles + bar)
  // Scale coordinates from 128-space to actual size
  const s = size / 128;

  // First triangle: points 20,28 -> 62,64 -> 20,100
  fillTriangle(pixels, size,
    Math.round(20 * s), Math.round(28 * s),
    Math.round(62 * s), Math.round(64 * s),
    Math.round(20 * s), Math.round(100 * s),
    FG);

  // Second triangle: points 62,28 -> 104,64 -> 62,100
  fillTriangle(pixels, size,
    Math.round(62 * s), Math.round(28 * s),
    Math.round(104 * s), Math.round(64 * s),
    Math.round(62 * s), Math.round(100 * s),
    FG);

  // Bar: rect at 104,28 w=8 h=72
  fillRect(pixels, size,
    Math.round(104 * s), Math.round(28 * s),
    Math.round(8 * s), Math.round(72 * s),
    FG);

  return encodePNG(pixels, size, size);
}

function isInsideRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  // Check corners
  if (x < r && y < r) return distSq(x, y, r, r) <= r * r;
  if (x >= w - r && y < r) return distSq(x, y, w - r - 1, r) <= r * r;
  if (x < r && y >= h - r) return distSq(x, y, r, h - r - 1) <= r * r;
  if (x >= w - r && y >= h - r) return distSq(x, y, w - r - 1, h - r - 1) <= r * r;
  return true;
}

function distSq(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

function fillTriangle(pixels, size, x1, y1, x2, y2, x3, y3, color) {
  const minX = Math.max(0, Math.min(x1, x2, x3));
  const maxX = Math.min(size - 1, Math.max(x1, x2, x3));
  const minY = Math.max(0, Math.min(y1, y2, y3));
  const maxY = Math.min(size - 1, Math.max(y1, y2, y3));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInTriangle(x, y, x1, y1, x2, y2, x3, y3)) {
        const idx = (y * size + x) * 4;
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = color[3];
      }
    }
  }
}

function pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = sign(px, py, x1, y1, x2, y2);
  const d2 = sign(px, py, x2, y2, x3, y3);
  const d3 = sign(px, py, x3, y3, x1, y1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function sign(px, py, x1, y1, x2, y2) {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

function fillRect(pixels, size, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const idx = (py * size + px) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = color[3];
    }
  }
}

function encodePNG(pixels, width, height) {
  // Create raw image data with filter byte per row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // No filter
    pixels.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw);

  // Build PNG
  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBytes, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0, 0);

  return Buffer.concat([len, typeBytes, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

// Generate icons
for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  const outPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
