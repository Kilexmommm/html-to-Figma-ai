import { captureFullPagePng, capturePng, copyPngToClipboard } from './png.js';
import { describeCaptureError } from './errors.js';
import { loadSettings, saveSettings, validateSettings } from './settings.js';

const button = document.querySelector('#capture');
const pngButton = document.querySelector('#capture-png');
const copyButton = document.querySelector('#copy-png');
const saveLink = document.querySelector('#save-image');
const fullPageToggle = document.querySelector('#full-page');
const resolution = document.querySelector('#resolution');
const viewportOptions = document.querySelector('#viewport-options');
const viewportMode = document.querySelector('#viewport-mode');
const viewportFields = document.querySelector('#viewport-fields');
const viewportWidth = document.querySelector('#viewport-width');
const viewportHeight = document.querySelector('#viewport-height');
const status = document.querySelector('#status');
const settingsStorage = window.localStorage;
let downloadUrl;

function readControls() {
  return {
    fullPage: fullPageToggle.checked,
    scale: Number(resolution.value),
    viewportMode: viewportMode.value,
    viewportWidth: Number(viewportWidth.value),
    viewportHeight: Number(viewportHeight.value)
  };
}

function updateViewportControls() {
  viewportOptions.hidden = !fullPageToggle.checked;
  viewportFields.hidden = viewportMode.value !== 'custom';
  viewportMode.disabled = !fullPageToggle.checked || button.disabled;
  viewportWidth.disabled = viewportFields.hidden || button.disabled;
  viewportHeight.disabled = viewportFields.hidden || button.disabled;
}

function persistControls() {
  try {
    saveSettings(settingsStorage, readControls());
  } catch (error) {
    status.textContent = `Configuración no guardada: ${error.message}`;
  }
}

const savedSettings = loadSettings(settingsStorage);
fullPageToggle.checked = savedSettings.fullPage;
resolution.value = String(savedSettings.scale);
viewportMode.value = savedSettings.viewportMode;
viewportWidth.value = String(savedSettings.viewportWidth);
viewportHeight.value = String(savedSettings.viewportHeight);
updateViewportControls();

function setBusy(busy) {
  button.disabled = busy;
  pngButton.disabled = busy;
  copyButton.disabled = busy;
  fullPageToggle.disabled = busy;
  resolution.disabled = busy;
  viewportMode.disabled = busy || !fullPageToggle.checked;
  viewportWidth.disabled = busy || viewportFields.hidden;
  viewportHeight.disabled = busy || viewportFields.hidden;
}

async function getPageTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) {
    throw new Error('Abre primero una página web, localhost o un archivo HTML.');
  }
  return tab;
}

const pngImaging = {
  decode: async url => createImageBitmap(await (await fetch(url)).blob()),
  render: (bitmap, size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG.')), 'image/png'));
  },
};

async function captureSelectedPng() {
  const settings = validateSettings(readControls());
  const tab = await getPageTab();
  return settings.fullPage
    ? captureFullPagePng(chrome, tab, pngImaging, {
      scale: settings.scale,
      viewport: settings.viewportMode === 'custom'
        ? { mode: 'custom', width: settings.viewportWidth, height: settings.viewportHeight }
        : { mode: 'auto' }
    })
    : capturePng(chrome, tab, pngImaging, settings.scale);
}

for (const control of [fullPageToggle, resolution, viewportMode, viewportWidth, viewportHeight]) {
  control.addEventListener('change', () => {
    updateViewportControls();
    persistControls();
  });
}
for (const control of [viewportWidth, viewportHeight]) {
  control.addEventListener('input', persistControls);
}

function pngSummary(result) {
  return `${result.scale}× · ${result.width} × ${result.height} px. ` +
    (result.upscaled
      ? `Reescalado desde ${result.sourceWidth} × ${result.sourceHeight} px; amplía la imagen sin añadir detalle real.`
      : 'La salida no amplía la captura original ni añade detalle.');
}

function pngProgress() {
  if (!fullPageToggle.checked) return `Capturando el área visible a ${resolution.value}×…`;
  if (viewportMode.value === 'custom') {
    return `Capturando página completa con viewport CSS ${viewportWidth.value} × ${viewportHeight.value} a ${resolution.value}×…`;
  }
  return 'Capturando la página completa…';
}

button.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = 'Preparando la captura…';
  try {
    const tab = await getPageTab();
    const selector = document.querySelector('#selector').value.trim() || 'body';
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: (value) => {
        try { return { found: !!document.querySelector(value) }; }
        catch { return { error: 'El selector CSS no es válido.' }; }
      }, args: [selector]
    });
    if (result.error || !result.found) throw new Error(result.error || 'No existe un elemento con ese selector.');
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['capture.js'] });
    } catch (error) {
      throw new Error(describeCaptureError(error));
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: (value) => {
        // The promise stays open while Figma's capture toolbar is open.
        // Do not await it inside executeScript or the popup would appear stuck.
        window.figma.captureForDesign({ selector: value, extractSourceData: false })
          .catch(error => console.error('[HTML a Figma]', error));
      }, args: [selector]
    });
    window.close();
  } catch (error) {
    status.textContent = describeCaptureError(error);
    setBusy(false);
  }
});

pngButton.addEventListener('click', async () => {
  setBusy(true);
  saveLink.hidden = true;
  status.textContent = pngProgress();
  try {
    const result = await captureSelectedPng();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(result.blob);
    saveLink.href = downloadUrl;
    saveLink.download = result.filename;
    saveLink.hidden = false;
    saveLink.click();
    status.textContent = `PNG preparado (${result.mode}): ${pngSummary(result)}`;
  } catch (error) {
    status.textContent = `No se pudo capturar: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

copyButton.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = pngProgress();
  try {
    const result = await captureSelectedPng();
    await copyPngToClipboard(result);
    status.textContent = `PNG ${result.scale}× copiado (${result.mode}): ${pngSummary(result)}`;
  } catch (error) {
    status.textContent = `No se pudo copiar: ${error.message}`;
  } finally {
    setBusy(false);
  }
});
