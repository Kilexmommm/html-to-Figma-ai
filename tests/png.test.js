import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFullPagePng, capturePng, copyPngToClipboard, pngClipboardItem, planFullPageTiles, planPng, planStitchSegments, pngFilename, renderPngTiles } from '../extension/png.js';

test('Retina exports exactly 2× CSS size, not 4×', () => {
  assert.deepEqual(planPng({ width: 1440, height: 900 }, { width: 2880, height: 1800 }),
    { width: 2880, height: 1800, upscaled: false });
});

test('1× screenshot is explicitly identified as upscaled', () => {
  assert.equal(planPng({ width: 1440, height: 900 }, { width: 1440, height: 900 }).upscaled, true);
});

test('3× display is reduced to the requested 2× size', () => {
  assert.deepEqual(planPng({ width: 1280, height: 720 }, { width: 3840, height: 2160 }),
    { width: 2560, height: 1440, upscaled: false });
});

test('invalid or oversized output is rejected before allocating the canvas', () => {
  assert.throws(() => planPng({ width: 0, height: 900 }, { width: 1, height: 900 }));
  assert.throws(() => planPng({ width: 9000, height: 9000 }, { width: 9000, height: 9000 }), /demasiado grande/);
});

test('mismatched aspect ratios are rejected instead of stretching the screenshot', () => {
  assert.throws(() => planPng({ width: 1440, height: 900 }, { width: 2880, height: 1200 }), /cambió de tamaño/);
});

test('download filenames remove path characters and retain the 2x suffix', () => {
  assert.equal(pngFilename('Diseño / clientes: prueba', new Date('2026-09-22T12:30:00Z')),
    'Diseno-clientes-prueba-2026-09-22T12-30-00-000Z-2x.png');
});

