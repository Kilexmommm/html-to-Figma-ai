import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const url = 'https://mcp.figma.com/mcp/html-to-design/capture.js';
const expected = '7be9680d031d8df7dafe5e958ce8bfe17261806eb43a821574e89ee5032becda';
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`No se pudo descargar el motor: HTTP ${response.status}`);
const source = await response.text();
const actual = createHash('sha256').update(source).digest('hex');
if (actual !== expected) {
  throw new Error(`Figma cambió el motor. No se reemplazó el archivo local. Revisa la nueva versión antes de actualizar el hash.\nSHA-256 recibido: ${actual}`);
}
new Script(source);
const directory = new URL('../extension/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('capture.js', directory), source);
console.log(`Motor descargado y verificado: ${actual}`);
