/**
 * OpenSCAD Web API - TypeScript definitions
 * @see https://openscad.org/documentation.html
 */

export const EXPORT_FORMATS: Record<string, string>;

export interface RenderOptions {
  /** Export format (stl, obj, off, amf, 3mf, svg, pdf, dxf) */
  format?: 'stl' | 'obj' | 'off' | 'amf' | '3mf' | 'svg' | 'pdf' | 'dxf';
  /** Geometry backend: 'manifold' (fast) or 'cgal' */
  backend?: 'manifold' | 'cgal';
  /** Customizer parameters to override */
  parameters?: Record<string, string | number>;
  /** Path to JSON parameter file (virtual FS path) */
  parameterFile?: string;
  /** Name of parameter set to use */
  parameterSet?: string;
}

export interface CreateOptions {
  /** URL to openscad.js (ES module) */
  wasmUrl?: string;
  /** URL to openscad.wasm (if separate from .js) */
  wasmBinaryUrl?: string;
  /** Don't run main on load (recommended) */
  noInitialRun?: boolean;
  /** Custom file locator for Emscripten */
  locateFile?: (path: string, scriptDirectory: string) => string;
  /** Optional font files for text() support */
  fonts?: ArrayBuffer | Response;
}

export interface RenderResult {
  /** Binary output (STL, OBJ, etc.) */
  data: ArrayBuffer;
  /** Export format used */
  format: string;
  /** Process exit code (0 = success) */
  exitCode: number;
}

export interface ParseResult {
  valid: boolean;
  error?: string;
}

export interface OpenSCADInstance {
  /** Parse and render SCAD source to binary output */
  render(source: string, options?: RenderOptions): Promise<RenderResult>;
  /** Render to STL (convenience method) */
  renderToStl(source: string, options?: RenderOptions): Promise<ArrayBuffer>;
  /** Render to OBJ (convenience method) */
  renderToObj(source: string, options?: RenderOptions): Promise<ArrayBuffer>;
  /** Check if source parses without full render */
  parse(source: string): Promise<ParseResult>;
  /** Parse and return Phase-2 AST as JSON (`--export-format=astjson`) */
  astToJson(source: string): Promise<Record<string, unknown>>;
  /** Raw Emscripten instance (for advanced usage) */
  readonly raw: unknown;
}

export interface OpenSCADWorker {
  /** Initialize the worker with WASM (call before render) */
  init(): Promise<{ ready: boolean }>;
  /** Render SCAD source (runs in worker) */
  render(source: string, options?: RenderOptions): Promise<RenderResult>;
  /** Render to STL */
  renderToStl(source: string, options?: RenderOptions): Promise<ArrayBuffer>;
  /** Parse only (validate) */
  parse(source: string): Promise<ParseResult>;
  /** Parse and return AST JSON */
  astToJson(source: string): Promise<Record<string, unknown>>;
  /** Terminate the worker */
  terminate(): void;
}

/**
 * Creates an OpenSCAD WASM instance
 */
export function createOpenSCAD(options?: CreateOptions): Promise<OpenSCADInstance>;

/**
 * Create a Web Worker that runs OpenSCAD rendering off the main thread
 */
export function createOpenSCADWorker(options?: CreateOptions & {
  workerUrl?: string;
}): OpenSCADWorker;

declare const _default: {
  createOpenSCAD: typeof createOpenSCAD;
  createOpenSCADWorker: typeof createOpenSCADWorker;
  EXPORT_FORMATS: typeof EXPORT_FORMATS;
};

export default _default;