function harness(options = {}) {
  let queryCalls = 0, measures = 0, captured = 0, rendered = 0, closed = 0;
  const tab = { id: 23, windowId: 7, title: 'Prueba' };
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 320 };
  const chrome = {
    scripting: { executeScript: async args => {
      assert.equal(args.target.tabId, 23);
      measures++;
      return [{ result: measures === 2 && options.scrollChanged ? { ...viewport, scrollY: 400 } : viewport }];
    } },
    tabs: {
      query: async args => {
        assert.equal(args.windowId, 7);
        queryCalls++;
        return [{ id: options.switchAt === queryCalls ? 99 : 23 }];
      },
      captureVisibleTab: async (windowId, settings) => {
        captured++;
        assert.equal(windowId, 7);
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

test('capture uses the intended window, produces a PNG and closes its bitmap', async () => {
  const setup = harness();
  const result = await setup.run();
  assert.equal(result.blob.type, 'image/png');
  assert.equal(result.upscaled, false);
  assert.deepEqual(setup.counts(), { captured: 1, rendered: 1, closed: 1 });
});

test('captura visible respeta 1× en dimensiones, resultado y sufijo del archivo', async () => {
  const setup = harness({ scale: 1 });
  const result = await setup.run();
  assert.deepEqual({ width: result.width, height: result.height, scale: result.scale }, { width: 1440, height: 900, scale: 1 });
  assert.match(result.filename, /-1x\.png$/);
});

test('switching tabs before capture prevents capturing another page', async () => {
  const setup = harness({ switchAt: 1 });
  await assert.rejects(setup.run(), /pestaña activa cambió/);
  assert.equal(setup.counts().captured, 0);
});

test('switching tabs during capture prevents exporting the wrong page', async () => {
  const setup = harness({ switchAt: 2 });
  await assert.rejects(setup.run(), /pestaña activa cambió/);
  assert.equal(setup.counts().rendered, 0);
});

test('scroll changes during capture require retry', async () => {
  const setup = harness({ scrollChanged: true });
  await assert.rejects(setup.run(), /vista cambió/);
  assert.equal(setup.counts().rendered, 0);
});

test('native capture errors propagate without producing an image', async () => {
  const setup = harness({ captureFails: true });
  await assert.rejects(setup.run(), /Chrome capture failed/);
  assert.equal(setup.counts().rendered, 0);
});

test('canvas failure still releases the bitmap', async () => {
  const setup = harness({ renderFails: true });
  await assert.rejects(setup.run(), /Canvas failed/);
  assert.equal(setup.counts().closed, 1);
});

class FakeClipboardItem {
  constructor(payload) { this.payload = payload; }
}

function clipboardSpy() {
  return {
    written: [],
    async write(items) { this.written.push(...items); }
  };
}

test('copiar reutiliza el blob y las dimensiones de la captura en la escala seleccionada', async () => {
  for (const scale of [1, 2]) {
    const setup = harness({ scale });
    const result = await setup.run();
    const clipboard = clipboardSpy();
    const returned = await copyPngToClipboard(result, clipboard, FakeClipboardItem);
    assert.equal(returned, result);
    assert.equal(clipboard.written.length, 1);
    assert.equal(clipboard.written[0].payload['image/png'], result.blob);
    assert.deepEqual({ width: result.width, height: result.height, scale: result.scale },
      { width: 1440 * scale, height: 900 * scale, scale });
  }
});


test('sin portapapeles disponible se avisa y no se escribe nada', async () => {
  const result = { blob: new Blob(['mock png'], { type: 'image/png' }), width: 2880, height: 1800 };
  await assert.rejects(copyPngToClipboard(result, {}, FakeClipboardItem), /portapapeles/);
});

test('sin ClipboardItem se avisa en lugar de romper el popup', async () => {
  const result = { blob: new Blob(['mock png'], { type: 'image/png' }), width: 2880, height: 1800 };
  const clipboard = clipboardSpy();
  assert.throws(() => pngClipboardItem(result, undefined), /portapapeles/);
  await assert.rejects(copyPngToClipboard(result, clipboard, undefined), /portapapeles/);
  assert.equal(clipboard.written.length, 0);
});

test('copiar no inicia ninguna descarga', async () => {
  const setup = harness();
  const result = await setup.run();
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
  assert.equal(clipboard.written.length, 1);
});

test('la planificación cubre exactamente hasta cuatro viewports sin huecos ni duplicados', () => {
  const positions = planFullPageTiles({ width: 1000, height: 800, docWidth: 1000, docHeight: 3200 });
  const segments = planStitchSegments(positions, 3200);
  assert.deepEqual(positions, [0, 800, 1600, 2400]);
  assert.deepEqual(segments, [
    { y: 0, height: 800 },
    { y: 800, height: 800 },
    { y: 1600, height: 800 },
    { y: 2400, height: 800 }
  ]);
  assert.equal(segments.reduce((total, segment) => total + segment.height, 0), 3200);
});

test('el último tile se alinea al final y la composición recorta el solapamiento', () => {
  const positions = planFullPageTiles({ width: 1000, height: 800, docWidth: 1000, docHeight: 2500 });
  const segments = planStitchSegments(positions, 2500);
  assert.deepEqual(positions, [0, 800, 1600, 1700]);
  assert.equal(positions.at(-1), 2500 - 800);
  assert.deepEqual(segments, [
    { y: 0, height: 800 },
    { y: 800, height: 800 },
    { y: 1600, height: 100 },
    { y: 1700, height: 800 }
  ]);
  assert.equal(segments.reduce((total, segment) => total + segment.height, 0), 2500);
});

test('páginas que requieren más de cuatro capturas se rechazan antes de capturar', () => {
  const setup = fullPageHarness({ docHeight: 3201 });
  return assert.rejects(setup.run(), /límite de tres desplazamientos.*Área visible/).then(() => {
    assert.equal(setup.counts().captured, 0);
    assert.equal(setup.counts().restored, 0);
  });
});

function fullPageHarness(options = {}) {
  const tab = { id: 23, windowId: 7, title: 'Página larga' };
  const state = {
    width: 1000,
    height: 800,
    docWidth: options.docWidth ?? 1000,
    docHeight: options.docHeight ?? 2500,
    scrollX: 0,
    scrollY: options.initialY ?? 320
  };
  let captured = 0;
  let restored = 0;
  let closed = 0;
  let renderedSegments;
  let renderedSize;
  let renderedScale;
  let canvas;
  const waitCalls = [];
  const captureEvents = [];
  let queryCalls = 0;
  const chrome = {
    scripting: {
      executeScript: async ({ func, args = [], target }) => {
        assert.equal(target.tabId, tab.id);
        if (func.name === 'measurePage') return [{ result: { ...state } }];
        if (func.name === 'scrollPage') {
          state.scrollX = 0;
          state.scrollY = args[0];
          if (options.changeDimensionsAt === args[0]) state.docHeight++;
          return [];
        }
        if (func.name === 'restorePageScroll') {
          state.scrollX = args[0];
          state.scrollY = args[1];
          restored++;
          return [];
        }
        throw new Error(`Unexpected injected function: ${func.name}`);
      }
    },
    tabs: {
      query: async () => [{ id: options.switchAt === ++queryCalls ? 99 : tab.id }],
      captureVisibleTab: async () => {
        captured++;
        captureEvents.push(`capture:${captured}`);
        if (options.failCaptureAt === captured) throw new Error('Chrome capture failed');
        return 'mock';
      }
    }
  };
  const imaging = {
    decode: async () => ({ width: 2000, height: 1600, close: () => closed++ }),
    renderTiles: (tiles, segments, size, viewport, scale) => {
      renderedSegments = segments;
      renderedSize = size;
      renderedScale = scale;
      assert.equal(tiles.length, segments.length);
      return renderPngTiles(tiles, segments, size, viewport, scale, () => {
        canvas = {
          getContext: () => ({ drawImage: (...args) => drawCalls.push(args) }),
          toBlob: callback => callback(new Blob(['full page'], { type: 'image/png' }))
        };
        return canvas;
      });
    }
  };
  const drawCalls = [];
  const run = () => {
    const captureOptions = { paintDelay: 0, scale: options.scale ?? 2 };
    if (!options.useDefaultCaptureInterval) captureOptions.captureInterval = options.captureInterval ?? 0;
    if (options.mockWait) {
      captureOptions.wait = async milliseconds => {
        waitCalls.push(milliseconds);
        captureEvents.push(`wait:${milliseconds}`);
      };
    }
    return captureFullPagePng(chrome, tab, imaging, captureOptions);
  };
  return {
    run,
    state,
    counts: () => ({ captured, restored, closed }),
    renderedSegments: () => renderedSegments,
    rendering: () => ({ size: renderedSize, scale: renderedScale, canvas, drawCalls }),
    waitCalls: () => waitCalls,
    captureEvents: () => captureEvents
  };
}

test('captura secuencialmente y restaura el scroll original antes de devolver el PNG', async () => {
  const setup = fullPageHarness({ initialY: 320 });
  const result = await setup.run();
  assert.equal(result.mode, 'Página completa');
  assert.deepEqual({ width: result.width, height: result.height }, { width: 2000, height: 5000 });
  assert.deepEqual(setup.renderedSegments(), planStitchSegments([0, 800, 1600, 1700], 2500));
  assert.deepEqual(setup.counts(), { captured: 4, restored: 1, closed: 4 });
  assert.equal(setup.state.scrollY, 320);
});

test('página completa 1× y 2× escala canvas y destino de cada tile, dimensiones y sufijo', async () => {
  for (const scale of [1, 2]) {
    const setup = fullPageHarness({ scale });
    const result = await setup.run();
    const rendering = setup.rendering();
    const positions = [0, 800, 1600, 1700];
    const heights = [800, 800, 100, 800];
    assert.deepEqual(
      { width: result.width, height: result.height, scale: result.scale },
      { width: 1000 * scale, height: 2500 * scale, scale }
    );
    assert.match(result.filename, new RegExp(`-${scale}x\\.png$`));
    assert.equal(rendering.scale, scale);
    assert.deepEqual({ width: rendering.size.width, height: rendering.size.height },
      { width: 1000 * scale, height: 2500 * scale });
    assert.equal(rendering.canvas.width, 1000 * scale);
    assert.equal(rendering.canvas.height, 2500 * scale);
    assert.deepEqual(rendering.drawCalls.map(args => ({ y: args[6], height: args[8] })),
      positions.map((y, index) => ({ y: y * scale, height: heights[index] * scale })));
  }
});

test('espera 500 ms entre capturas de página completa, sin esperar antes de la primera', async () => {
  const setup = fullPageHarness({ useDefaultCaptureInterval: true, mockWait: true });
  await setup.run();
  assert.deepEqual(setup.waitCalls(), [500, 500, 500]);
  assert.deepEqual(setup.captureEvents(), [
    'capture:1', 'wait:500', 'capture:2', 'wait:500', 'capture:3', 'wait:500', 'capture:4'
  ]);
});

test('captureInterval 0 desactiva la espera sin afectar las capturas', async () => {
  const setup = fullPageHarness({ captureInterval: 0, mockWait: true });
  await setup.run();
  assert.deepEqual(setup.waitCalls(), []);
  assert.deepEqual(setup.captureEvents(), ['capture:1', 'capture:2', 'capture:3', 'capture:4']);
});

test('restaura el scroll original y libera bitmaps si una captura falla', async () => {
  const setup = fullPageHarness({ initialY: 345, failCaptureAt: 2 });
  await assert.rejects(setup.run(), /Chrome capture failed/);
  assert.equal(setup.state.scrollY, 345);
  assert.deepEqual(setup.counts(), { captured: 2, restored: 1, closed: 1 });
});

test('aborta si cambian las dimensiones del documento y restaura el scroll', async () => {
  const setup = fullPageHarness({ initialY: 410, changeDimensionsAt: 800 });
  await assert.rejects(setup.run(), /cambió de tamaño durante la captura/);
  assert.equal(setup.state.scrollY, 410);
  assert.deepEqual(setup.counts(), { captured: 1, restored: 1, closed: 1 });
});

test('aborta si cambia la pestaña activa durante el desplazamiento y restaura el scroll', async () => {
  const setup = fullPageHarness({ initialY: 410, switchAt: 4 });
  await assert.rejects(setup.run(), /pestaña activa cambió/);
  assert.equal(setup.state.scrollY, 410);
  assert.deepEqual(setup.counts(), { captured: 0, restored: 1, closed: 0 });
});

test('el overflow horizontal se rechaza explícitamente antes de capturar', async () => {
  const setup = fullPageHarness({ docWidth: 1200 });
  await assert.rejects(setup.run(), /solo se admite una página sin overflow horizontal/);
  assert.equal(setup.counts().captured, 0);
});
