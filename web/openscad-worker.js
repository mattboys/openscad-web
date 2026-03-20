/**
 * OpenSCAD Web Worker - Runs WASM rendering off the main thread
 *
 * Usage: new Worker('openscad-worker.js', { type: 'module' })
 * Then postMessage({ type: 'init', options: {...} }) and { type: 'render', source, options }
 */

import { createOpenSCAD } from './openscad-api.js';

let openscadInstance = null;

self.onmessage = async (e) => {
  const { id, type, source, options } = e.data || {};

  const reply = (result, error = null) => {
    self.postMessage({ id, result, error });
  };

  try {
    switch (type) {
      case 'init': {
        openscadInstance = await createOpenSCAD(options || {});
        reply({ ready: true });
        break;
      }

      case 'render': {
        if (!openscadInstance) {
          throw new Error('Worker not initialized. Send { type: "init", options } first.');
        }
        const result = await openscadInstance.render(source || '', options || {});
        reply({
          data: result.data,
          format: result.format,
          exitCode: result.exitCode,
        });
        break;
      }

      case 'parse': {
        if (!openscadInstance) {
          throw new Error('Worker not initialized. Send { type: "init", options } first.');
        }
        const parseResult = await openscadInstance.parse(source || '');
        reply(parseResult);
        break;
      }

      default:
        reply(null, `Unknown message type: ${type}`);
    }
  } catch (err) {
    reply(null, err.message || String(err));
  }
};
