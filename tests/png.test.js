import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capturePng, planPng, pngFilename } from '../extension/png.js';

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
      assert.equal(size.width, 2880);
      if (options.renderFails) throw new Error('Canvas failed');
      return new Blob(['mock png'], { type: 'image/png' });
    }
  };
  return { run: () => capturePng(chrome, tab, imaging), counts: () => ({ captured, rendered, closed }) };
}

test('capture uses the intended window, produces a PNG and closes its bitmap', async () => {
  const setup = harness();
  const result = await setup.run();
  assert.equal(result.blob.type, 'image/png');
  assert.equal(result.upscaled, false);
  assert.deepEqual(setup.counts(), { captured: 1, rendered: 1, closed: 1 });
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
