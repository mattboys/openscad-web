/**
 * Phase 2: AST IR — JSON round-trip helpers (works with {@link OpenSCADInstance#astToJson}).
 * @module ast-ir
 */

/**
 * @typedef {Object} SourceLocation
 * @property {string} [file]
 * @property {number} firstLine
 * @property {number} firstColumn
 * @property {number} lastLine
 * @property {number} lastColumn
 */

/**
 * @typedef {Object} ExprIr
 * @property {SourceLocation|null} [loc]
 * @property {string} text
 */

/**
 * Fetch parsed AST as JSON from a WASM OpenSCAD instance (export-format astjson).
 * @param {{ astToJson: (source: string) => Promise<object> }} openscad
 * @param {string} source
 * @returns {Promise<object>}
 */
export async function astToJson(openscad, source) {
  return openscad.astToJson(source);
}

/**
 * Emit OpenSCAD source from Phase-2 IR (lossy formatting; expressions use canonical `text` from the parser).
 * @param {object} ir
 * @returns {string}
 */
export function jsonToScad(ir) {
  let out = '';
  for (const u of ir.uses || []) {
    out += `use <${u}>\n`;
  }
  for (const inc of ir.includes || []) {
    const path = typeof inc === 'string' ? inc : inc.local;
    out += `include <${path}>\n`;
  }
  out += emitBody(ir.body || [], '');
  return out;
}

/**
 * Apply minimal text edits when old/new IR trees align; falls back to full {@link jsonToScad} on mismatch.
 * @param {object} oldAst
 * @param {object} newIr
 * @param {string} source
 * @returns {{ ok: boolean, source: string, edits: Array<{loc: SourceLocation, replacement: string}>, fallback: boolean }}
 */
export function applyAstDiff(oldAst, newIr, source) {
  /** @type {Array<{loc: SourceLocation, replacement: string}>} */
  const edits = [];
  if (JSON.stringify(oldAst?.uses || []) !== JSON.stringify(newIr?.uses || [])) {
    return { ok: false, source: jsonToScad(newIr), edits: [], fallback: true };
  }
  if (JSON.stringify(oldAst?.includes || []) !== JSON.stringify(newIr?.includes || [])) {
    return { ok: false, source: jsonToScad(newIr), edits: [], fallback: true };
  }
  const ok = walkBodyDiff(oldAst?.body, newIr?.body, edits);
  if (!ok) {
    return { ok: false, source: jsonToScad(newIr), edits: [], fallback: true };
  }
  return { ok: true, source: applyEditsByLocation(source, edits), edits, fallback: false };
}

function tagPrefix(node) {
  const t = node.tags || {};
  return (t.root ? '!' : '') + (t.highlight ? '#' : '') + (t.background ? '%' : '');
}

function emitArg(a) {
  const tx = a.expr?.text ?? '';
  return a.name ? `${a.name} = ${tx}` : tx;
}

function emitBody(stmts, indent) {
  return stmts.map((s) => emitStatement(s, false, indent)).join('');
}

function emitStatement(s, inlined, indent) {
  switch (s.type) {
    case 'function':
      return emitFunction(s, indent);
    case 'module':
      return emitModule(s, indent);
    case 'assignment':
      return `${inlined ? '' : indent}${s.name} = ${s.expr?.text ?? ''};\n`;
    case 'instantiation':
    case 'if':
      return emitCallLike(s, inlined, indent);
    default:
      return '';
  }
}

function emitFunction(s, indent) {
  const params = (s.parameters || []).map(emitArg).join(', ');
  return `${indent}function ${s.name}(${params}) = ${s.expr?.text ?? ''};\n`;
}

function emitModule(s, indent) {
  const params = (s.parameters || []).map(emitArg).join(', ');
  const body = emitBody(s.body || [], `${indent}\t`);
  return `${indent}module ${s.name}(${params}) {\n${body}${indent}}\n`;
}

function emitCallLike(node, inlined, indent) {
  const lineIndent = inlined ? '' : indent;
  let s = lineIndent + tagPrefix(node);
  s += `${node.name}(`;
  s += (node.arguments || []).map(emitArg).join(', ');
  const kids = node.children;
  if (!kids || kids.length === 0) {
    s += ');\n';
    s += emitElse(node, indent);
    return s;
  }
  if (kids.length === 1) {
    s += ') ';
    s += emitStatement(kids[0], true, indent);
    s += emitElse(node, indent);
    return s;
  }
  s += ') {\n';
  s += emitBody(kids, `${indent}\t`);
  s += `${indent}}\n`;
  s += emitElse(node, indent);
  return s;
}

