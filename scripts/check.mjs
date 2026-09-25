import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngInfo(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), 'La firma del PNG no es válida.');
  assert.equal(buffer.readUInt32BE(8), 13, 'El bloque IHDR debe medir 13 bytes.');
  assert.equal(buffer.subarray(12, 16).toString('latin1'), 'IHDR', 'El primer bloque debe ser IHDR.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bitDepth: buffer[24], colorType: buffer[25] };
}
const manifest = JSON.parse(await read('extension/manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'clipboardWrite', 'debugger']);
assert.equal(manifest.version, '0.5.0');
assert.equal(JSON.parse(await read('package.json')).version, manifest.version);
assert.equal(manifest.host_permissions, undefined, 'No se necesitan permisos permanentes sobre todos los sitios.');
await access(new URL(`extension/${manifest.action.default_popup}`, root));
try {
  await access(new URL('extension/capture.js', root));
} catch {
  console.error('Falta extension/capture.js. Ejecuta «npm run setup» en la carpeta del repositorio para descargar el motor de captura.');
  process.exit(1);
}
for (const file of ['extension/popup.js', 'extension/png.js', 'extension/errors.js', 'extension/capture.js']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(file, root))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  console.log(`Sintaxis correcta: ${file}`);
}
const capture = await read('extension/capture.js');
assert.equal(createHash('sha256').update(capture).digest('hex'), '7be9680d031d8df7dafe5e958ce8bfe17261806eb43a821574e89ee5032becda');
assert.match(capture, /window\.figma\.captureForDesign=/);
assert.doesNotMatch(await read('extension/popup.js'), /__clipboardFlow|installFontInterceptor/);
let inlineCount = 0;
for (const file of ['extension/popup.html', 'fixtures/prueba.html']) {
  const html = await read(file);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = match[1].match(/src="([^"]+)"/);
    if (src) await access(new URL(src[1], new URL(file, root)));
    else { new Script(match[2], { filename: file }); inlineCount++; }
  }
}
const iconSizes = [16, 32, 48, 128];
const expectedIcons = Object.fromEntries(iconSizes.map(size => [String(size), `icons/icon${size}.png`]));
assert.deepEqual(manifest.icons, expectedIcons, 'El manifiesto debe declarar los cuatro iconos.');
assert.deepEqual(manifest.action.default_icon, expectedIcons, 'action.default_icon debe apuntar a los cuatro iconos.');
for (const size of iconSizes) {
  const buffer = await readFile(new URL(`extension/icons/icon${size}.png`, root));
  const info = pngInfo(buffer);
  assert.equal(info.width, size, `icon${size}.png debe medir ${size} px de ancho.`);
  assert.equal(info.height, size, `icon${size}.png debe medir ${size} px de alto.`);
  assert.equal(info.bitDepth, 8);
  assert.equal(info.colorType, 6);
  console.log(`Icono válido: icon${size}.png ${info.width}×${info.height} px, RGBA de 8 bits.`);
}
console.log(`Correctos: manifiesto, permisos, hash del motor, referencias, ${iconSizes.length} iconos y ${inlineCount} script inline.`);
console.log('Estas comprobaciones son estáticas. Consulta docs/PRUEBAS.md para la prueba real de captura y descarga.');
