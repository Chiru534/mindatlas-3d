import * as ts from 'typescript';
import {
  AutopsyReport,
  CompilerDiagnostic,
  Curse,
  CurseSeverity,
  GraphEdge2D,
  GraphNode2D,
  PolicyCheck,
} from '../types/necromancer';

export interface AstCurseHit {
  curse: Curse;
  start: number;
  end: number;
  meta?: Record<string, string>;
}

export interface AstInspectionResult {
  sourceFile: ts.SourceFile;
  hits: AstCurseHit[];
  reassignedVars: Set<string>;
  diagnostics: CompilerDiagnostic[];
  cyclomaticComplexity: number;
  functions: { id: string; label: string; line: number; endLine: number }[];
}

const SECRET_NAME_RE = /(?:API_SECRET|STRIPE_KEY|SECRET_KEY|PASSWORD|AUTH_TOKEN|API_KEY|PRIVATE_KEY)/i;
const SQL_PREFIX_RE = /^(?:SELECT|INSERT|UPDATE|DELETE)\b/i;

function getLine(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(Math.max(0, pos)).line + 1;
}

function getLineSnippet(sf: ts.SourceFile, pos: number): string {
  const lines = sf.text.split(/\r?\n/);
  const idx = getLine(sf, pos) - 1;
  return (lines[idx] ?? '').trim();
}

function extractSqlBaseAndParam(expr: ts.BinaryExpression, sf: ts.SourceFile): { baseSql: string; paramExpr: string } | null {
  const parts: ts.Expression[] = [];
  const collect = (node: ts.Expression) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      collect(node.left);
      collect(node.right);
    } else {
      parts.push(node);
    }
  };
  collect(expr);

  if (parts.length < 2) return null;
  const first = parts[0];
  if (!ts.isStringLiteralLike(first)) return null;
  if (!SQL_PREFIX_RE.test(first.text.trim())) return null;

  const nonLiteral = parts.find((p) => !ts.isStringLiteralLike(p));
  if (!nonLiteral) return null;

  const cleanedBase = first.text.replace(/'\s*$/, '').trim();
  return {
    baseSql: cleanedBase,
    paramExpr: nonLiteral.getText(sf),
  };
}

/**
 * Parses source code with the Microsoft TypeScript compiler AST & runs syntactic diagnostics.
 */
