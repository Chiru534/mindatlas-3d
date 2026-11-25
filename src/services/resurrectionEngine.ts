import * as ts from 'typescript';
import { DiffLine, ResurrectionResult } from '../types/necromancer';
import { analyzeCodeAutopsy, inspectAst } from './curseAnalyzer';

interface TextEdit {
  start: number;
  end: number;
  replacement: string;
  label: string;
}

/**
 * Applies conflict-free, AST-offset surgical patches (codemod style)
 * to transform legacy cursed code into clean, modern TypeScript.
 */
export function resurrectCode(sourceCode: string, targetRuleId?: string): ResurrectionResult {
  const beforeReport = analyzeCodeAutopsy(sourceCode);
  const inspection = inspectAst(sourceCode);
  const edits: TextEdit[] = [];
  const shouldApply = (ruleId: string) => !targetRuleId || targetRuleId === ruleId;

  // Map SQL var names -> bound parameter expression so we can wire call sites too
  const sqlVarBindings = new Map<string, string>();

  for (const hit of inspection.hits) {
    const { curse, start, end, meta } = hit;
    if (!shouldApply(curse.ruleId)) continue;

    switch (curse.ruleId) {
      case 'var-hoisting-leak': {
        const kw = meta?.targetKeyword || 'const';
        edits.push({
          start,
          end,
          replacement: kw,
          label: `Upgraded var declarations to block-scoped ${kw}`,
        });
        break;
      }

      case 'hardcoded-secret': {
        const varName = meta?.varName || 'API_SECRET';
        edits.push({
          start,
          end,
          replacement: `process.env.${varName} ?? ""`,
          label: 'Moved hardcoded secret to process.env',
        });
        break;
      }

      case 'no-eval-injection': {
        let arg = meta?.argText || '""';
        // Strip legacy `"(" + expr + ")"` JSONP-style eval wrapper
        const parenWrap = arg.match(/^["'`]\(["'`]\s*\+\s*([^+]+?)\s*\+\s*["'`]\)["'`]$/);
        if (parenWrap) {
          arg = parenWrap[1].trim();
        }
        edits.push({
          start,
          end,
          replacement: `JSON.parse(String(${arg}))`,
          label: 'Replaced eval() RCE vector with JSON.parse()',
        });
        break;
      }

      case 'sql-string-concat': {
        const baseSql = meta?.baseSql || 'SELECT * FROM table WHERE id =';
        const paramExpr = meta?.paramExpr || 'input';
        const sqlVarName = meta?.sqlVarName || '';
        if (sqlVarName) {
          sqlVarBindings.set(sqlVarName, paramExpr);
        }
        edits.push({
          start,
          end,
          replacement: `"${baseSql} $1"`,
          label: 'Parameterized SQL query ($1) and bound query parameters',
        });
        break;
      }

      case 'dom-xss-sink': {
        if (meta?.xssKind === 'innerHTML') {
          edits.push({
            start,
            end,
            replacement: 'textContent',
            label: 'Replaced .innerHTML XSS sink with .textContent',
          });
        } else if (meta?.xssKind === 'jsx') {
          const tag = meta.tagName || 'div';
          const expr = meta.expr || '""';
          edits.push({
            start,
            end,
            replacement: `<${tag}>{String(${expr})}</${tag}>`,
            label: 'Removed dangerouslySetInnerHTML XSS sink',
          });
        }
        break;
      }

      case 'loose-equality': {
        const op = meta?.replacement || '===';
        edits.push({
          start,
          end,
          replacement: op,
          label: 'Enforced strict equality (=== / !==)',
        });
        break;
      }

      case 'unsafe-react-lifecycle': {
        edits.push({
          start,
          end,
          replacement: 'componentDidMount',
          label: 'Migrated deprecated UNSAFE_componentWillMount lifecycle',
        });
        break;
      }

      case 'callback-pyramid': {
        const slice = sourceCode.slice(start, end).trim();
        const paramPart = slice.replace(/^function\s*/, '');
        edits.push({
          start,
          end,
          replacement: `${paramPart} => `,
          label: 'Modernized legacy callback signature to arrow handler',
        });
        break;
      }

      case 'unhandled-promise': {
        // Append .catch at the exact end of the .then(...) CallExpression so inner SQL call-site edits do not overlap
        edits.push({
          start: end,
          end,
          replacement: `.catch((err: unknown) => { console.error(err); })`,
          label: 'Added rejection .catch() handler to promise chain',
        });
        break;
      }

      case 'console-ghost':
      case 'zombie-commented-code': {
        edits.push({
          start,
          end,
          replacement: '',
          label:
            curse.ruleId === 'console-ghost'
              ? 'Exorcised stray console.log telemetry'
              : 'Purged zombie commented-out code',
        });
        break;
      }
    }
  }

  // Also wire db.query(query, cb) -> db.query(query, [param], cb) when SQL var was parameterized
  if (sqlVarBindings.size > 0) {
    const visitSqlCallSites = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isIdentifier(firstArg) && sqlVarBindings.has(firstArg.text)) {
          const boundParam = sqlVarBindings.get(firstArg.text)!;
          // Insert `[boundParam]` right after firstArg
          const insertPos = firstArg.getEnd();
          edits.push({
            start: insertPos,
            end: insertPos,
            replacement: `, [${boundParam}]`,
            label: 'Parameterized SQL query ($1) and bound query parameters',
          });
        }
      }
      ts.forEachChild(node, visitSqlCallSites);
    };
    visitSqlCallSites(inspection.sourceFile);
  }

  // Sort edits right-to-left (highest start offset first) and filter overlaps
  edits.sort((a, b) => b.start - a.start || b.end - a.end);

  let resurrectedCode = sourceCode;
  let lastStart = Infinity;
  const appliedFixSet = new Set<string>();

  for (const edit of edits) {
    if (edit.end > lastStart) continue; // skip nested/overlapping edits safely
    resurrectedCode =
      resurrectedCode.slice(0, edit.start) +
      edit.replacement +
      resurrectedCode.slice(edit.end);
    lastStart = edit.start;
    appliedFixSet.add(edit.label);
  }

  // Normalize blank lines and strip empty if-blocks left after removing dead console.log statements
  resurrectedCode = resurrectedCode
    .replace(/\n\s*if\s*\([^)]+\)\s*\{\s*\n?\s*\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const afterReport = analyzeCodeAutopsy(resurrectedCode);
  const diffLines = computeLineDiff(sourceCode, resurrectedCode);
  const unifiedPatch = buildUnifiedPatch(diffLines, 'specimen.ts');

  return {
    resurrectedCode,
    appliedFixes: Array.from(appliedFixSet),
    diffLines,
    unifiedPatch,
    mode: 'local-ast',
    beforeReport,
    afterReport,
  };
}

