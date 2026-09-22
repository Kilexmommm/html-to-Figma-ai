import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCaptureError } from '../extension/errors.js';

test('un capture.js ausente se traduce al consejo de npm run setup', () => {
  const raw = "Could not load file: 'capture.js'.";
  const message = describeCaptureError(new Error(raw));
  assert.match(message, /npm run setup/);
  assert.match(message, /capture\.js/);
  assert.match(message, /Recargar en chrome:\/\/extensions/);
  assert.notEqual(message, raw);
});

test('cualquier error que mencione capture.js usa el mismo consejo', () => {
  assert.match(describeCaptureError(new Error('No se pudo inyectar capture.js en la pestaña')), /npm run setup/);
});

test('otros errores se propagan sin cambiarlos', () => {
  const raw = 'No existe un elemento con ese selector.';
  assert.equal(describeCaptureError(new Error(raw)), raw);
  assert.equal(describeCaptureError('Abre primero una página web, localhost o un archivo HTML.'),
    'Abre primero una página web, localhost o un archivo HTML.');
});

test('el error de acceso conserva su consejo sobre URLs de archivo', () => {
  const raw = 'Cannot access contents of the page.';
  const message = describeCaptureError(new Error(raw));
  assert.ok(message.startsWith(raw));
  assert.match(message, /acceso a URLs de archivo/);
});
