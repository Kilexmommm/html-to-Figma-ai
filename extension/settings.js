export const DEFAULT_SETTINGS = Object.freeze({
  fullPage: false,
  scale: 2,
  viewportMode: 'auto',
  viewportWidth: 1900,
  viewportHeight: 3000
});

export const SETTINGS_KEY = 'html-to-figma.capture-settings';

export function validateSettings(settings) {
  if (typeof settings?.fullPage !== 'boolean') throw new Error('Selecciona si quieres capturar el área visible o la página completa.');
  if (![1, 2].includes(settings.scale)) throw new Error('La escala debe ser 1× o 2×.');
  if (!['auto', 'custom'].includes(settings.viewportMode)) throw new Error('El viewport debe ser automático o personalizado.');
  if (settings.fullPage && settings.viewportMode === 'custom') {
    for (const [key, label] of [['viewportWidth', 'Ancho CSS'], ['viewportHeight', 'Alto CSS']]) {
      const value = settings[key];
      if (!Number.isInteger(value) || value < 200 || value > 16384) {
        throw new Error(`${label} debe ser un entero entre 200 y 16384 px.`);
      }
    }
  }
  return { ...settings };
}

export function loadSettings(storage) {
  try {
    const stored = storage?.getItem(SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    return validateSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  const validated = validateSettings(settings);
  storage.setItem(SETTINGS_KEY, JSON.stringify(validated));
  return validated;
}