/**
 * Generates a standard git-compatible unified diff patch.
 */
export function buildUnifiedPatch(diffLines: DiffLine[], fileName = 'specimen.ts'): string {
  const header = `--- a/${fileName}\n+++ b/${fileName}\n@@ -1,${
    diffLines.filter((d) => d.type !== 'added').length
  } +1,${diffLines.filter((d) => d.type !== 'removed').length} @@`;
  const body = diffLines
    .map((d) => {
      const prefix = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ';
      return `${prefix}${d.content}`;
    })
    .join('\n');
  return `${header}\n${body}\n`;
}

/**
 * Computes a clean line-by-line diff using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNum = 1;
  let newNum = 1;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({
        type: 'unchanged',
        oldLineNum: oldNum++,
        newLineNum: newNum++,
        content: oldLines[i],
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({
        type: 'removed',
        oldLineNum: oldNum++,
        newLineNum: null,
        content: oldLines[i],
      });
      i++;
    } else {
      result.push({
        type: 'added',
        oldLineNum: null,
        newLineNum: newNum++,
        content: newLines[j],
      });
      j++;
    }
  }

  while (i < m) {
    result.push({
      type: 'removed',
      oldLineNum: oldNum++,
      newLineNum: null,
      content: oldLines[i++],
    });
  }

  while (j < n) {
    result.push({
      type: 'added',
      oldLineNum: null,
      newLineNum: newNum++,
      content: newLines[j++],
    });
  }

  return result;
}