export function inspectAst(sourceCode: string): AstInspectionResult {
  const sourceFile = ts.createSourceFile(
    'specimen.tsx',
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  // Real TypeScript syntactic transpile diagnostics
  const transpileRes = ts.transpileModule(sourceCode, {
    fileName: 'specimen.tsx',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
    },
  });

  const diagnostics: CompilerDiagnostic[] = (transpileRes.diagnostics || []).map((d) => ({
    line: d.start !== undefined ? getLine(sourceFile, d.start) : 1,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    category: d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
  }));

  const reassignedVars = new Set<string>();
  const hits: AstCurseHit[] = [];
  const functions: { id: string; label: string; line: number; endLine: number }[] = [];
  let cyclomaticComplexity = 1;

  // Pass 1: Collect variable reassignments & cyclomatic complexity & function definitions
  const scanPass1 = (node: ts.Node) => {
    if (
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isCaseClause(node) ||
      ts.isConditionalExpression(node) ||
      ts.isCatchClause(node)
    ) {
      cyclomaticComplexity += 1;
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      cyclomaticComplexity += 1;
    }

    // Track reassignments for smart var -> const vs let
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      if (ts.isIdentifier(node.left)) {
        reassignedVars.add(node.left.text);
      }
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      ts.isIdentifier(node.operand)
    ) {
      reassignedVars.add(node.operand.text);
    }

    // Collect named functions, classes, and methods for 2D SVG topology
    if (ts.isFunctionDeclaration(node) && node.name) {
      const line = getLine(sourceFile, node.getStart(sourceFile));
      const endLine = getLine(sourceFile, node.getEnd());
      functions.push({
        id: `fn-${node.name.text}-${line}`,
        label: `${node.name.text}()`,
        line,
        endLine,
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      const line = getLine(sourceFile, node.getStart(sourceFile));
      const endLine = getLine(sourceFile, node.getEnd());
      functions.push({
        id: `class-${node.name.text}-${line}`,
        label: `class ${node.name.text}`,
        line,
        endLine,
      });
    } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const line = getLine(sourceFile, node.getStart(sourceFile));
      const endLine = getLine(sourceFile, node.getEnd());
      functions.push({
        id: `method-${node.name.text}-${line}`,
        label: `.${node.name.text}()`,
        line,
        endLine,
      });
    }

    ts.forEachChild(node, scanPass1);
  };
  scanPass1(sourceFile);

  // Track seen comment positions so we don't duplicate comment curses
  const seenCommentPos = new Set<number>();

  const checkComments = (pos: number) => {
    const leading = ts.getLeadingCommentRanges(sourceCode, pos) || [];
    for (const c of leading) {
      if (seenCommentPos.has(c.pos)) continue;
      seenCommentPos.add(c.pos);
      const commentText = sourceCode.slice(c.pos, c.end);
      if (/\/\/\s*(?:function|var|const|let|eval\(|TODO:|}|\/\/)/.test(commentText)) {
        const line = getLine(sourceFile, c.pos);
        hits.push({
          curse: {
            id: `zombie-commented-code-L${line}-${c.pos}`,
            ruleId: 'zombie-commented-code',
            title: 'Zombie Commented-Out Code',
            description:
              'Dead commented-out code and stale TODOs rot over time and obscure incident root causes.',
            severity: 'LOW',
            category: 'DEAD_CODE',
            line,
            snippet: commentText.trim(),
            fixSummary: 'Purge dead commented block (preserved in git history).',
          },
          start: c.pos,
          end: c.end,
        });
      }
    }
  };

  // Pass 2: AST Curse Detection
  const scanPass2 = (node: ts.Node) => {
    checkComments(node.getFullStart());

    // 1. var declarations
    if (
      ts.isVariableDeclarationList(node) &&
      (node.flags & ts.NodeFlags.Let) === 0 &&
      (node.flags & ts.NodeFlags.Const) === 0
    ) {
      const start = node.getStart(sourceFile);
      const line = getLine(sourceFile, start);
      const names = node.declarations
        .map((d) => (ts.isIdentifier(d.name) ? d.name.text : ''))
        .filter(Boolean);
      const isReassigned = names.some((n) => reassignedVars.has(n));
      const keyword = isReassigned ? 'let' : 'const';

      hits.push({
        curse: {
          id: `var-hoisting-leak-L${line}-${start}`,
          ruleId: 'var-hoisting-leak',
          title: 'Function-Scoped var Hoisting Leak',
          description:
            'var ignores block scope and hoists to the nearest function boundary, enabling subtle mutation bugs.',
          severity: 'MEDIUM',
          category: 'TYPE_SAFETY',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: `Upgrade var declaration to block-scoped ${keyword}.`,
        },
        start,
        end: start + 3, // exact 'var' keyword span
        meta: { targetKeyword: keyword },
      });
    }

    // 2. Hardcoded secrets in VariableDeclaration
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      SECRET_NAME_RE.test(node.name.text) &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer) &&
      node.initializer.text.length >= 6
    ) {
      const start = node.initializer.getStart(sourceFile);
      const end = node.initializer.getEnd();
      const line = getLine(sourceFile, start);
      hits.push({
        curse: {
          id: `hardcoded-secret-L${line}-${start}`,
          ruleId: 'hardcoded-secret',
          title: 'Hardcoded Secret / API Credential',
          description:
            'Static credentials embedded in source code expose production infrastructure via git history and bundles.',
          severity: 'CRITICAL',
          category: 'SECURITY',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: `Load ${node.name.text} from process.env.${node.name.text}.`,
        },
        start,
        end,
        meta: { varName: node.name.text },
      });
    }

    // 3. eval(...) or new Function(...)
    if (
      (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'eval') ||
      (ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Function')
    ) {
      const start = node.getStart(sourceFile);
      const end = node.getEnd();
      const line = getLine(sourceFile, start);
      const argText = node.arguments?.[0]?.getText(sourceFile) ?? '""';
      hits.push({
        curse: {
          id: `no-eval-injection-L${line}-${start}`,
          ruleId: 'no-eval-injection',
          title: 'Arbitrary Code Execution (eval / Function)',
          description:
            'eval() compiles and runs untrusted strings in local lexical scope, creating an immediate RCE backdoor.',
          severity: 'CRITICAL',
          category: 'SECURITY',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: 'Replace eval() with safe JSON.parse().',
        },
        start,
        end,
        meta: { argText },
      });
    }

    // 4. SQL String Concatenation inside BinaryExpression
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      !(
        ts.isBinaryExpression(node.parent) &&
        node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
      )
    ) {
      const sqlInfo = extractSqlBaseAndParam(node, sourceFile);
      if (sqlInfo) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const line = getLine(sourceFile, start);

        // Identify variable name if assigned like `var query = ...`
        let sqlVarName = '';
        if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
          sqlVarName = node.parent.name.text;
        }

        hits.push({
          curse: {
            id: `sql-string-concat-L${line}-${start}`,
            ruleId: 'sql-string-concat',
            title: 'SQL Injection via String Concatenation',
            description:
              'Concatenating dynamic variables directly into SQL text enables attackers to bypass authentication or dump tables.',
            severity: 'CRITICAL',
            category: 'SECURITY',
            line,
            snippet: getLineSnippet(sourceFile, start),
            fixSummary: `Parameterize SQL ($1) and bind [${sqlInfo.paramExpr}] at db call site.`,
          },
          start,
          end,
          meta: {
            baseSql: sqlInfo.baseSql,
            paramExpr: sqlInfo.paramExpr,
            sqlVarName,
          },
        });
      }
    }

    // 5. DOM XSS sink: .innerHTML = ...
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'innerHTML'
    ) {
      const start = node.left.name.getStart(sourceFile);
      const end = node.left.name.getEnd();
      const line = getLine(sourceFile, start);
      hits.push({
        curse: {
          id: `dom-xss-sink-L${line}-${start}`,
          ruleId: 'dom-xss-sink',
          title: 'DOM XSS Sink (.innerHTML)',
          description:
            'Assigning unescaped markup to .innerHTML executes injected event handlers and script payloads.',
          severity: 'HIGH',
          category: 'SECURITY',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: 'Replace .innerHTML with .textContent to safely escape text.',
        },
        start,
        end,
        meta: { xssKind: 'innerHTML' },
      });
    }

    // 6. JSX dangerouslySetInnerHTML
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.attributes.properties.some(
        (p) =>
          ts.isJsxAttribute(p) &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'dangerouslySetInnerHTML'
      )
    ) {
      const attr = node.attributes.properties.find(
        (p): p is ts.JsxAttribute =>
          ts.isJsxAttribute(p) &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'dangerouslySetInnerHTML'
      );
      if (attr) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const line = getLine(sourceFile, start);
        const rawText = attr.initializer?.getText(sourceFile) ?? '';
        const innerMatch = rawText.match(/__html:\s*([^}\s]+)/);
        const expr = innerMatch ? innerMatch[1] : '""';
        hits.push({
          curse: {
            id: `dom-xss-sink-L${line}-${start}`,
            ruleId: 'dom-xss-sink',
            title: 'React XSS Sink (dangerouslySetInnerHTML)',
            description:
              'Bypassing React automatic escaping via dangerouslySetInnerHTML exposes components to stored XSS.',
            severity: 'HIGH',
            category: 'SECURITY',
            line,
            snippet: getLineSnippet(sourceFile, start),
            fixSummary: 'Render escaped JSX text {String(...)} instead of raw HTML.',
          },
          start,
          end,
          meta: { xssKind: 'jsx', tagName: node.tagName.getText(sourceFile), expr },
        });
      }
    }

    // 7. Loose equality (== / !=)
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)
    ) {
      const start = node.operatorToken.getStart(sourceFile);
      const end = node.operatorToken.getEnd();
      const line = getLine(sourceFile, start);
      const replacement =
        node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ? '===' : '!==';
      hits.push({
        curse: {
          id: `loose-equality-L${line}-${start}`,
          ruleId: 'loose-equality',
          title: 'Loose Equality Coercion (== / !=)',
          description:
            'Abstract equality triggers implicit JS type coercion (e.g. "" == 0), causing logic bypasses.',
          severity: 'MEDIUM',
          category: 'TYPE_SAFETY',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: `Enforce strict operator (${replacement}).`,
        },
        start,
        end,
        meta: { replacement },
      });
    }

    // 8. Deprecated React lifecycle methods
    if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /^(?:UNSAFE_componentWillMount|componentWillMount|UNSAFE_componentWillReceiveProps|componentWillReceiveProps)$/.test(
        node.name.text
      )
    ) {
      const start = node.name.getStart(sourceFile);
      const end = node.name.getEnd();
      const line = getLine(sourceFile, start);
      hits.push({
        curse: {
          id: `unsafe-react-lifecycle-L${line}-${start}`,
          ruleId: 'unsafe-react-lifecycle',
          title: `Deprecated React Lifecycle (${node.name.text})`,
          description:
            'Legacy pre-commit lifecycle hooks fail under React Concurrent Mode and commonly leak intervals/subscriptions.',
          severity: 'HIGH',
          category: 'LEGACY_API',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: 'Migrate to componentDidMount() or functional useEffect().',
        },
        start,
        end,
      });
    }

    // 9. Error-first callback pyramid
    if (
      ts.isFunctionExpression(node) &&
      ts.isCallExpression(node.parent) &&
      node.parameters.length > 0 &&
      ts.isIdentifier(node.parameters[0].name) &&
      /^(?:err|error|saveErr|e)$/i.test(node.parameters[0].name.text)
    ) {
      const start = node.getStart(sourceFile);
      const line = getLine(sourceFile, start);
      hits.push({
        curse: {
          id: `callback-pyramid-L${line}-${start}`,
          ruleId: 'callback-pyramid',
          title: 'Legacy Error-First Callback Pyramid',
          description:
            'Nested error-first callbacks fragment exception handling and create brittle pyramidal control flow.',
          severity: 'HIGH',
          category: 'ASYNC',
          line,
          snippet: getLineSnippet(sourceFile, start),
          fixSummary: 'Convert legacy function(err, ...) callback to modern arrow / async flow.',
        },
        start,
        end: node.body.getStart(sourceFile),
      });
    }

    // 10. Unhandled Promise .then() without .catch()
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'then'
    ) {
      // Check if an outer PropertyAccessExpression calls .catch
      const parentProp = node.parent;
      const hasChainedCatch =
        ts.isPropertyAccessExpression(parentProp) && parentProp.name.text === 'catch';
      if (!hasChainedCatch && !/\.catch\s*\(/.test(sourceCode)) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const line = getLine(sourceFile, start);
        hits.push({
          curse: {
            id: `unhandled-promise-L${line}-${start}`,
            ruleId: 'unhandled-promise',
            title: 'Unhandled Promise Rejection (.then without .catch)',
            description:
              'Floating promise chains without rejection handlers trigger UnhandledPromiseRejection crashes.',
            severity: 'MEDIUM',
            category: 'ASYNC',
            line,
            snippet: getLineSnippet(sourceFile, start),
            fixSummary: 'Attach .catch((err: unknown) => { throw err; }) rejection handler.',
          },
          start,
          end,
        });
      }
    }

    // 11. Stray console.log
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === 'console' &&
      node.expression.expression.name.text === 'log'
    ) {
      const start = node.getFullStart();
      const end = node.getEnd();
      const line = getLine(sourceFile, node.getStart(sourceFile));
      hits.push({
        curse: {
          id: `console-ghost-L${line}-${start}`,
          ruleId: 'console-ghost',
          title: 'Production Console Ghost (console.log)',
          description:
            'Unstructured console.log statements leak internal payloads in production telemetry.',
          severity: 'LOW',
          category: 'DEAD_CODE',
          line,
          snippet: getLineSnippet(sourceFile, node.getStart(sourceFile)),
          fixSummary: 'Purge stray debug log statement.',
        },
        start,
        end,
      });
    }

    ts.forEachChild(node, scanPass2);
  };

  scanPass2(sourceFile);
  // Also check end-of-file trailing comments (like zombie functions at bottom)
  checkComments(sourceCode.length);

  return {
    sourceFile,
    hits,
    reassignedVars,
    diagnostics,
    cyclomaticComplexity,
    functions,
  };
}

