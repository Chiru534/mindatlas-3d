import {
  AutopsyReport,
  Curse,
  CurseSeverity,
  GraphEdge2D,
  GraphNode2D,
  PolicyCheck,
} from '../types/necromancer';

interface RuleDefinition {
  ruleId: string;
  title: string;
  description: string;
  severity: CurseSeverity;
  category: Curse['category'];
  pattern: RegExp;
  fixSummary: string;
}

const CURSE_RULES: RuleDefinition[] = [
  {
    ruleId: 'no-eval-injection',
    title: 'Arbitrary Code Execution (eval / Function)',
    description:
      'Dynamic eval() executes untrusted strings in local scope, enabling full remote code execution and breaking JIT optimization.',
    severity: 'CRITICAL',
    category: 'SECURITY',
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
    fixSummary: 'Replace eval() with safe JSON.parse() inside a guarded try/catch block.',
  },
  {
    ruleId: 'sql-string-concat',
    title: 'SQL Injection via String Concatenation',
    description:
      'Interpolating or concatenating user input directly into SQL statements allows attackers to hijack database queries.',
    severity: 'CRITICAL',
    category: 'SECURITY',
    pattern: /(?:"(?:SELECT|INSERT|UPDATE|DELETE)\b[^"]*"|'(?:SELECT|INSERT|UPDATE|DELETE)\b[^']*'|`(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`)\s*\+/i,
    fixSummary: 'Convert to parameterized prepared statement ($1 placeholder + bound array).',
  },
  {
    ruleId: 'hardcoded-secret',
    title: 'Hardcoded Secret / API Credential',
    description:
      'API keys or tokens committed in source code leak immediately through version control and client bundles.',
    severity: 'CRITICAL',
    category: 'SECURITY',
    pattern: /(?:API_SECRET|STRIPE_KEY|SECRET_KEY|PASSWORD|TOKEN)\s*=\s*["'][^"']{6,}["']/i,
    fixSummary: 'Read credential from process.env with runtime assertion.',
  },
  {
    ruleId: 'dom-xss-sink',
    title: 'DOM XSS Sink (innerHTML / dangerouslySetInnerHTML)',
    description:
      'Writing unescaped strings to innerHTML or dangerouslySetInnerHTML allows arbitrary script injection.',
    severity: 'HIGH',
    category: 'SECURITY',
    pattern: /\.innerHTML\s*=|dangerouslySetInnerHTML/,
    fixSummary: 'Use textContent or sanitized JSX interpolation instead of raw HTML injection.',
  },
  {
    ruleId: 'callback-pyramid',
    title: 'Nested Callback Hell',
    description:
      'Deeply nested anonymous callbacks obscure error propagation and create fragile control flow.',
    severity: 'HIGH',
    category: 'ASYNC',
    pattern: /function\s*\(\s*(?:err|saveErr|e)\b/,
    fixSummary: 'Refactor callback chain into linear async/await with structured try/catch.',
  },
  {
    ruleId: 'unhandled-promise',
    title: 'Unhandled Promise Chain (.then without .catch)',
    description:
      'Promise chains without rejection handlers cause silent failures or process crashes in modern runtimes.',
    severity: 'MEDIUM',
    category: 'ASYNC',
    pattern: /\.then\s*\(/,
    fixSummary: 'Convert .then() chain to async/await wrapped in error handling.',
  },
  {
    ruleId: 'unsafe-react-lifecycle',
    title: 'Deprecated React Lifecycle (UNSAFE_ / componentWillMount)',
    description:
      'Legacy React lifecycle methods are incompatible with Concurrent Rendering and often leak timers.',
    severity: 'HIGH',
    category: 'LEGACY_API',
    pattern: /\b(?:UNSAFE_componentWillMount|componentWillMount|componentWillReceiveProps)\b/,
    fixSummary: 'Migrate to functional component with useEffect() and cleanup return.',
  },
  {
    ruleId: 'var-hoisting-leak',
    title: 'Function-Scoped var Hoisting Leak',
    description:
      'Using var leaks variables across block boundaries and enables accidental redeclaration bugs.',
    severity: 'MEDIUM',
    category: 'TYPE_SAFETY',
    pattern: /^\s*var\s+[a-zA-Z_$][\w$]*/,
    fixSummary: 'Replace var with block-scoped const or let.',
  },
  {
    ruleId: 'loose-equality',
    title: 'Loose Equality Coercion (== / !=)',
    description:
      'Abstract equality performs implicit type coercion, causing subtle truthiness bugs.',
    severity: 'MEDIUM',
    category: 'TYPE_SAFETY',
    pattern: /[^=!<>]==[^=]|[^!]!=[^=]/,
    fixSummary: 'Enforce strict equality (=== / !==).',
  },
  {
    ruleId: 'console-ghost',
    title: 'Production Console Ghost',
    description:
      'Stray console.log statements leak internal payloads and clutter production telemetry.',
    severity: 'LOW',
    category: 'DEAD_CODE',
    pattern: /\bconsole\.log\s*\(/,
    fixSummary: 'Remove stray debug log or route to structured logger.',
  },
  {
    ruleId: 'zombie-commented-code',
    title: 'Zombie Commented-Out Code Block',
    description:
      'Dead commented-out functions rot over time and confuse maintainers during incidents.',
    severity: 'LOW',
    category: 'DEAD_CODE',
    pattern: /^\s*\/\/\s*(?:function|var|const|let|eval\(|TODO:)/,
    fixSummary: 'Purge dead commented code (rely on git history).',
  },
];

const SEVERITY_WEIGHT: Record<CurseSeverity, number> = {
  CRITICAL: 22,
  HIGH: 14,
  MEDIUM: 8,
  LOW: 4,
};

/**
 * Performs static autopsy on source code, returning curses, vitality score,
 * 2D SVG topology graph nodes/edges, and Kiro policy hook statuses.
 */
export function analyzeCodeAutopsy(sourceCode: string): AutopsyReport {
  const lines = sourceCode.split(/\r?\n/);
  const curses: Curse[] = [];
  let complexity = 1;

  lines.forEach((rawLine, index) => {
    const lineNum = index + 1;
    const trimmed = rawLine.trim();

    if (/\b(?:if|else if|for|while|case|catch|\?\s*)\b|&&|\|\|/.test(trimmed)) {
      complexity += 1;
    }

    // Check unhandled promise only if file lacks .catch(
    const hasCatchInFile = /\.catch\s*\(/.test(sourceCode);

    for (const rule of CURSE_RULES) {
      if (rule.ruleId === 'unhandled-promise' && hasCatchInFile) {
        continue;
      }
      if (rule.pattern.test(rawLine)) {
        curses.push({
          id: `${rule.ruleId}-L${lineNum}`,
          ruleId: rule.ruleId,
          title: rule.title,
          description: rule.description,
          severity: rule.severity,
          category: rule.category,
          line: lineNum,
          snippet: trimmed,
          fixSummary: rule.fixSummary,
        });
      }
    }
  });

  // Compute Vitality Score (0 - 100)
  const penalty = curses.reduce((acc, c) => acc + SEVERITY_WEIGHT[c.severity], 0);
  const vitalityScore = Math.max(0, Math.min(100, 100 - penalty));

  // Build crisp 2D SVG topology nodes & edges
  const { nodes, edges } = buildTopologyGraph(lines, curses);

  // Evaluate Kiro Policy Hooks
  const hasRule = (id: string) => curses.some((c) => c.ruleId === id);
  const policies: PolicyCheck[] = [
    {
      id: 'zero-eval-policy',
      label: 'zero-eval-policy',
      passed: !hasRule('no-eval-injection'),
      detail: hasRule('no-eval-injection')
        ? 'Blocked: eval() / Function() detected'
        : 'Verified: Zero arbitrary code execution',
    },
    {
      id: 'sql-parameterization',
      label: 'sql-parameterization',
      passed: !hasRule('sql-string-concat'),
      detail: hasRule('sql-string-concat')
        ? 'Blocked: Unescaped SQL concatenation'
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
          ? 'Warning: var or == coercion present'
          : 'Verified: Block-scoped & strict equality',
    },
    {
      id: 'modern-async-flow',
      label: 'modern-async-flow',
      passed: !hasRule('callback-pyramid') && !hasRule('unhandled-promise'),
      detail:
        hasRule('callback-pyramid') || hasRule('unhandled-promise')
          ? 'Warning: Legacy callback / unhandled promise'
          : 'Verified: Clean async/await control flow',
    },
  ];

  const estimatedDebtHours = Number((curses.length * 0.75 + complexity * 0.2).toFixed(1));

  return {
    vitalityScore,
    cyclomaticComplexity: complexity,
    lineCount: lines.length,
    curses,
    nodes,
    edges,
    policies,
    estimatedDebtHours,
  };
}

function buildTopologyGraph(
  lines: string[],
  curses: Curse[]
): { nodes: GraphNode2D[]; edges: GraphEdge2D[] } {
  const nodes: GraphNode2D[] = [];
  const edges: GraphEdge2D[] = [];

  // Entry node
  nodes.push({
    id: 'entry-module',
    label: 'Module Entry',
    kind: 'ENTRY',
    line: 1,
    x: 70,
    y: 120,
  });

  // Extract functions / classes
  const fnMatches: { id: string; label: string; line: number }[] = [];
  lines.forEach((line, idx) => {
    const fnMatch = line.match(/(?:function\s+([a-zA-Z_$][\w$]*)|class\s+([a-zA-Z_$][\w$]*))/);
    if (fnMatch) {
      const name = fnMatch[1] || fnMatch[2];
      fnMatches.push({
        id: `fn-${name}-${idx + 1}`,
        label: `${name}()`,
        line: idx + 1,
      });
    }
  });

  if (fnMatches.length === 0) {
    fnMatches.push({ id: 'fn-main', label: 'mainScope()', line: 1 });
  }

  fnMatches.slice(0, 4).forEach((fn, idx) => {
    const yPos = 60 + idx * 75;
    nodes.push({
      id: fn.id,
      label: fn.label,
      kind: 'FUNCTION',
      line: fn.line,
      x: 245,
      y: yPos,
    });
    edges.push({
      id: `e-entry-${fn.id}`,
      from: 'entry-module',
      to: fn.id,
      tainted: curses.some((c) => c.line >= fn.line && c.severity === 'CRITICAL'),
    });
  });

  // Top curses as right-side sink/curse nodes (max 5 so SVG stays ultra-crisp)
  const topCurses = curses.slice(0, 5);
  if (topCurses.length === 0) {
    nodes.push({
      id: 'clean-vessel',
      label: 'Pure Vessel (0 Curses)',
      kind: 'SINK',
      line: 1,
      x: 455,
      y: 120,
    });
    fnMatches.slice(0, 4).forEach((fn) => {
      edges.push({
        id: `e-${fn.id}-clean`,
        from: fn.id,
        to: 'clean-vessel',
        tainted: false,
      });
    });
  } else {
    topCurses.forEach((curse, idx) => {
      const yPos = 42 + idx * 54;
      const curseNodeId = `curse-${curse.id}`;
      nodes.push({
        id: curseNodeId,
        label: `L${curse.line}: ${curse.ruleId}`,
        kind: 'CURSE',
        line: curse.line,
        severity: curse.severity,
        x: 455,
        y: yPos,
      });

      // Link from closest preceding function
      let parentFn = fnMatches[0];
      for (const fn of fnMatches.slice(0, 4)) {
        if (fn.line <= curse.line) {
          parentFn = fn;
        }
      }
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
