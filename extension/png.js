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

export function planFullPageTiles(page) {
  const { width, height, docWidth, docHeight } = page;
  if (![width, height, docWidth, docHeight].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('No se pudieron medir las dimensiones de la página.');
  }
  if (docWidth > width) {
    throw new Error('La página tiene desbordamiento horizontal; solo se admite una página sin overflow horizontal.');
  }
  const lastY = Math.max(0, docHeight - height);
  const positions = [0];
  while (positions.at(-1) < lastY) positions.push(Math.min(positions.at(-1) + height, lastY));
  if (positions.length > 4) {
    throw new Error('La página supera el límite de tres desplazamientos (máximo cuatro capturas). Elige «Área visible» para continuar.');
  }
  return positions;
}

export function planStitchSegments(positions, documentHeight) {
  if (!Array.isArray(positions) || positions.length === 0 || !Number.isFinite(documentHeight) || documentHeight <= 0 || positions[0] !== 0) {
    throw new Error('No se pudo planificar la composición de la página completa.');
  }
  return positions.map((y, index) => {
    const nextY = positions[index + 1] ?? documentHeight;
    if (!Number.isFinite(y) || nextY <= y || nextY > documentHeight) {
      throw new Error('No se pudo planificar la composición de la página completa.');
    }
    return { y, height: nextY - y };
  });
}

export function renderPngTiles(tiles, segments, size, viewport, scale, createCanvas) {
  const canvas = createCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  tiles.forEach(({ bitmap }, index) => {
    const segment = segments[index];
    const sourceHeight = segment.height * bitmap.height / viewport.height;
    context.drawImage(bitmap, 0, 0, bitmap.width, sourceHeight, 0, segment.y * scale, size.width, segment.height * scale);
  });
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG.')), 'image/png'));
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

function measurePage() {
  const root = document.documentElement;
  const body = document.body;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    docWidth: Math.max(root.scrollWidth, root.offsetWidth, body?.scrollWidth || 0, body?.offsetWidth || 0),
    docHeight: Math.max(root.scrollHeight, root.offsetHeight, body?.scrollHeight || 0, body?.offsetHeight || 0),
    scrollX: window.scrollX,
    scrollY: window.scrollY
  };
}

function scrollPage(y, delay) {
  window.scrollTo(0, y);
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, delay)));
}

function restorePageScroll(x, y, delay) {
  window.scrollTo(x, y);
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, delay)));
}

export async function captureFullPagePng(chromeApi, tab, imaging, options = {}) {
  const delay = Number.isFinite(options.paintDelay) ? Math.max(0, options.paintDelay) : 80;
  const scale = options.scale ?? 2;
  const captureInterval = Number.isFinite(options.captureInterval) ? Math.max(0, options.captureInterval) : 500;
  const wait = typeof options.wait === 'function'
    ? options.wait
    : milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const isSameTab = async () => {
    const [active] = await chromeApi.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id) throw new Error('La pestaña activa cambió. Vuelve a capturar la página deseada.');
  };
  const measure = async () => {
    const [{ result }] = await chromeApi.scripting.executeScript({ target: { tabId: tab.id }, func: measurePage });
    return result;
  };
  await isSameTab();
  const initial = await measure();
  await isSameTab();
  const positions = planFullPageTiles(initial);
  planPng({ width: initial.width, height: initial.docHeight }, { width: initial.width, height: initial.docHeight }, scale);
  const tiles = [];
  const dimensionsChanged = () => new Error('La página cambió de tamaño durante la captura. Vuelve a intentarlo cuando esté estable.');
  const verifyDimensions = page => {
    if (page.width !== initial.width || page.height !== initial.height || page.docWidth !== initial.docWidth || page.docHeight !== initial.docHeight) {
      throw dimensionsChanged();
    }
    if (page.docWidth > page.width) {
      throw new Error('La página tiene desbordamiento horizontal; solo se admite una página sin overflow horizontal.');
    }
  };
  try {
    try {
      for (let index = 0; index < positions.length; index++) {
        if (index > 0 && captureInterval > 0) await wait(captureInterval);
        const y = positions[index];
        await isSameTab();
        await chromeApi.scripting.executeScript({ target: { tabId: tab.id }, func: scrollPage, args: [y, delay] });
        await isSameTab();
        const beforeCapture = await measure();
        await isSameTab();
        verifyDimensions(beforeCapture);
        if (Math.abs(beforeCapture.scrollY - y) > 1 || Math.abs(beforeCapture.scrollX) > 1) {
          throw new Error('La página no pudo desplazarse a la posición prevista. Vuelve a intentarlo.');
        }
        const dataUrl = await chromeApi.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        await isSameTab();
        const bitmap = await imaging.decode(dataUrl);
        tiles.push({ bitmap, y });
        const afterCapture = await measure();
        await isSameTab();
        verifyDimensions(afterCapture);
        if (Math.abs(afterCapture.scrollY - y) > 1 || Math.abs(afterCapture.scrollX) > 1) {
          throw new Error('La página se desplazó durante la captura. Vuelve a intentarlo.');
        }
        if (tiles.some(tile => tile.bitmap.width !== bitmap.width || tile.bitmap.height !== bitmap.height)) {
          throw new Error('La captura cambió de resolución entre desplazamientos. Vuelve a intentarlo.');
        }
      }
    } finally {
      await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        func: restorePageScroll,
        args: [initial.scrollX, initial.scrollY, delay]
      });
      await isSameTab();
    }
    const first = tiles[0].bitmap;
    const sourceHeight = first.height / initial.height * initial.docHeight;
    const plan = planPng({ width: initial.width, height: initial.docHeight }, { width: first.width, height: sourceHeight }, scale);
    const segments = planStitchSegments(positions, initial.docHeight);
    const blob = await imaging.renderTiles(tiles, segments, plan, { width: initial.width, height: initial.height }, scale);
    await isSameTab();
    return {
      blob,
      ...plan,
      scale,
      sourceWidth: first.width,
      sourceHeight: Math.round(sourceHeight),
      filename: pngFilename(tab.title, new Date(), scale),
      mode: 'Página completa'
    };
  } finally {
    for (const { bitmap } of tiles) bitmap.close();
  }
}
