/**
 * Generate the PWA icons locally.
 *
 * No image libraries, no network, no external services: the SVG is written
 * directly and the PNGs are encoded by hand (uncompressed-deflate PNG writer),
 * so `npm run icons` works on a clean checkout with zero extra dependencies.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, { recursive: true });

/* ------------------------------------------------------------------ */
/* SVG                                                                 */
/* ------------------------------------------------------------------ */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="RogueDay">
  <defs>
    <radialGradient id="glow" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#a855f7" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#05070d" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="blade" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0e7490"/>
      <stop offset="50%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#a5f3fc"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="112" fill="#05070d"/>
  <rect width="512" height="512" rx="112" fill="url(#glow)"/>
  <rect x="8" y="8" width="496" height="496" rx="106" fill="none"
        stroke="#22d3ee" stroke-opacity="0.32" stroke-width="3"/>

  <!-- die face: the roll that starts every quest -->
  <rect x="150" y="150" width="212" height="212" rx="38" fill="none"
        stroke="#22d3ee" stroke-width="10" stroke-opacity="0.85"/>
  <circle cx="205" cy="205" r="17" fill="#67e8f9"/>
  <circle cx="307" cy="205" r="17" fill="#d946ef"/>
  <circle cx="256" cy="256" r="17" fill="#67e8f9"/>
  <circle cx="205" cy="307" r="17" fill="#d946ef"/>
  <circle cx="307" cy="307" r="17" fill="#67e8f9"/>

  <!-- blade across the die -->
  <path d="M124 388 L388 124" stroke="url(#blade)" stroke-width="14" stroke-linecap="round" opacity="0.9"/>
  <path d="M124 388 L162 388 L162 350 Z" fill="#a5f3fc" opacity="0.9"/>
</svg>
`;

writeFileSync(resolve(outDir, 'icon.svg'), SVG, 'utf8');

/* ------------------------------------------------------------------ */
/* PNG writer                                                          */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Write an RGBA pixel buffer as a PNG. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Rasteriser - draws the same motif as the SVG                        */
/* ------------------------------------------------------------------ */

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 512; // scale factor from the 512 design grid

  const put = (x, y, [r, g, b], alpha) => {
    if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
    const i = (y * size + x) * 4;
    const a = Math.min(1, alpha);
    rgba[i] = Math.round(rgba[i] * (1 - a) + r * a);
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - a) + g * a);
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - a) + b * a);
    rgba[i + 3] = Math.max(rgba[i + 3], Math.round(255 * a));
  };

  const CYAN = [34, 211, 238];
  const CYAN_LIGHT = [165, 243, 252];
  const MAGENTA = [217, 70, 239];
  const BG = [5, 7, 13];

  // rounded-rect background with a radial cyan glow
  const radius = 112 * s;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!insideRoundedRect(x, y, size, radius)) continue;
      put(x, y, BG, 1);

      const dx = (x - size / 2) / (size * 0.62);
      const dy = (y - size * 0.38) / (size * 0.62);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        const t = 1 - dist;
        put(x, y, [34, 130, 200], 0.4 * t * t);
      }
    }
  }

  // die outline
  strokeRoundedRect(put, 150 * s, 150 * s, 212 * s, 212 * s, 38 * s, 10 * s, CYAN, 0.9);

  // pips
  const pips = [
    [205, 205, CYAN_LIGHT],
    [307, 205, MAGENTA],
    [256, 256, CYAN_LIGHT],
    [205, 307, MAGENTA],
    [307, 307, CYAN_LIGHT],
  ];
  for (const [cx, cy, colour] of pips) {
    fillCircle(put, cx * s, cy * s, 17 * s, colour);
  }

  // blade
  strokeLine(put, 124 * s, 388 * s, 388 * s, 124 * s, 14 * s, CYAN_LIGHT, 0.95);

  return rgba;
}

function insideRoundedRect(x, y, size, radius) {
  const inset = 0;
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;

  if (x < left || y < top || x >= right || y >= bottom) return false;

  const corners = [
    [left + radius, top + radius, x < left + radius && y < top + radius],
    [right - radius, top + radius, x > right - radius && y < top + radius],
    [left + radius, bottom - radius, x < left + radius && y > bottom - radius],
    [right - radius, bottom - radius, x > right - radius && y > bottom - radius],
  ];

  for (const [cx, cy, applies] of corners) {
    if (!applies) continue;
    return Math.hypot(x - cx, y - cy) <= radius;
  }
  return true;
}

function fillCircle(put, cx, cy, r, colour) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r - 0.5) put(x, y, colour, 1);
      else if (d < r + 0.5) put(x, y, colour, r + 0.5 - d);
    }
  }
}

function strokeRoundedRect(put, x0, y0, w, h, radius, thickness, colour, alpha) {
  const half = thickness / 2;
  for (let y = Math.floor(y0 - thickness); y <= Math.ceil(y0 + h + thickness); y += 1) {
    for (let x = Math.floor(x0 - thickness); x <= Math.ceil(x0 + w + thickness); x += 1) {
      const d = Math.abs(roundedRectDistance(x, y, x0, y0, w, h, radius));
      if (d <= half) put(x, y, colour, alpha);
      else if (d < half + 1) put(x, y, colour, alpha * (half + 1 - d));
    }
  }
}

/** Signed distance from a point to a rounded rectangle's outline. */
function roundedRectDistance(px, py, x0, y0, w, h, radius) {
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - radius);
  const qy = Math.abs(py - cy) - (h / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function strokeLine(put, x1, y1, x2, y2, thickness, colour, alpha) {
  const half = thickness / 2;
  const minX = Math.floor(Math.min(x1, x2) - thickness);
  const maxX = Math.ceil(Math.max(x1, x2) + thickness);
  const minY = Math.floor(Math.min(y1, y2) - thickness);
  const maxY = Math.ceil(Math.max(y1, y2) + thickness);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d = pointSegmentDistance(x, y, x1, y1, x2, y2);
      if (d <= half) put(x, y, colour, alpha);
      else if (d < half + 1) put(x, y, colour, alpha * (half + 1 - d));
    }
  }
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ------------------------------------------------------------------ */

for (const size of [192, 512]) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(resolve(outDir, `icon-${size}.png`), png);
  console.log(`icons/icon-${size}.png (${png.length} bytes)`);
}

console.log('icons/icon.svg');
