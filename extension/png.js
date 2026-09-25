// Output size is based on CSS pixels, never multiplied twice on Retina screens.
export function planPng(viewport, source, scale = 2) {
  const { width, height } = viewport;
  if (![width, height, source.width, source.height, scale].every(n => Number.isFinite(n) && n > 0) || ![1, 2].includes(scale)) {
    throw new Error('No se pudieron medir las dimensiones de la captura.');
  }
  const output = { width: Math.round(width * scale), height: Math.round(height * scale) };
  if (output.width > 16384 || output.height > 16384 || output.width * output.height > 40000000) {
    throw new Error(`La captura es demasiado grande para exportarla a ${scale}×. Reduce su tamaño e inténtalo otra vez.`);
  }
  // Resizing a tab during capture can stretch the image; allow pixel rounding only.
  const xScale = source.width / width;
  const yScale = source.height / height;
  if (Math.abs(xScale - yScale) > Math.max(0.015, 2 / Math.min(width, height))) {
    throw new Error('La ventana cambió de tamaño durante la captura. Vuelve a intentarlo sin redimensionarla.');
  }
  return { ...output, upscaled: source.width < output.width - 1 || source.height < output.height - 1 };
}

export function pngFilename(title, date = new Date(), scale = 2) {
  const name = (title || 'captura').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'captura';
  return `${name}-${date.toISOString().replace(/[:.]/g, '-')}-${scale}x.png`;
}

export function pngClipboardItem(result, ClipboardItemCtor = globalThis.ClipboardItem) {
  if (typeof ClipboardItemCtor !== 'function') {
    throw new Error('El portapapeles no admite imágenes PNG; usa Descargar PNG.');
  }
  if (!result?.blob || typeof result.blob.size !== 'number') {
    throw new Error('No hay una imagen PNG lista para copiar.');
  }
  return new ClipboardItemCtor({ 'image/png': result.blob });
}

export async function copyPngToClipboard(result, clipboard = globalThis.navigator?.clipboard, ClipboardItemCtor = globalThis.ClipboardItem) {
  if (!clipboard || typeof clipboard.write !== 'function') {
    throw new Error('El portapapeles no está disponible; usa Descargar PNG.');
  }
  await clipboard.write([pngClipboardItem(result, ClipboardItemCtor)]);
  return result;
}

export async function capturePng(chromeApi, tab, imaging, scale = 2) {
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
    const plan = planPng(viewport, bitmap, scale);
    const blob = await imaging.render(bitmap, plan);
    return { blob, ...plan, scale, sourceWidth: bitmap.width, sourceHeight: bitmap.height, filename: pngFilename(tab.title, new Date(), scale), mode: 'Área visible' };
  } finally {
    bitmap.close();
  }
}

export async function captureFullPagePng(chromeApi, tab, imaging, options = {}) {
  const scale = options.scale ?? 2;
  const debuggerTarget = { tabId: tab.id };
  const isSameTab = async () => {
    const [active] = await chromeApi.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id) throw new Error('La pestaña activa cambió. Vuelve a capturar la página deseada.');
  };
  const getDocumentSize = metrics => {
    const size = metrics?.cssContentSize ?? metrics?.contentSize;
    return { width: size?.width, height: size?.height };
  };
  let attached = false;
  let bitmap;
  try {
    await isSameTab();
    try {
      await chromeApi.debugger.attach(debuggerTarget, '1.3');
      attached = true;
    } catch {
      throw new Error('No se pudo iniciar la captura completa. Cierra DevTools u otra sesión de depuración conectada a esta pestaña y vuelve a intentarlo.');
    }
    await chromeApi.debugger.sendCommand(debuggerTarget, 'Page.enable');
    const initialSize = getDocumentSize(await chromeApi.debugger.sendCommand(debuggerTarget, 'Page.getLayoutMetrics'));
    planPng(initialSize, initialSize, scale);
    await isSameTab();
    const screenshot = await chromeApi.debugger.sendCommand(debuggerTarget, 'Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: initialSize.width, height: initialSize.height, scale: 1 }
    });
    await isSameTab();
    const afterSize = getDocumentSize(await chromeApi.debugger.sendCommand(debuggerTarget, 'Page.getLayoutMetrics'));
    if (afterSize.width !== initialSize.width || afterSize.height !== initialSize.height) {
      throw new Error('La página cambió de tamaño durante la captura. Vuelve a intentarlo cuando esté estable.');
    }
    bitmap = await imaging.decode(`data:image/png;base64,${screenshot.data}`);
    const plan = planPng(initialSize, bitmap, scale);
    const blob = await imaging.render(bitmap, plan);
    await isSameTab();
    return {
      blob,
      ...plan,
      scale,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      filename: pngFilename(tab.title, new Date(), scale),
      mode: 'Página completa'
    };
  } finally {
    try { bitmap?.close(); } catch {}
    if (attached) {
      try { await chromeApi.debugger.detach(debuggerTarget); } catch {}
    }
  }
}
