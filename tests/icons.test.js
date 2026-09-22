import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZES = [16, 32, 48, 128];
const iconPath = size => fileURLToPath(new URL(`../extension/icons/icon${size}.png`, import.meta.url));

function parseChunks(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), 'Firma PNG no válida.');
  const chunks = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function decodePng(buffer) {
  const chunks = parseChunks(buffer);
  assert.equal(chunks[0].type, 'IHDR', 'El primer bloque debe ser IHDR.');
  const header = chunks[0].data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  assert.ok(channels > 0, 'Tipo de color PNG no soportado en el test.');
  const idat = Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data));
  const raw = inflateSync(idat);
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const current = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? current[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) current[i] = (current[i] + a) & 255;
      else if (filter === 2) current[i] = (current[i] + b) & 255;
      else if (filter === 3) current[i] = (current[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        current[i] = (current[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    current.copy(pixels, y * stride);
    previous = current;
  }
  return { width, height, bitDepth, colorType, channels, pixels };
}

test('los cuatro iconos tienen cabecera PNG válida y las dimensiones esperadas', () => {
  for (const size of SIZES) {
    const info = decodePng(readFileSync(iconPath(size)));
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.equal(info.bitDepth, 8);
    assert.equal(info.colorType, 6);
  }
});

function countOrange(info) {
  let orange = 0;
  for (let i = 0; i < info.pixels.length; i += info.channels) {
    if (info.pixels[i] > 200 && info.pixels[i + 1] > 60 && info.pixels[i + 1] < 160 && info.pixels[i + 2] < 60 && info.pixels[i + 3] > 200) orange++;
  }
  return orange;
}

test('el icono de 128 px contiene píxeles naranjas opacos', () => {
  const info = decodePng(readFileSync(iconPath(128)));
  assert.ok(countOrange(info) > 200, 'Se esperaban píxeles naranjas en el icono.');
});

test('el icono de 16 px conserva suficientes píxeles naranjas opacos para leerse', () => {
  const info = decodePng(readFileSync(iconPath(16)));
  assert.ok(countOrange(info) >= 30, 'A 16 px se esperaban al menos 30 píxeles naranjas opacos.');
});

test('la h y el punto no se fusionan: hay una columna tenue que los separa', () => {
  for (const size of [16, 32, 48, 128]) {
    const info = decodePng(readFileSync(iconPath(size)));
    let first = -1;
    let last = -1;
    for (let x = 0; x < info.width; x++) {
      let inked = false;
      for (let y = 0; y < info.height; y++) {
        if (info.pixels[(y * info.width + x) * info.channels + 3] > 0) { inked = true; break; }
      }
      if (inked) { if (first < 0) first = x; last = x; }
    }
    let faintest = 256;
    for (let x = first + 1; x < last; x++) {
      let columnMax = 0;
      for (let y = 0; y < info.height; y++) {
        const alpha = info.pixels[(y * info.width + x) * info.channels + 3];
        if (alpha > columnMax) columnMax = alpha;
      }
      if (columnMax < faintest) faintest = columnMax;
    }
    assert.ok(faintest <= 128, `En ${size} px la h y el punto se fusionan (columna más tenue: ${faintest}).`);
  }
});

test('la h y el punto naranjas aparecen a izquierda y derecha del icono', () => {
  const info = decodePng(readFileSync(iconPath(128)));
  let left = 0;
  let right = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const isOrange = info.pixels[i] > 200 && info.pixels[i + 1] > 60 && info.pixels[i + 1] < 160 && info.pixels[i + 2] < 60 && info.pixels[i + 3] > 200;
      if (isOrange) (x < info.width / 2 ? left++ : right++);
    }
  }
  assert.ok(left > 100, 'La h debe aportar píxeles naranjas en la mitad izquierda.');
  assert.ok(right > 100, 'El punto debe aportar píxeles naranjas en la mitad derecha.');
});
