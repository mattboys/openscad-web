import assert from 'node:assert';
import { describe, it } from 'node:test';
import { applyAstDiff, jsonToScad } from '../web/ast-ir.js';

describe('jsonToScad', () => {
  it('emits a simple cube call', () => {
    const ir = {
      version: 1,
      body: [
        {
          type: 'instantiation',
          name: 'cube',
          tags: {},
          arguments: [{ name: '', expr: { text: '10' } }],
          children: null,
        },
      ],
    };
    assert.match(jsonToScad(ir), /cube\s*\(\s*10\s*\)/);
  });

  it('prefixes modifier tags', () => {
    const ir = {
      body: [
        {
          type: 'instantiation',
          name: 'sphere',
          tags: { root: true, highlight: false, background: false },
          arguments: [{ name: '', expr: { text: '1' } }],
          children: null,
        },
      ],
    };
    assert.match(jsonToScad(ir), /!sphere\s*\(\s*1\s*\)/);
  });
});

describe('applyAstDiff', () => {
  it('patches a numeric argument by source location', () => {
    const source = 'cube(5);\n';
    const oldAst = {
      uses: [],
      includes: [],
      body: [
        {
          type: 'instantiation',
          name: 'cube',
          tags: {},
          arguments: [
            {
              name: '',
              expr: {
                text: '5',
                loc: { firstLine: 1, firstColumn: 6, lastLine: 1, lastColumn: 6 },
              },
            },
          ],
          children: null,
        },
      ],
    };
    const newIr = structuredClone(oldAst);
    newIr.body[0].arguments[0].expr.text = '10';

    const r = applyAstDiff(oldAst, newIr, source);
    assert.strictEqual(r.fallback, false);
    assert.strictEqual(r.source, 'cube(10);\n');
  });

  it('falls back when body length changes', () => {
    const oldAst = { uses: [], includes: [], body: [{ type: 'assignment', name: 'a', expr: { text: '1' } }] };
    const newIr = {
      uses: [],
      includes: [],
      body: [
        { type: 'assignment', name: 'a', expr: { text: '1' } },
        { type: 'assignment', name: 'b', expr: { text: '2' } },
      ],
    };
    const r = applyAstDiff(oldAst, newIr, 'a = 1;\n');
    assert.strictEqual(r.fallback, true);
    assert.match(r.source, /b\s*=\s*2/);
  });
});
