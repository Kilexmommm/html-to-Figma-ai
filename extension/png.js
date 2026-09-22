// Output size is based on CSS pixels, never multiplied twice on Retina screens.
export function planPng(viewport, source) {
  const { width, height } = viewport;
  if (![width, height, source.width, source.height].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('No se pudieron medir las dimensiones de la captura.');
  }
  const output = { width: Math.round(width * 2), height: Math.round(height * 2) };
  if (output.width > 16384 || output.height > 16384 || output.width * output.height > 40000000) {
    throw new Error('La ventana es demasiado grande para exportarla a 2×. Reduce su tamaño e inténtalo otra vez.');
  }
  // Resizing a tab during capture can stretch the image; allow pixel rounding only.
  const xScale = source.width / width;
  const yScale = source.height / height;
  if (Math.abs(xScale - yScale) > Math.max(0.015, 2 / Math.min(width, height))) {
    throw new Error('La ventana cambió de tamaño durante la captura. Vuelve a intentarlo sin redimensionarla.');
  }
  return { ...output, upscaled: source.width < output.width - 1 || source.height < output.height - 1 };
}

export function pngFilename(title, date = new Date()) {
  const name = (title || 'captura').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'captura';
  return `${name}-${date.toISOString().replace(/[:.]/g, '-')}-2x.png`;
}

export async function capturePng(chromeApi, tab, imaging) {
  const [{ result: viewport }] = await chromeApi.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY })
  });
  const isSameTab = async () => {
    const [active] = await chromeApi.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id) throw new Error('La pestaña activa cambió. Vuelve a capturar la página deseada.');
  };
  await isSameTab();
  const dataUrl = await chromeApi.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await isSameTab();
  const [{ result: after }] = await chromeApi.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY })
  });
  if (['width', 'height', 'scrollX', 'scrollY'].some(key => viewport[key] !== after[key])) {
    throw new Error('La vista cambió durante la captura. Vuelve a intentarlo sin mover la página.');
  }
  const bitmap = await imaging.decode(dataUrl);
  try {
    const plan = planPng(viewport, bitmap);
    const blob = await imaging.render(bitmap, plan);
    return { blob, ...plan, sourceWidth: bitmap.width, sourceHeight: bitmap.height, filename: pngFilename(tab.title) };
  } finally {
    bitmap.close();
  }
}
