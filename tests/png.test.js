import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFullPagePng, capturePng, copyPngToClipboard, pngClipboardItem, planPng, pngFilename } from '../extension/png.js';

test('Retina exports exactly 2× CSS size, not 4×', () => {
  assert.deepEqual(planPng({ width: 1440, height: 900 }, { width: 2880, height: 1800 }),
    { width: 2880, height: 1800, upscaled: false });
});

test('1× screenshot is explicitly identified as upscaled', () => {
  assert.equal(planPng({ width: 1440, height: 900 }, { width: 1440, height: 900 }).upscaled, true);
});

test('invalid, oversized or mismatched output is rejected', () => {
  assert.throws(() => planPng({ width: 0, height: 900 }, { width: 1, height: 900 }));
  assert.throws(() => planPng({ width: 9000, height: 9000 }, { width: 9000, height: 9000 }), /demasiado grande/);
  assert.throws(() => planPng({ width: 1440, height: 900 }, { width: 2880, height: 1200 }), /cambió de tamaño/);
});

test('download filename is safe and retains the selected scale suffix', () => {
  assert.equal(pngFilename('Diseño / clientes: prueba', new Date('2026-09-22T12:30:00Z'), 1),
    'Diseno-clientes-prueba-2026-09-22T12-30-00-000Z-1x.png');
});

function visibleHarness(options = {}) {
  let captured = 0, rendered = 0, closed = 0, scriptCalls = 0, queryCalls = 0;
  const tab = { id: 23, windowId: 7, title: 'Prueba' };
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 320 };
  const chrome = {
    scripting: { executeScript: async () => {
      scriptCalls++;
      if (options.scrollChanged && scriptCalls === 2) return [{ result: { ...viewport, scrollY: 400 } }];
      return [{ result: viewport }];
    } },
    tabs: {
      query: async () => [{ id: options.switchAt === ++queryCalls ? 99 : tab.id }],
      captureVisibleTab: async (windowId, settings) => {
        captured++;
        assert.equal(windowId, tab.windowId);
        assert.equal(settings.format, 'png');
        if (options.captureFails) throw new Error('Chrome capture failed');
        return 'data:image/png;base64,mocked';
      }
    }
  };
  const imaging = {
    decode: async () => ({ width: 2880, height: 1800, close: () => closed++ }),
    render: async (bitmap, size) => {
      rendered++;
      const scale = options.scale ?? 2;
      assert.equal(size.width, 1440 * scale);
      assert.equal(size.height, 900 * scale);
      if (options.renderFails) throw new Error('Canvas failed');
      return new Blob(['mock png'], { type: 'image/png' });
    }
  };
  return {
    run: () => capturePng(chrome, tab, imaging, options.scale ?? 2),
    counts: () => ({ captured, rendered, closed })
  };
}

test('captura visible usa captureVisibleTab, produce PNG y libera su bitmap', async () => {
  const setup = visibleHarness();
  const result = await setup.run();
  assert.equal(result.blob.type, 'image/png');
  assert.equal(result.mode, 'Área visible');
  assert.deepEqual(setup.counts(), { captured: 1, rendered: 1, closed: 1 });
});

test('captura visible respeta salida 1× y sufijo del nombre', async () => {
  const result = await visibleHarness({ scale: 1 }).run();
  assert.deepEqual({ width: result.width, height: result.height, scale: result.scale }, { width: 1440, height: 900, scale: 1 });
  assert.match(result.filename, /-1x\.png$/);
});

test('cambio de pestaña o scroll aborta captura visible', async () => {
  await assert.rejects(visibleHarness({ switchAt: 1 }).run(), /pestaña activa cambió/);
  await assert.rejects(visibleHarness({ scrollChanged: true }).run(), /vista cambió/);
});

test('errores de captura visible y render liberan recursos', async () => {
  const captureFailure = visibleHarness({ captureFails: true });
  await assert.rejects(captureFailure.run(), /Chrome capture failed/);
  const renderFailure = visibleHarness({ renderFails: true });
  await assert.rejects(renderFailure.run(), /Canvas failed/);
  assert.equal(renderFailure.counts().closed, 1);
});

