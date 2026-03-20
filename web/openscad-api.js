/**
 * OpenSCAD Web API - Clean JavaScript interface for the WASM build
 *
 * Provides parse, render, and export functionality with optional Web Worker support.
 * @see https://openscad.org/documentation.html
 */

const DEFAULT_INPUT_FILE = '/input.scad';
const DEFAULT_OUTPUT_FILE = '/output';

/**
 * Supported export formats
 * @type {Record<string, string>}
 */
export const EXPORT_FORMATS = {
  stl: 'stl',       // ASCII STL
  binstl: 'binstl', // Binary STL (smaller)
  obj: 'obj',
  off: 'off',
  amf: 'amf',
  '3mf': '3mf',
  svg: 'svg',
  pdf: 'pdf',
  dxf: 'dxf',
  csg: 'csg',
  ast: 'ast',
};

/**
 * Default OpenSCAD options for rendering
 * @typedef {Object} RenderOptions
 * @property {string} [format='stl'] - Export format (stl, obj, off, amf, 3mf, svg, pdf, dxf)
 * @property {string} [backend='manifold'] - Geometry backend: 'manifold' (fast) or 'cgal'
 * @property {Object.<string, string|number>} [parameters] - Customizer parameters to override
 * @property {string} [parameterFile] - Path to JSON parameter file
 * @property {string} [parameterSet] - Name of parameter set to use
 */

/**
 * Options for creating an OpenSCAD instance
 * @typedef {Object} CreateOptions
 * @property {string} [wasmUrl] - URL to openscad.js (ES module)
 * @property {string} [wasmBinaryUrl] - URL to openscad.wasm (if separate from .js)
 * @property {boolean} [noInitialRun=true] - Don't run main on load (recommended)
 * @property {Object} [locateFile] - Custom file locator for Emscripten
 * @property {ArrayBuffer|Response} [fonts] - Optional font files for text() support
 */

/**
 * Result of a render operation
 * @typedef {Object} RenderResult
 * @property {ArrayBuffer} data - Binary output (STL, OBJ, etc.)
 * @property {string} format - Export format used
 * @property {number} exitCode - Process exit code (0 = success)
 */

/**
 * Creates an OpenSCAD WASM instance
 * @param {CreateOptions} [options] - Creation options
 * @returns {Promise<OpenSCADInstance>}
 */
