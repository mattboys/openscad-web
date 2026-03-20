# OpenSCAD Web API

Clean JavaScript/TypeScript API for the OpenSCAD WASM build. Provides `parse`, `render`, and `export` functionality with optional Web Worker support for non-blocking evaluation.

## Prerequisites

Build the OpenSCAD WASM module first:

```bash
./scripts/wasm-base-docker-run.sh emcmake cmake -B build-web -DCMAKE_BUILD_TYPE=Release -DEXPERIMENTAL=1
./scripts/wasm-base-docker-run.sh cmake --build build-web -j2
```

This produces `build-web/openscad.js` and `build-web/openscad.wasm`.

## Quick Start

### Main Thread

```javascript
import { createOpenSCAD } from './web/openscad-api.js';

const openscad = await createOpenSCAD({
  wasmUrl: './build-web/openscad.js',
  locateFile: (path) => path.endsWith('.wasm') ? './build-web/openscad.wasm' : path,
});

// Render to STL
const stlBuffer = await openscad.renderToStl('cube(10);');

// Or full render with options
const { data, format } = await openscad.render('sphere(5);', { format: 'obj' });

// Parse-only (validate syntax)
const { valid, error } = await openscad.parse('cube(10)');
```

### Web Worker (Non-Blocking)

```javascript
import { createOpenSCADWorker } from './web/openscad-api.js';

const worker = createOpenSCADWorker({
  wasmUrl: './build-web/openscad.js',
  locateFile: (path) => path.endsWith('.wasm') ? './build-web/openscad.wasm' : path,
});

await worker.init();  // Load WASM in worker
const stlBuffer = await worker.renderToStl('cube(10);');
```

## API Reference

### `createOpenSCAD(options?)`

Creates an OpenSCAD WASM instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wasmUrl` | string | `'./openscad.js'` | URL to the OpenSCAD ES module |
| `noInitialRun` | boolean | `true` | Don't run main on load (recommended) |
| `locateFile` | function | (path, scriptDir) => path | Custom file locator for Emscripten (e.g. for .wasm) |
| `fonts` | ArrayBuffer \| Response | - | Optional font for `text()` support (e.g. LiberationSans-Regular.ttf) |

### `OpenSCADInstance`

#### `render(source, options?)` → `Promise<RenderResult>`

Parse and render SCAD source to binary output.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | string | `'stl'` | Export format: stl, obj, off, amf, 3mf, svg, pdf, dxf |
| `backend` | string | `'manifold'` | Geometry backend: `manifold` (fast) or `cgal` |
| `parameters` | object | `{}` | Customizer parameters to override |

#### `renderToStl(source, options?)` → `Promise<ArrayBuffer>`

Convenience method for STL export.

#### `renderToObj(source, options?)` → `Promise<ArrayBuffer>`

Convenience method for OBJ export.

#### `parse(source)` → `Promise<ParseResult>`

Validate syntax without full geometry evaluation. Returns `{ valid: boolean, error?: string }`.

### `createOpenSCADWorker(options?)`

Creates a worker-based API. Call `init()` before `render()`.

| Option | Type | Description |
|--------|------|-------------|
| `workerUrl` | string | URL to openscad-worker.js (default: same dir as API) |
| All `createOpenSCAD` options | - | Passed to worker for WASM init |

### `OpenSCADWorker`

- `init()` → `Promise<{ ready: boolean }>` — Initialize (load WASM). Call before render.
- `render(source, options?)` → `Promise<RenderResult>`
- `renderToStl(source, options?)` → `Promise<ArrayBuffer>`
- `parse(source)` → `Promise<ParseResult>`
- `terminate()` — Terminate the worker

## Customizer Parameters

For parametric designs with `// [ParamName: 10]` style comments:

```javascript
const result = await openscad.render(source, {
  parameters: {
    width: 20,
    height: 15,
    label: 'Custom',
  },
});
```

## Font Support for `text()`

To use the `text()` module, provide a font file:

```javascript
const fontResponse = await fetch('/fonts/LiberationSans-Regular.ttf');
const openscad = await createOpenSCAD({
  wasmUrl: './openscad.js',
  fonts: fontResponse,
});
```

## Demo

Run the demo (requires built WASM):

```bash
# From project root, serve the web directory
npx serve web -p 3000
# Or: python -m http.server 3000 --directory web
```

Then open http://localhost:3000 and ensure `build-web/` is accessible (e.g. symlink or copy).

## Integration with openscad-playground

The playground at [openscad/openscad-playground](https://github.com/openscad/openscad-playground) uses a similar pattern. This API can replace or augment its WASM integration for:

- Cleaner `render(source)` semantics
- Worker-based rendering
- TypeScript support via `openscad-api.d.ts`

## See Also

- [WEB_REBUILD_PLAN.md](./WEB_REBUILD_PLAN.md) — Full architecture plan
- [OpenSCAD Documentation](https://openscad.org/documentation.html)
- [openscad-wasm](https://github.com/openscad/openscad-wasm) — Prebuilt WASM packages