const SEVERITY_WEIGHT: Record<CurseSeverity, number> = {
  CRITICAL: 22,
  HIGH: 14,
  MEDIUM: 8,
  LOW: 4,
};

/**
 * Full AST-powered autopsy report including compiler diagnostics, vitality score,
 * interactive 2D SVG topology graph, and Kiro policy hook telemetry.
 */
export function analyzeCodeAutopsy(sourceCode: string): AutopsyReport {
  const inspection = inspectAst(sourceCode);
  const curses = inspection.hits.map((h) => h.curse);
  const lines = sourceCode.split(/\r?\n/);

  const diagPenalty = inspection.diagnostics.filter((d) => d.category === 'error').length * 18;
  const cursePenalty = curses.reduce((acc, c) => acc + SEVERITY_WEIGHT[c.severity], 0);
  const vitalityScore = Math.max(0, Math.min(100, 100 - cursePenalty - diagPenalty));

  const { nodes, edges } = buildTopologyGraph(inspection.functions, curses);

  const hasRule = (id: string) => curses.some((c) => c.ruleId === id);
  const hasErrors = inspection.diagnostics.some((d) => d.category === 'error');

  const policies: PolicyCheck[] = [
    {
      id: 'zero-eval-policy',
      label: 'zero-eval-policy',
      passed: !hasRule('no-eval-injection'),
      detail: hasRule('no-eval-injection')
        ? 'Blocked: eval() / Function() AST node detected'
        : 'Verified: Zero arbitrary code execution',
    },
    {
      id: 'sql-parameterization',
      label: 'sql-parameterization',
      passed: !hasRule('sql-string-concat'),
      detail: hasRule('sql-string-concat')
        ? 'Blocked: Unescaped SQL binary concatenation'
        : 'Verified: Parameterized query safety',
    },
    {
      id: 'xss-sink-shield',
      label: 'xss-sink-shield',
      passed: !hasRule('dom-xss-sink'),
      detail: hasRule('dom-xss-sink')
        ? 'Blocked: Raw HTML sink exposed'
        : 'Verified: DOM sinks sanitized',
    },
    {
      id: 'strict-equality-guard',
      label: 'strict-equality-guard',
      passed: !hasRule('loose-equality') && !hasRule('var-hoisting-leak'),
      detail:
        hasRule('loose-equality') || hasRule('var-hoisting-leak')
          ? 'Warning: var hoisting or == coercion present'
          : 'Verified: Block-scoped & strict equality',
    },
    {
      id: 'modern-async-flow',
      label: 'modern-async-flow',
      passed: !hasRule('callback-pyramid') && !hasRule('unhandled-promise') && !hasErrors,
      detail: hasErrors
        ? 'Blocked: TypeScript compiler syntax errors detected'
        : hasRule('callback-pyramid') || hasRule('unhandled-promise')
        ? 'Warning: Legacy callback / unhandled promise'
        : 'Verified: Clean async flow & valid TS syntax',
    },
  ];

  const estimatedDebtHours = Number(
    (curses.length * 0.75 + inspection.cyclomaticComplexity * 0.2).toFixed(1)
  );

  return {
    vitalityScore,
    cyclomaticComplexity: inspection.cyclomaticComplexity,
    lineCount: lines.length,
    curses,
    diagnostics: inspection.diagnostics,
    nodes,
    edges,
    policies,
    estimatedDebtHours,
  };
}

