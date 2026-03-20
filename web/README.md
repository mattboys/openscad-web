# OpenSCAD Web API

JavaScript/TypeScript API for the OpenSCAD WASM build. See [../docs/WEB_API.md](../docs/WEB_API.md) for full documentation.

## Files

| File | Description |
|------|-------------|
| `openscad-api.js` | Main API: `createOpenSCAD`, `createOpenSCADWorker` |
| `ast-ir.js` | Phase 2: `astToJson`, `jsonToScad`, `applyAstDiff` |
| `openscad-api.d.ts` | TypeScript definitions |
| `ast-ir.d.ts` | TypeScript definitions for AST IR helpers |
| `openscad-worker.js` | Web Worker implementation |
| `index.html` | Demo page |

## Build & Run

1. Build WASM (requires Docker):
   ```bash
   ./scripts/wasm-base-docker-run.sh emcmake cmake -B build-web -DCMAKE_BUILD_TYPE=Release -DEXPERIMENTAL=1
   ./scripts/wasm-base-docker-run.sh cmake --build build-web -j2
   ```

2. Serve the project root (so both `web/` and `build-web/` are accessible):
   ```bash
   npx serve . -p 3000
   ```

3. Open http://localhost:3000/web/

## Usage

```javascript
import { createOpenSCAD } from './openscad-api.js';

const openscad = await createOpenSCAD({
  wasmUrl: '../build-web/openscad.js',
  locateFile: (path) => path.endsWith('.wasm') ? '../build-web/openscad.wasm' : path,
});

const stl = await openscad.renderToStl('cube(10);');
```
