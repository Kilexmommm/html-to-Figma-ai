import { capturePng, copyPngToClipboard } from './png.js';
import { describeCaptureError } from './errors.js';

const button = document.querySelector('#capture');
const pngButton = document.querySelector('#capture-png');
const copyButton = document.querySelector('#copy-png');
const saveLink = document.querySelector('#save-image');
const status = document.querySelector('#status');
let downloadUrl;

function setBusy(busy) {
  button.disabled = busy;
  pngButton.disabled = busy;
  copyButton.disabled = busy;
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
  }
};

async function captureVisiblePng() {
  return capturePng(chrome, await getPageTab(), pngImaging);
}

function pngSummary(result) {
  return `${result.width} × ${result.height} px. ` +
    (result.upscaled
      ? `Reescalado desde ${result.sourceWidth} × ${result.sourceHeight} px; amplía la imagen sin añadir detalle real.`
      : 'La captura original aporta la resolución necesaria para 2×.');
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
  status.textContent = 'Capturando el área visible…';
  try {
    const result = await captureVisiblePng();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(result.blob);
    saveLink.href = downloadUrl;
    saveLink.download = result.filename;
    saveLink.hidden = false;
    saveLink.click();
    status.textContent = `PNG preparado: ${pngSummary(result)}`;
  } catch (error) {
    status.textContent = `No se pudo capturar: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

copyButton.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = 'Capturando el área visible…';
  try {
    const result = await captureVisiblePng();
    await copyPngToClipboard(result);
    status.textContent = `PNG 2× copiado al portapapeles: ${pngSummary(result)}`;
  } catch (error) {
    status.textContent = `No se pudo copiar: ${error.message}`;
  } finally {
    setBusy(false);
  }
});
