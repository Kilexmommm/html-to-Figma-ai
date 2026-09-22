import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const manifest = JSON.parse(await read('extension/manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'clipboardWrite']);
assert.equal(manifest.host_permissions, undefined, 'No se necesitan permisos permanentes sobre todos los sitios.');
await access(new URL(`extension/${manifest.action.default_popup}`, root));
for (const file of ['extension/popup.js', 'extension/png.js', 'extension/capture.js']) {
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
console.log(`Correctos: manifiesto, permisos, hash del motor, referencias y ${inlineCount} script inline.`);
console.log('Estas comprobaciones son estáticas. Consulta docs/PRUEBAS.md para la prueba real de captura y descarga.');