function fullPageHarness(options = {}) {
  const tab = { id: 23, windowId: 7, title: 'Página larga' };
  const cssSize = options.cssSize ?? { width: 1200, height: 2500 };
  const viewport = options.viewport ?? { mode: 'auto' };
  const effectiveSize = viewport.mode === 'custom'
    ? { width: viewport.width, height: Math.max(cssSize.height, viewport.height) }
    : cssSize;
  const bitmapSize = options.bitmapSize ?? { width: effectiveSize.width * (viewport.mode === 'custom' ? options.scale ?? 2 : 2), height: effectiveSize.height * (viewport.mode === 'custom' ? options.scale ?? 2 : 2) };
  const commandCalls = [];
  const events = [];
  const state = { scrollX: 17, scrollY: 430 };
  let overrideApplied = false;
  let queryCalls = 0, metricCalls = 0, capturedVisible = 0, rendered, closed = 0, decodedUrl;
  const metrics = () => options.fallbackMetrics
    ? { contentSize: cssSize }
    : { cssContentSize: cssSize, contentSize: { width: 1, height: 1 } };
  const chrome = {
    debugger: {
      attach: async (target, version) => {
        events.push('attach');
        assert.deepEqual(target, { tabId: tab.id });
        assert.equal(version, '1.3');
        if (options.attachFails) throw new Error('Another debugger is already attached');
      },
      sendCommand: async (target, method, params) => {
        assert.deepEqual(target, { tabId: tab.id });
        commandCalls.push({ method, params });
        events.push(method);
        if (method === 'Emulation.setDeviceMetricsOverride') {
          overrideApplied = true;
          if (options.partialSetFails) throw options.setError ?? new Error(`CDP failed: ${method}`);
        }
        if (method === 'Emulation.clearDeviceMetricsOverride') assert.equal(overrideApplied, true);
        if (options.commandFails === method || (options.clearFails && method === 'Emulation.clearDeviceMetricsOverride')) {
          throw new Error(`CDP failed: ${method}`);
        }
        if (method === 'Emulation.clearDeviceMetricsOverride') overrideApplied = false;
        if (method === 'Page.getLayoutMetrics') {
          metricCalls++;
          if (options.changedMetrics && metricCalls > 1) return { cssContentSize: { ...cssSize, height: cssSize.height + 1 } };
          return metrics();
        }
        if (method === 'Page.captureScreenshot') {
          if (options.sizeLimit) throw new Error('Unexpected screenshot call for oversized page');
          return { data: 'cG5n' };
        }
        return {};
      },
      detach: async target => {
        events.push('detach');
        assert.deepEqual(target, { tabId: tab.id });
        if (options.detachFails) throw new Error('Detach failed');
      }
    },
    tabs: {
      query: async () => [{ id: options.switchAt === ++queryCalls ? 99 : tab.id }],
      captureVisibleTab: async () => { capturedVisible++; throw new Error('No debe capturar el viewport'); }
    },
    scripting: { executeScript: async () => { throw new Error('No debe ejecutar scripts ni tocar el scroll'); } }
  };
  const imaging = {
    decode: async url => {
      decodedUrl = url;
      if (options.decodeFails) throw new Error('Decode failed');
      return { ...bitmapSize, close: () => closed++ };
    },
    render: async (bitmap, size) => {
      rendered = { bitmap, size };
      if (options.renderFails) throw new Error('Render failed');
      return new Blob(['full page'], { type: 'image/png' });
    }
  };
  return {
    run: () => captureFullPagePng(chrome, tab, imaging, { scale: options.scale ?? 2, viewport }),
    events,
    commandCalls,
    state,
    decoded: () => decodedUrl,
    rendered: () => rendered,
    counts: () => ({ capturedVisible, closed, metricCalls })
  };
}

test('CDP hace attach, habilita Page, mide, captura una vez y siempre detach', async () => {
  const setup = fullPageHarness();
  const result = await setup.run();
  assert.deepEqual(setup.events, ['attach', 'Page.enable', 'Page.getLayoutMetrics', 'Page.captureScreenshot', 'Page.getLayoutMetrics', 'detach']);
  assert.equal(result.mode, 'Página completa');
  assert.equal(result.blob.type, 'image/png');
  assert.equal(setup.counts().capturedVisible, 0);
  assert.equal(setup.counts().closed, 1);
});

test('viewport automático no llama Emulation y mantiene el flujo CDP existente', async () => {
  const setup = fullPageHarness();
  await setup.run();
  assert.equal(setup.commandCalls.some(call => call.method.startsWith('Emulation.')), false);
  assert.deepEqual(setup.events, ['attach', 'Page.enable', 'Page.getLayoutMetrics', 'Page.captureScreenshot', 'Page.getLayoutMetrics', 'detach']);
});

