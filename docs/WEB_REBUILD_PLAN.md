# OpenSCAD Web-Based Rebuild Plan

## Executive Summary

This document outlines a plan for a complete rebuild of OpenSCAD as a web-based application with visual construction tools, while maintaining full compatibility with the existing model-as-code language. The goal is to provide both a traditional code-first workflow and a visual node-based interface that generates and edits OpenSCAD source code bidirectionally.

---

## 1. Current Architecture Analysis

### 1.1 Existing OpenSCAD Stack

Based on the codebase at `/workspace`:

| Layer | Components | Technology |
|-------|------------|------------|
| **Language** | Lexer (`lexer.l`), Parser (`parser.y`), AST | Flex/Bison, C++ |
| **Evaluation** | `CSGTreeEvaluator`, `Context`, `BuiltinContext` | C++ |
| **Geometry** | `GeometryEvaluator`, CGAL, Manifold backends | C++, Nef polyhedra |
| **Rendering** | OpenCSG (preview), CGAL (final), PolySet, VBO | OpenGL |
| **GUI** | Qt, QScintilla, GLView | Desktop-only |
| **Web** | WASM build (headless), openscad-playground | Emscripten |

### 1.2 Key Separation Points

- **Headless vs GUI**: `openscad.cc` handles CLI; `openscad_gui.cc` adds Qt. The WASM build compiles the headless path.
- **AST → Node Tree → Geometry**: `SourceFile` → `ModuleInstantiation` tree → `AbstractNode` tree → `Geometry` via `GeometryEvaluator`.
- **Geometry engines**: CGAL (exact), Manifold (fast, experimental). Manifold is preferred for web due to performance.

### 1.3 Existing Web Efforts

- **openscad-wasm**: Docker-based Emscripten build producing `openscad.wasm` + `openscad.js`.
- **openscad-playground**: React/TypeScript UI with Monaco editor, model-viewer, customizer, PWA. Subset of features.

---

## 2. Design Principles

1. **Language compatibility first**: The OpenSCAD language (primitives, modules, CSG ops, transforms, functions) remains the canonical representation. Visual tools must round-trip to valid `.scad` files.
2. **Progressive enhancement**: Users can start with visual tools and graduate to code, or vice versa. Both views stay in sync.
3. **Web-native**: No desktop dependencies. Runs in browser with optional offline/PWA support.
4. **Performance**: Leverage Web Workers, incremental evaluation, and the Manifold backend for responsive interaction.

---

## 3. Target Architecture

### 3.1 High-Level Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web UI (React/TypeScript)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Code Editor  │  │ Visual Node  │  │ 3D Viewport + Tools   │  │
│  │ (Monaco)     │  │ Graph Editor │  │ (Orbit, Select, etc.) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│         │                 │                      │                │
│         └────────────┬────┴──────────────────────┘                │
│                      ▼                                            │
│         ┌────────────────────────────┐                            │
│         │  Sync Layer (Bidirectional) │                            │
│         │  AST ↔ Node Graph ↔ Code   │                            │
│         └─────────────┬──────────────┘                            │
└──────────────────────┼──────────────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────────────┐
│                      ▼                                            │
│         ┌────────────────────────────┐                            │
│         │   OpenSCAD Core (WASM)     │                            │
│         │   Parser → Eval → Geometry │                            │
│         └─────────────┬──────────────┘                            │
│                       │                                            │
│         ┌─────────────▼──────────────┐                            │
│         │  Geometry Engine (Manifold)│                            │
│         │  Mesh output → WebGL       │                            │
│         └────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Code Editor** | Edit `.scad` text; trigger parse/eval on change; support syntax highlighting, autocomplete, error underlining |
| **Visual Node Graph** | Represent constructs (primitives, transforms, CSG ops) as nodes with inputs/outputs; drag-and-drop; generate/update code |
| **Sync Layer** | Parse code → AST; map AST nodes to graph nodes; graph edits → code patches; ensure no data loss |
| **OpenSCAD Core** | Unchanged C++ engine compiled to WASM; parse, evaluate, produce geometry |
| **3D Viewport** | Display mesh; orbit/pan/zoom; optional: click-to-select node, parameter tweaks |

---

## 4. Language Compatibility Strategy

### 4.1 Full Language Support

The rebuild must support the complete OpenSCAD language as documented at https://openscad.org/documentation.html:

- **Primitives**: `cube`, `sphere`, `cylinder`, `polyhedron`, `polygon`, `circle`, `square`, `text`
- **Transforms**: `translate`, `rotate`, `scale`, `mirror`, `multmatrix`, `color`, `offset`, `resize`, `projection`
- **CSG**: `union`, `difference`, `intersection`, `hull`, `minkowski`
- **2D→3D**: `linear_extrude`, `rotate_extrude`
- **Control**: `if`, `for`, `assign`, `let`, `assert`, `echo`
- **Abstractions**: `module`, `function`, `include`, `use`
- **Special**: `$fn`, `$fa`, `$fs`, `$t` (animation), customizer parameters