function emitElse(node, indent) {
  if (node.type !== 'if') return '';
  const ec = node.elseChildren;
  if (ec == null) return '';
  if (ec.length === 0) return `${indent}else;\n`;
  if (ec.length === 1) return `${indent}else ` + emitStatement(ec[0], true, indent);
  return `${indent}else {\n` + emitBody(ec, `${indent}\t`) + `${indent}}\n`;
}

/**
 * @param {object} oldN
 * @param {object} newN
 * @param {Array<{loc: SourceLocation, replacement: string}>} edits
 * @returns {boolean}
 */
function walkDiff(oldN, newN, edits) {
  if (!oldN || !newN || oldN.type !== newN.type) return false;

  switch (oldN.type) {
    case 'assignment': {
      const ot = oldN.expr?.text;
      const nt = newN.expr?.text;
      if (ot !== nt && oldN.expr?.loc) {
        edits.push({ loc: oldN.expr.loc, replacement: nt ?? '' });
      }
      return oldN.name === newN.name;
    }
    case 'function': {
      if (oldN.name !== newN.name) return false;
      const ot = oldN.expr?.text;
      const nt = newN.expr?.text;
      if (ot !== nt && oldN.expr?.loc) {
        edits.push({ loc: oldN.expr.loc, replacement: nt ?? '' });
      }
      return true;
    }
    case 'module': {
      if (oldN.name !== newN.name) return false;
      return walkBodyDiff(oldN.body, newN.body, edits);
    }
    case 'instantiation':
    case 'if': {
      if (oldN.name !== newN.name) return false;
      if (!walkArgsDiff(oldN.arguments, newN.arguments, edits)) return false;
      if (!walkBodyDiff(oldN.children, newN.children, edits)) return false;
      if (oldN.type === 'if') {
        return walkBodyDiff(oldN.elseChildren, newN.elseChildren, edits);
      }
      return true;
    }
    default:
      return false;
  }
}

function walkArgsDiff(oldA, newA, edits) {
  oldA = oldA || [];
  newA = newA || [];
  if (oldA.length !== newA.length) return false;
  for (let i = 0; i < oldA.length; i++) {
    if (oldA[i].name !== newA[i].name) return false;
    const ot = oldA[i].expr?.text;
    const nt = newA[i].expr?.text;
    if (ot !== nt && oldA[i].expr?.loc) {
      edits.push({ loc: oldA[i].expr.loc, replacement: nt ?? '' });
    }
  }
  return true;
}

function walkBodyDiff(oldB, newB, edits) {
  oldB = oldB ?? [];
  newB = newB ?? [];
  if (oldB.length !== newB.length) return false;
  for (let i = 0; i < oldB.length; i++) {
    if (!walkDiff(oldB[i], newB[i], edits)) return false;
  }
  return true;
}

/**
 * @param {string} source
 * @param {Array<{loc: SourceLocation, replacement: string}>} edits
 */
function applyEditsByLocation(source, edits) {
  const sorted = [...edits].sort((a, b) => {
    const sa = locStart(a.loc);
    const sb = locStart(b.loc);
    return sb - sa;
  });
  let out = source;
  for (const e of sorted) {
    const range = locToOffsets(out, e.loc);
    if (!range) continue;
    out = out.slice(0, range.start) + e.replacement + out.slice(range.end);
  }
  return out;
}

function locStart(loc) {
  if (!loc) return 0;
  return loc.firstLine * 1e6 + loc.firstColumn;
}

/**
 * @param {string} source
 * @param {SourceLocation|null|undefined} loc
 * @returns {{start:number,end:number}|null}
 */
function locToOffsets(source, loc) {
  if (!loc || loc.firstLine == null || loc.firstColumn == null) return null;
  const start = offsetAt(source, loc.firstLine, loc.firstColumn);
  const end = offsetAt(source, loc.lastLine, loc.lastColumn) + 1;
  if (start < 0 || end > source.length || start > end) return null;
  return { start, end };
}

function offsetAt(source, line, col) {
  let lineNo = 1;
  let i = 0;
  while (lineNo < line && i < source.length) {
    if (source.charCodeAt(i) === 10) lineNo++;
    i++;
  }
  return i + col - 1;
}