function buildTopologyGraph(
  functions: { id: string; label: string; line: number; endLine: number }[],
  curses: Curse[]
): { nodes: GraphNode2D[]; edges: GraphEdge2D[] } {
  const nodes: GraphNode2D[] = [];
  const edges: GraphEdge2D[] = [];

  nodes.push({
    id: 'entry-module',
    label: 'Module Entry',
    kind: 'ENTRY',
    line: 1,
    x: 70,
    y: 135,
  });

  const fnNodes =
    functions.length > 0
      ? functions.slice(0, 4)
      : [{ id: 'fn-main', label: 'moduleScope()', line: 1, endLine: 9999 }];

  fnNodes.forEach((fn, idx) => {
    const yPos = 60 + idx * 65;
    nodes.push({
      id: fn.id,
      label: fn.label,
      kind: 'FUNCTION',
      line: fn.line,
      x: 250,
      y: yPos,
    });
    edges.push({
      id: `e-entry-${fn.id}`,
      from: 'entry-module',
      to: fn.id,
      tainted: curses.some(
        (c) => c.line >= fn.line && c.line <= fn.endLine && c.severity === 'CRITICAL'
      ),
    });
  });

  const topCurses = curses.slice(0, 5);
  if (topCurses.length === 0) {
    nodes.push({
      id: 'clean-vessel',
      label: 'Pure Vessel (0 Curses)',
      kind: 'SINK',
      line: 1,
      x: 470,
      y: 135,
    });
    fnNodes.forEach((fn) => {
      edges.push({
        id: `e-${fn.id}-clean`,
        from: fn.id,
        to: 'clean-vessel',
        tainted: false,
      });
    });
  } else {
    topCurses.forEach((curse, idx) => {
      const yPos = 42 + idx * 52;
      const curseNodeId = `curse-${curse.id}`;
      nodes.push({
        id: curseNodeId,
        label: `L${curse.line}: ${curse.ruleId}`,
        kind: 'CURSE',
        line: curse.line,
        severity: curse.severity,
        x: 470,
        y: yPos,
      });

      const parentFn =
        fnNodes.find((fn) => curse.line >= fn.line && curse.line <= fn.endLine) || fnNodes[0];
      edges.push({
        id: `e-${parentFn.id}-${curseNodeId}`,
        from: parentFn.id,
        to: curseNodeId,
        tainted: curse.severity === 'CRITICAL' || curse.severity === 'HIGH',
      });
    });
  }

  return { nodes, edges };
}
