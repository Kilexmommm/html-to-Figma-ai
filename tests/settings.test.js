import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, validateSettings } from '../extension/settings.js';

function fakeStorage(initial) {
  const values = new Map(initial ? [[SETTINGS_KEY, initial]] : []);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('configuración inicial usa viewport automático y valores de ejemplo', () => {
  assert.deepEqual(loadSettings(fakeStorage()), {
    fullPage: false,
    scale: 2,
    viewportMode: 'auto',
    viewportWidth: 1900,
    viewportHeight: 3000
  });
  assert.deepEqual(DEFAULT_SETTINGS, loadSettings(fakeStorage()));
});

test('preferencia completa sobrevive el round-trip del almacenamiento inyectado', () => {
  const storage = fakeStorage();
  const preference = {
    fullPage: true,
    scale: 1,
    viewportMode: 'custom',
    viewportWidth: 1900,
    viewportHeight: 3000
  };
  assert.deepEqual(saveSettings(storage, preference), preference);
  assert.deepEqual(loadSettings(storage), preference);
});

test('rechaza viewport fraccionario, fuera de rango o escala inválida', () => {
  for (const invalid of [
    { viewportWidth: 199 },
    { viewportWidth: 16385 },
    { viewportHeight: 200.5 },
    { scale: 3 }
  ]) {
    const settings = { ...DEFAULT_SETTINGS, fullPage: true, viewportMode: 'custom', ...invalid };
    assert.throws(() => validateSettings(settings));
    assert.throws(() => saveSettings(fakeStorage(), settings));
  }
});

test('viewport custom inválido no bloquea capturar el área visible', () => {
  assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, viewportWidth: 199 }));
});

test('configuración guardada corrupta vuelve a valores predeterminados', () => {
  assert.deepEqual(loadSettings(fakeStorage('{mal json')), DEFAULT_SETTINGS);
});