export async function createOpenSCAD(options = {}) {
  const {
    wasmUrl = './openscad.js',
    noInitialRun = true,
    locateFile,
    fonts,
  } = options;

  const OpenSCADModule = await import(/* webpackIgnore: true */ wasmUrl);

  const moduleOptions = {
    noInitialRun: noInitialRun ?? true,
    locateFile: locateFile || ((path, scriptDirectory) => {
      if (path.endsWith('.wasm')) {
        return scriptDirectory + path.replace(/^.*\//, '');
      }
      return scriptDirectory + path;
    }),
  };

  const instance = await OpenSCADModule.default(moduleOptions);

  // Set up minimal fontconfig for text() support if fonts provided
  if (fonts) {
    try {
      instance.FS.mkdir('/fonts');
      instance.FS.writeFile('/fonts/fonts.conf', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig></fontconfig>`);

      const fontData = fonts instanceof ArrayBuffer ? fonts : await fonts.arrayBuffer();
      instance.FS.writeFile('/fonts/LiberationSans-Regular.ttf', new Uint8Array(fontData));
    } catch (e) {
      console.warn('OpenSCAD API: Could not set up fonts:', e);
    }
  }

  return new OpenSCADInstance(instance);
}

/**
 * OpenSCAD instance wrapper with clean API
 */
class OpenSCADInstance {
  /**
   * @param {Object} emscriptenInstance - Raw Emscripten module instance
   */
  constructor(emscriptenInstance) {
    this._instance = emscriptenInstance;
    this._fs = emscriptenInstance.FS;
  }

  /**
   * Parse and render SCAD source to binary output
   * @param {string} source - OpenSCAD source code
   * @param {RenderOptions} [options] - Render options
   * @returns {Promise<RenderResult>}
   */
  async render(source, options = {}) {
    const {
      format = 'stl',
      backend = 'manifold',
      parameters = {},
      parameterFile = '',
      parameterSet = '',
    } = options;

    const inputPath = DEFAULT_INPUT_FILE;
    const outputPath = DEFAULT_OUTPUT_FILE + '.' + format;

    this._fs.writeFile(inputPath, source);

    const args = [
      inputPath,
      `--backend=${backend}`,
      '-o', outputPath,
    ];

    if (parameterFile && parameterSet) {
      args.push('-p', parameterFile, '-P', parameterSet);
    } else if (Object.keys(parameters).length > 0) {
      const paramFile = '/params.json';
      const paramData = {
        fileFormatVersion: '1',
        parameterSets: {
          custom: Object.fromEntries(
            Object.entries(parameters).map(([k, v]) => [k, String(v)])
          ),
        },
      };
      this._fs.writeFile(paramFile, JSON.stringify(paramData));
      args.push('-p', paramFile, '-P', 'custom');
    }

    const exitCode = this._instance.callMain(args);

    if (exitCode !== 0) {
      const stderr = this._captureStderr();
      throw new Error(`OpenSCAD render failed (exit ${exitCode}): ${stderr}`);
    }

    let data;
    try {
      data = this._fs.readFile(outputPath, { encoding: 'binary' });
    } catch (e) {
      throw new Error(`OpenSCAD: Could not read output file ${outputPath}`);
    }

    const buffer = data.buffer instanceof ArrayBuffer
      ? data.buffer
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

    return { data: buffer, format, exitCode };
  }

  /**
   * Render to STL (convenience method)
   * @param {string} source - OpenSCAD source
   * @param {RenderOptions} [options] - Options (format overridden to stl)
   * @returns {Promise<ArrayBuffer>}
   */
  async renderToStl(source, options = {}) {
    const result = await this.render(source, { ...options, format: 'stl' });
    return result.data;
  }

  /**
   * Render to OBJ (convenience method)
   * @param {string} source - OpenSCAD source
   * @param {RenderOptions} [options] - Options
   * @returns {Promise<ArrayBuffer>}
   */
  async renderToObj(source, options = {}) {
    const result = await this.render(source, { ...options, format: 'obj' });
    return result.data;
  }

  /**
   * Check if source parses without full render (quick validation)
   * Uses --export-format=ast to parse only
   * @param {string} source - OpenSCAD source
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async parse(source) {
    const inputPath = DEFAULT_INPUT_FILE;
    const outputPath = '/parse-output.ast';

    this._fs.writeFile(inputPath, source);

    const exitCode = this._instance.callMain([
      inputPath,
      '--backend=manifold',
      '-o', outputPath,
      '--export-format=ast',
    ]);

    if (exitCode !== 0) {
      const stderr = this._captureStderr();
      return { valid: false, error: stderr };
    }

    return { valid: true };
  }

  _captureStderr() {
    try {
      return (this._instance.PATH?.stderr || []).join('') || 'Unknown error';
    } catch {
      return 'Unknown error';
    }
  }

  /**
   * Raw Emscripten instance (for advanced usage)
   */
  get raw() {
    return this._instance;
  }
}

/**
 * Create a Web Worker that runs OpenSCAD rendering off the main thread
 * @param {CreateOptions & { workerUrl?: string }} [options] - Options including optional worker script URL
 * @returns {OpenSCADWorker}
 */
export function createOpenSCADWorker(options = {}) {
  const workerUrl = options.workerUrl || new URL('openscad-worker.js', import.meta.url).href;
  const worker = new Worker(workerUrl, { type: 'module' });

  return new OpenSCADWorker(worker, options);
}

/**
 * Worker-based OpenSCAD API - runs rendering in a Web Worker
 */
class OpenSCADWorker {
  constructor(worker, options) {
    this._worker = worker;
    this._options = options;
    this._nextId = 0;
    this._pending = new Map();
  }

  _post(msg) {
    return new Promise((resolve, reject) => {
      const id = ++this._nextId;
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ ...msg, id });
    });
  }

  _handleMessage(e) {
    const { id, error, result } = e.data || {};
    const pending = id != null ? this._pending.get(id) : null;
    if (!pending) return;
    this._pending.delete(id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(result);
  }

  init() {
    this._worker.onmessage = (e) => this._handleMessage(e);
    this._worker.onerror = (e) => {
      this._pending.forEach(({ reject }) => reject(e));
      this._pending.clear();
    };
    return this._post({ type: 'init', options: this._options });
  }

  /**
   * Render SCAD source (runs in worker)
   * @param {string} source
   * @param {RenderOptions} [options]
   * @returns {Promise<RenderResult>}
   */
  async render(source, options = {}) {
    const result = await this._post({ type: 'render', source, options });
    return {
      ...result,
      data: result.data ? new ArrayBuffer(result.data) : result.data,
    };
  }

  /**
   * Render to STL
   */
  async renderToStl(source, options = {}) {
    const r = await this.render(source, { ...options, format: 'stl' });
    return r.data;
  }

  /**
   * Parse only (validate)
   */
  async parse(source) {
    return this._post({ type: 'parse', source });
  }

  terminate() {
    this._worker.terminate();
    this._pending.clear();
  }
}

export default {
  createOpenSCAD,
  createOpenSCADWorker,
  EXPORT_FORMATS,
};
