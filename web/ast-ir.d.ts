/** Phase 2 AST IR: JSON codegen and minimal diff (docs/WEB_REBUILD_PLAN.md). */

export interface SourceLocation {
  file?: string;
  firstLine: number;
  firstColumn: number;
  lastLine: number;
  lastColumn: number;
}

export interface ExprIr {
  loc?: SourceLocation | null;
  text: string;
}

export interface AstDiffEdit {
  loc: SourceLocation;
  replacement: string;
}

export interface AstDiffResult {
  ok: boolean;
  source: string;
  edits: AstDiffEdit[];
  fallback: boolean;
}

export function astToJson(
  openscad: { astToJson(source: string): Promise<Record<string, unknown>> },
  source: string
): Promise<Record<string, unknown>>;

export function jsonToScad(ir: Record<string, unknown>): string;

export function applyAstDiff(
  oldAst: Record<string, unknown>,
  newIr: Record<string, unknown>,
  source: string
): AstDiffResult;