test('clip usa medidas CSS del documento, captureBeyondViewport y fromSurface', async () => {
  const setup = fullPageHarness();
  await setup.run();
  const capture = setup.commandCalls.find(call => call.method === 'Page.captureScreenshot');
  assert.deepEqual(capture.params, {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1200, height: 2500, scale: 1 }
  });
});

test('full-page genera dimensiones CSS exactas a 1× y 2×, incluso con bitmap DPR 2', async () => {
  for (const scale of [1, 2]) {
    const setup = fullPageHarness({ scale });
    const result = await setup.run();
    assert.deepEqual({ width: result.width, height: result.height, scale: result.scale },
      { width: 1200 * scale, height: 2500 * scale, scale });
    assert.deepEqual(setup.rendered().size, { width: 1200 * scale, height: 2500 * scale, upscaled: false });
    assert.match(result.filename, new RegExp(`-${scale}x\\.png$`));
  }
});

test('viewport personalizado aplica CSS size y DPR antes de medir y captura todo el alto documental', async () => {
  for (const scale of [1, 2]) {
    const setup = fullPageHarness({
      scale,
      cssSize: { width: 2300, height: 4600 },
      viewport: { mode: 'custom', width: 1900, height: 3000 }
    });
    const result = await setup.run();
    const override = setup.commandCalls.find(call => call.method === 'Emulation.setDeviceMetricsOverride');
    const metricsIndex = setup.events.indexOf('Page.getLayoutMetrics');
    assert.deepEqual(override.params, { width: 1900, height: 3000, mobile: false, deviceScaleFactor: scale });
    assert.ok(setup.events.indexOf('Emulation.setDeviceMetricsOverride') < metricsIndex);
    const capture = setup.commandCalls.find(call => call.method === 'Page.captureScreenshot');
    assert.deepEqual(capture.params.clip, { x: 0, y: 0, width: 1900, height: 4600, scale: 1 });
    assert.deepEqual({ width: result.width, height: result.height, scale: result.scale },
      { width: 1900 * scale, height: 4600 * scale, scale });
    assert.match(result.filename, new RegExp(`-${scale}x\\.png$`));
    assert.ok(setup.events.indexOf('Emulation.clearDeviceMetricsOverride') < setup.events.indexOf('detach'));
  }
});

test('viewport personalizado restaura override y hace detach al fallar screenshot o render', async () => {
  for (const options of [
    { commandFails: 'Page.captureScreenshot' },
    { renderFails: true }
  ]) {
    const setup = fullPageHarness({ ...options, viewport: { mode: 'custom', width: 1900, height: 3000 } });
    await assert.rejects(setup.run());
    assert.ok(setup.events.indexOf('Emulation.clearDeviceMetricsOverride') > setup.events.indexOf('Emulation.setDeviceMetricsOverride'));
    assert.ok(setup.events.indexOf('Emulation.clearDeviceMetricsOverride') < setup.events.indexOf('detach'));
  }
});

test('limpia un override aplicado parcialmente y conserva el error original de set', async () => {
  const setError = new Error('CDP failed: Emulation.setDeviceMetricsOverride');
  const setup = fullPageHarness({
    partialSetFails: true,
    clearFails: true,
    setError,
    viewport: { mode: 'custom', width: 1900, height: 3000 }
  });
  await assert.rejects(setup.run(), error => error === setError);
  assert.ok(setup.events.indexOf('Emulation.clearDeviceMetricsOverride') > setup.events.indexOf('Emulation.setDeviceMetricsOverride'));
  assert.ok(setup.events.indexOf('Emulation.clearDeviceMetricsOverride') < setup.events.indexOf('detach'));
});

test('error de restauración no oculta el error de captura original', async () => {
  const setup = fullPageHarness({
    commandFails: 'Page.captureScreenshot',
    clearFails: true,
    viewport: { mode: 'custom', width: 1900, height: 3000 }
  });
  await assert.rejects(setup.run(), /CDP failed: Page.captureScreenshot/);
  assert.equal(setup.events.at(-1), 'detach');
});

test('tamaño personalizado inválido se rechaza antes de attach y override', async () => {
  const setup = fullPageHarness({ viewport: { mode: 'custom', width: 199, height: 3000 } });
  await assert.rejects(setup.run(), /Ancho CSS debe ser un entero entre 200 y 16384/);
  assert.deepEqual(setup.events, []);
});