### 4.2 Visual ↔ Code Mapping

| Visual Concept | Code Equivalent | Notes |
|----------------|-----------------|-------|
| Primitive node | `cube(...)`, `sphere(...)`, etc. | Parameters as node inputs |
| Transform node | `translate([x,y,z])`, `rotate(...)`, etc. | Wraps child node |
| CSG node | `union()`, `difference()`, etc. | Multiple children |
| Connection | Child relationship | Order matters for CSG |
| Variable node | `a = 5;` or inline expression | Used as input to other nodes |
| Module node | User-defined module call | May expand or stay as call |

### 4.3 Round-Trip Rules

1. **Code → Visual**: Parse AST; for each top-level or nested construct that maps to a visual node, create a node. Preserve structure (transforms wrap children; CSG groups siblings).
2. **Visual → Code**: Traverse graph in evaluation order; emit equivalent `.scad`. Use consistent formatting (configurable).
3. **Unmapped constructs**: Code that has no visual representation (e.g., complex `for` loops, custom modules with many parameters) appears as an "opaque" node or stays in a code-only region. Editing in code preserves it.

---

## 5. Visual Construction Tools Design

### 5.1 Node Graph Editor

- **Canvas**: Pannable, zoomable 2D canvas (e.g., React Flow, Rete.js, or custom).
- **Node types**:
  - **Primitives**: Cube, Sphere, Cylinder, etc. Each has parameter inputs (e.g., `size`, `r`, `h`).
  - **Transforms**: Translate, Rotate, Scale, Mirror. Have a single "geometry" input.
  - **CSG**: Union, Difference, Intersection, Hull, Minkowski. Multiple geometry inputs.
  - **Extrusion**: Linear Extrude, Rotate Extrude. 2D input + parameters.
  - **Variables**: Number, Vector, String. Output connects to parameter inputs.
- **Connections**: Geometry output → geometry input. Value output → parameter input.
- **Palette**: Drag nodes from a sidebar or quick-add menu.

### 5.2 3D Viewport Enhancements

- **Selection**: Click object in viewport → highlight corresponding node in graph and code.
- **Parameter tweaks**: Slider/input overlay for selected node's parameters.
- **Animation**: Timeline for `$t`; scrub to preview animated designs.

### 5.3 Block-Based Mode (Optional)

- Scratch/Blockly-style blocks for beginners.
- Blocks compile to OpenSCAD code.
- Lower priority; can follow after node graph is stable.

---

## 6. Technical Implementation Phases

### Phase 1: Core Web Platform (Foundation)

**Scope**: Stabilize and extend the web build; no new UI yet.

- Ensure WASM build produces a clean API: `parse(source)`, `evaluate(tree)`, `renderToMesh(tree)`, `exportSTL(geom)`.
- Expose this API via JavaScript/TypeScript bindings (Emscripten `EMSCRIPTEN_BINDINGS` or similar).
- Add Web Worker support so parsing/evaluation does not block the main thread.
- Document the JS API for consumers (playground, future visual editor).

**Dependencies**: openscad-wasm Docker image, Emscripten toolchain.

**Risks**: CGAL in WASM is heavy; Manifold-only path may be required for acceptable load times.

---

### Phase 2: AST Extraction and Code Generation

**Scope**: Bidirectional mapping between AST and a serializable intermediate representation (IR).

- Extend the C++ or add a JS layer to export AST as JSON (nodes, types, parameters, source locations).
- Implement a code generator: IR → OpenSCAD source. Preserve style where possible (e.g., existing formatting).
- Build a minimal "AST diff" utility: given old AST and new IR, produce minimal code edits (for live sync without full replace).

**Deliverables**: `astToJson()`, `jsonToScad()`, `applyAstDiff()`.

**Implementation (this repo)**:

- C++: `--export-format=astjson` → `export_source_file_ast_json()` (`src/io/export_ast_json.{h,cc}`).
- JS: `OpenSCADInstance.astToJson()` / worker message `astToJson`; `web/ast-ir.js` (`astToJson`, `jsonToScad`, `applyAstDiff`).

---

### Phase 3: Node Graph Data Model

**Scope**: Define the visual graph schema and its mapping to/from AST.

- Schema: nodes (id, type, params, position), edges (sourceNode, sourcePort, targetNode, targetPort).
- Mapping rules: e.g., `translate([1,2,3]) cube(5)` → TranslateNode(pos=[1,2,3]) with child CubeNode(size=5).
- Implement `astToGraph()` and `graphToAst()` in TypeScript, using the AST JSON from Phase 2.
- Handle edge cases: `for` loops (unroll or represent as "loop" node with template), `if` (branch node), modules (subgraph or inline).

