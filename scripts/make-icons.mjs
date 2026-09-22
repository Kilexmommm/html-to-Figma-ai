import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ORANGE = [255, 106, 0];
const SUPERSAMPLE = 8;
const SIZES = [16, 32, 48, 128];
const outputDir = fileURLToPath(new URL('../extension/icons/', import.meta.url));

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function layout(size) {
  const stroke = Math.max(0.075, 2 / size);
  const dotRadius = Math.max(0.065, 1.8 / size);
  const gap = Math.max(0.045, 1.6 / size);
  const width = 0.44;
  const radius = width / 2;
  const left = (1 - (width + gap + 2 * dotRadius)) / 2;
  const archCenterY = 0.42 + radius;
  return {
    left,
    right: left + width,
    stroke,
    radius,
    innerRadius: radius - stroke,
    archCenterY,
    yTop: 0.18,
    yBottom: 0.82,
    dotX: left + width + gap + dotRadius,
    dotY: 0.82 - dotRadius,
    dotRadius
  };
}

function insideGlyph(x, y, g) {
  if (x >= g.left && x <= g.left + g.stroke && y >= g.yTop && y <= g.yBottom) return true;
  if (x >= g.right - g.stroke && x <= g.right && y >= g.archCenterY && y <= g.yBottom) return true;
  const ax = x - g.left - g.radius;
  const ay = y - g.archCenterY;
  const arch = ax * ax + ay * ay;
  if (y <= g.archCenterY && arch >= g.innerRadius * g.innerRadius && arch <= g.radius * g.radius) return true;
  const dx = x - g.dotX;
  const dy = y - g.dotY;
  return dx * dx + dy * dy <= g.dotRadius * g.dotRadius;
}

function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const total = size * SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const glyph = layout(size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const y = (py * SUPERSAMPLE + sy + 0.5) / total;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px * SUPERSAMPLE + sx + 0.5) / total;
          if (insideGlyph(x, y, glyph)) covered++;
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = ORANGE[0];
      pixels[offset + 1] = ORANGE[1];
      pixels[offset + 2] = ORANGE[2];
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return pixels;
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const start = y * (stride + 1);
    raw[start] = 0;
    pixels.copy(raw, start + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync(outputDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderPixels(size));
  writeFileSync(join(outputDir, `icon${size}.png`), png);
  console.log(`icon${size}.png ${size}x${size} ${png.length} bytes`);
}