test('usa contentSize como fallback de cssContentSize y no cambia scroll ni viewport', async () => {
  const setup = fullPageHarness({ fallbackMetrics: true });
  await setup.run();
  assert.deepEqual(setup.state, { scrollX: 17, scrollY: 430 });
  assert.equal(setup.events.filter(event => event === 'Page.captureScreenshot').length, 1);
  assert.equal(setup.commandCalls.some(call => call.method.includes('DeviceMetricsOverride')), false);
});

test('attach ocupado explica cómo liberar el destino debugger', async () => {
  const setup = fullPageHarness({ attachFails: true });
  await assert.rejects(setup.run(), /Cierra DevTools u otra sesión de depuración/);
  assert.deepEqual(setup.events, ['attach']);
});

test('límites de dimensiones se rechazan antes de captureScreenshot', async () => {
  const setup = fullPageHarness({ cssSize: { width: 5000, height: 9000 }, sizeLimit: true, scale: 1 });
  await assert.rejects(setup.run(), /demasiado grande/);
  assert.equal(setup.commandCalls.some(call => call.method === 'Page.captureScreenshot'), false);
  assert.equal(setup.events.at(-1), 'detach');
});

test('errores CDP y medidas cambiantes hacen detach', async () => {
  const cdpFailure = fullPageHarness({ commandFails: 'Page.captureScreenshot' });
  await assert.rejects(cdpFailure.run(), /CDP failed: Page.captureScreenshot/);
  assert.equal(cdpFailure.events.at(-1), 'detach');
  const changed = fullPageHarness({ changedMetrics: true });
  await assert.rejects(changed.run(), /cambió de tamaño durante la captura/);
  assert.equal(changed.commandCalls.some(call => call.method === 'Page.captureScreenshot'), true);
  assert.equal(changed.events.at(-1), 'detach');
});

test('errores de decode y render liberan bitmap cuando existe y hacen detach', async () => {
  const decodeFailure = fullPageHarness({ decodeFails: true });
  await assert.rejects(decodeFailure.run(), /Decode failed/);
  assert.equal(decodeFailure.counts().closed, 0);
  assert.equal(decodeFailure.events.at(-1), 'detach');
  const renderFailure = fullPageHarness({ renderFails: true, detachFails: true });
  await assert.rejects(renderFailure.run(), /Render failed/);
  assert.equal(renderFailure.counts().closed, 1);
  assert.equal(renderFailure.events.at(-1), 'detach');
});

test('una pestaña activa distinta aborta y aun así detach', async () => {
  const setup = fullPageHarness({ switchAt: 2 });
  await assert.rejects(setup.run(), /pestaña activa cambió/);
  assert.equal(setup.events.at(-1), 'detach');
});

class FakeClipboardItem {
  constructor(payload) { this.payload = payload; }
}

function clipboardSpy() {
  return { written: [], async write(items) { this.written.push(...items); } };
}

test('copiar reutiliza el mismo blob PNG y dimensiones de la escala elegida', async () => {
  for (const scale of [1, 2]) {
    const result = await fullPageHarness({ scale }).run();
    const clipboard = clipboardSpy();
    const returned = await copyPngToClipboard(result, clipboard, FakeClipboardItem);
    assert.equal(returned, result);
    assert.equal(clipboard.written[0].payload['image/png'], result.blob);
    assert.deepEqual({ width: result.width, height: result.height, scale: result.scale },
      { width: 1200 * scale, height: 2500 * scale, scale });
    assert.match(result.filename, new RegExp(`-${scale}x\\.png$`));
  }
});

test('sin portapapeles o ClipboardItem se muestra un error y no se escribe', async () => {
  const result = { blob: new Blob(['mock png'], { type: 'image/png' }), width: 2400, height: 5000 };
  await assert.rejects(copyPngToClipboard(result, {}, FakeClipboardItem), /portapapeles/);
  const clipboard = clipboardSpy();
  assert.throws(() => pngClipboardItem(result, undefined), /portapapeles/);
  await assert.rejects(copyPngToClipboard(result, clipboard, undefined), /portapapeles/);
  assert.equal(clipboard.written.length, 0);
});

test('copiar no inicia ninguna descarga', async () => {
  const result = await visibleHarness().run();
  const clipboard = clipboardSpy();
  const original = URL.createObjectURL;
  let downloads = 0;
  URL.createObjectURL = () => { downloads++; return 'blob:mock'; };
  try {
    await copyPngToClipboard(result, clipboard, FakeClipboardItem);
  } finally {
    URL.createObjectURL = original;
  }
  assert.equal(downloads, 0);
  assert.equal(clipboard.written[0].payload['image/png'], result.blob);
});