**Deliverables**: Graph schema, mapping logic, unit tests with sample `.scad` files.

---

### Phase 4: Visual Node Editor UI

**Scope**: Implement the node graph editor as a React (or equivalent) component.

- Integrate a node editor library (React Flow, Rete.js, or custom) with the graph data model.
- Implement node types for primitives, transforms, CSG, extrusion.
- Implement connections and validation (e.g., geometry output → geometry input only).
- Sync with code editor: graph edit → regenerate code → update editor. Code edit → re-parse → update graph (with conflict handling for unsupported constructs).

**Deliverables**: Functional node editor, sync with code editor, basic UX (undo/redo, copy/paste nodes).

---

### Phase 5: 3D Viewport Integration

**Scope**: Connect viewport to selection and parameter editing.

- Click object in 3D view → resolve to AST node → highlight in graph and code.
- Parameter panel for selected node; changes propagate to graph and code.
- Optional: direct manipulation (e.g., drag to translate) with code update.

**Deliverables**: Selection linking, parameter panel, optional direct manipulation.

---

### Phase 6: Polish and Compatibility

**Scope**: Ensure production readiness and full compatibility.

- Test suite: run existing OpenSCAD test cases (or a subset) in the web build.
- Compatibility matrix: document which language features have full visual support vs. code-only.
- Performance: incremental evaluation (re-evaluate only changed subtree), caching, lazy loading of WASM.
- Accessibility, responsive layout, PWA (offline, install prompt).
- Documentation and tutorials for the dual code/visual workflow.

---

## 7. Technology Recommendations

| Area | Recommendation | Rationale |
|------|----------------|-----------|
| **Frontend** | React + TypeScript | Matches openscad-playground; ecosystem for editors and 3D |
| **Node Editor** | React Flow or Rete.js | Mature, customizable; Rete.js has stronger typing for node types |
| **Code Editor** | Monaco (VS Code engine) | Already in playground; excellent SCAD support possible |
| **3D Rendering** | Three.js or model-viewer | model-viewer used in playground; Three.js for more control |
| **WASM Glue** | Emscripten + Embind | Current build uses Emscripten; Embind for clean JS API |
| **State** | Zustand or Jotai | Lightweight; good for sync state between editor, graph, viewport |
| **Build** | Vite | Fast HMR, good TypeScript support |

---

## 8. Compatibility Matrix (Target)

| Feature | Code | Visual | Notes |
|---------|------|--------|-------|
| Primitives (cube, sphere, etc.) | ✓ | ✓ | Full support |
| Transforms | ✓ | ✓ | Full support |
| CSG operations | ✓ | ✓ | Full support |
| Linear/rotate extrude | ✓ | ✓ | 2D input as subgraph |
| Modules (built-in) | ✓ | ✓ | As nodes |
| User modules | ✓ | Partial | As opaque node or expand |
| Functions | ✓ | Partial | As expression nodes |
| For loops | ✓ | Partial | Unroll or template node |
| If/else | ✓ | Partial | Branch node |
| Include/use | ✓ | ✓ | Library nodes |
| Customizer | ✓ | ✓ | Parameter UI |
| DXF import | ✓ | ✓ | File node |
| Text | ✓ | ✓ | With font selection |
| Animation ($t) | ✓ | ✓ | Timeline in viewport |

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| WASM size/load time | Lazy load; Manifold-only build; split core from full libs |
| Parse/eval blocking UI | Web Workers; incremental eval; debounced code sync |
| Visual↔code conflicts | Last-write-wins with clear indication; "code-only" regions |
| CGAL dependency in WASM | Prioritize Manifold backend; CGAL as optional for exact mode |
| Scope creep | Phase 1–4 are MVP; Phase 5–6 are enhancements |

---

## 10. Success Criteria

1. **Compatibility**: Any valid `.scad` file from the OpenSCAD manual can be loaded, viewed, and exported without loss.
2. **Round-trip**: Edits in the visual editor produce valid, readable code; edits in the code editor update the visual graph where applicable.
3. **Performance**: Preview renders in &lt;2s for typical models; UI remains responsive during evaluation.
4. **Adoption**: Existing OpenSCAD users can use the web version without relearning; new users can start visually and transition to code.

---

## 11. References

- [OpenSCAD Documentation](https://openscad.org/documentation.html)
- [OpenSCAD User Manual (Wikibooks)](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual)
- [openscad/openscad](https://github.com/openscad/openscad) – Main repository
- [openscad/openscad-wasm](https://github.com/openscad/openscad-wasm) – WASM build
- [openscad/openscad-playground](https://github.com/openscad/openscad-playground) – Web UI
- [Bitbybit](https://bitbybit.dev/) – Multi-editor CAD (blocks, nodes, code)
- [Nodi](https://nodi3d.com/) – Node-based geometry design

---

*Document version: 1.0*  
*Last updated: March 2025*
