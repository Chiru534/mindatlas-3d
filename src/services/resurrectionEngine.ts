import { DiffLine, ResurrectionResult } from '../types/necromancer';
import { analyzeCodeAutopsy } from './curseAnalyzer';

/**
 * Applies deterministic surgical patches to resurrect cursed legacy code
 * into modern, secure, strict TypeScript.
 */
export function resurrectCode(sourceCode: string, targetRuleId?: string): ResurrectionResult {
  const beforeReport = analyzeCodeAutopsy(sourceCode);
  const appliedFixes: string[] = [];
  let lines = sourceCode.split(/\r?\n/);

  const shouldApply = (ruleId: string) => !targetRuleId || targetRuleId === ruleId;

  // 1. Purge zombie commented-out code & TODO clutter
  if (shouldApply('zombie-commented-code')) {
    const filtered = lines.filter((line) => {
      const isZombie = /^\s*\/\/\s*(?:function|var|const|let|eval\(|TODO:|}|\/\/)/.test(line);
      if (isZombie && !appliedFixes.includes('Purged zombie commented-out code')) {
        appliedFixes.push('Purged zombie commented-out code');
      }
      return !isZombie;
    });
    lines = filtered;
  }

  // 2. Remove stray console.log ghosts
  if (shouldApply('console-ghost')) {
    lines = lines.filter((line) => {
      if (/\bconsole\.log\s*\(/.test(line)) {
        if (!appliedFixes.includes('Exorcised stray console.log telemetry')) {
          appliedFixes.push('Exorcised stray console.log telemetry');
        }
        return false;
      }
      return true;
    });
  }

  // 3. Line-by-line surgical transformations
  lines = lines.map((line) => {
    let updated = line;

    // Replace hardcoded secrets with env lookups
    if (
      shouldApply('hardcoded-secret') &&
      /(?:API_SECRET|STRIPE_KEY|SECRET_KEY|PASSWORD|TOKEN)\s*=\s*["'][^"']{6,}["']/i.test(updated)
    ) {
      updated = updated.replace(
        /\b(?:var|const|let)\s+([A-Z0-9_]+)\s*=\s*["'][^"']+["']/,
        'const $1 = process.env.$1 ?? ""'
      );
      if (!appliedFixes.includes('Moved hardcoded secret to process.env')) {
        appliedFixes.push('Moved hardcoded secret to process.env');
      }
    }

    // Replace eval(...) with safe JSON.parse(...)
    if (shouldApply('no-eval-injection') && /\beval\s*\(/.test(updated)) {
      updated = updated.replace(
        /eval\s*\(\s*["'`]\(["'`]\s*\+\s*([^+]+?)\s*\+\s*["'`]\)["'`]\s*\)/g,
        'JSON.parse(String($1))'
      );
      updated = updated.replace(/\beval\s*\(([^)]+)\)/g, 'JSON.parse(String($1))');
      if (!appliedFixes.includes('Replaced eval() RCE vector with JSON.parse()')) {
        appliedFixes.push('Replaced eval() RCE vector with JSON.parse()');
      }
    }

    // Parameterize SQL concatenation
    if (
      shouldApply('sql-string-concat') &&
      /(?:"(?:SELECT|INSERT|UPDATE|DELETE)\b[^"]*"|'(?:SELECT|INSERT|UPDATE|DELETE)\b[^']*'|`(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`)\s*\+/i.test(
        updated
      )
    ) {
      updated = updated.replace(
        /=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)\s*\+\s*([a-zA-Z0-9_.$]+)(?:\s*\+\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`))?/,
        (_m, d1, s1, b1, varName) => {
          const baseSql = (d1 || s1 || b1 || '').replace(/'\s*$/, '').trim();
          return `= "${baseSql} $1"; const queryParams = [${varName}]`;
        }
      );
      if (!appliedFixes.includes('Parameterized SQL query to block SQLi')) {
        appliedFixes.push('Parameterized SQL query to block SQLi');
      }
    }

    // Replace innerHTML / dangerouslySetInnerHTML
    if (shouldApply('dom-xss-sink')) {
      if (/\.innerHTML\s*=/.test(updated)) {
        updated = updated.replace(/\.innerHTML\s*=/g, '.textContent =');
        if (!appliedFixes.includes('Replaced innerHTML XSS sink with textContent')) {
          appliedFixes.push('Replaced innerHTML XSS sink with textContent');
        }
      }
      if (/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}/.test(updated)) {
        updated = updated.replace(
          /<div\s+dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}\s*\/>/,
          '<div>{String($1)}</div>'
        );
        if (!appliedFixes.includes('Removed dangerouslySetInnerHTML XSS sink')) {
          appliedFixes.push('Removed dangerouslySetInnerHTML XSS sink');
        }
      }
    }

    // Replace var -> const
    if (shouldApply('var-hoisting-leak') && /^\s*var\s+/.test(updated)) {
      updated = updated.replace(/^(\s*)var\s+/, '$1const ');
      if (!appliedFixes.includes('Upgraded var declarations to block-scoped const')) {
        appliedFixes.push('Upgraded var declarations to block-scoped const');
      }
    }

    // Replace == / != with === / !==
    if (shouldApply('loose-equality') && /[^=!<>]==[^=]|[^!]!=[^=]/.test(updated)) {
      updated = updated.replace(/([^=!<>])==([^=])/g, '$1===$2');
      updated = updated.replace(/([^!])!=([^=])/g, '$1!==$2');
      if (!appliedFixes.includes('Enforced strict equality (=== / !==)')) {
        appliedFixes.push('Enforced strict equality (=== / !==)');
      }
    }

    // Modernize UNSAFE_componentWillMount
    if (
      shouldApply('unsafe-react-lifecycle') &&
      /\b(?:UNSAFE_componentWillMount|componentWillMount)\s*\(\)/.test(updated)
    ) {
      updated = updated.replace(
        /\b(?:UNSAFE_componentWillMount|componentWillMount)\s*\(\)/,
        'componentDidMount()'
      );
      if (!appliedFixes.includes('Migrated deprecated UNSAFE_componentWillMount')) {
        appliedFixes.push('Migrated deprecated UNSAFE_componentWillMount');
      }
    }

    // Modernize callback / unhandled promise markers
    if (
      shouldApply('callback-pyramid') &&
      /function\s*\(\s*(?:err|saveErr|e)\b/.test(updated)
    ) {
      updated = updated.replace(/function\s*\(([^)]*)\)/, 'async ($1) =>');
      if (!appliedFixes.includes('Modernized legacy callback to async arrow handler')) {
        appliedFixes.push('Modernized legacy callback to async arrow handler');
      }
    }

    if (shouldApply('unhandled-promise') && /\.then\s*\(/.test(updated)) {
      updated = updated.replace(/\.then\s*\(\s*function\s*\(([^)]*)\)/, '.then(($1) =>');
      if (!appliedFixes.includes('Modernized promise chain & added rejection guard')) {
        appliedFixes.push('Modernized promise chain & added rejection guard');
      }
    }

    return updated;
  });

  // If unhandled-promise was fixed, ensure a .catch exists if .then still present
  let resurrectedCode = lines.join('\n');
  if (
    shouldApply('unhandled-promise') &&
    /\.then\s*\(/.test(resurrectedCode) &&
    !/\.catch\s*\(/.test(resurrectedCode)
  ) {
    resurrectedCode = resurrectedCode.replace(
      /(\.then\([^;]+\));/,
      '$1.catch((err: unknown) => { throw err; });'
    );
  }

  const afterReport = analyzeCodeAutopsy(resurrectedCode);
  const diffLines = computeLineDiff(sourceCode, resurrectedCode);

  return {
    resurrectedCode,
    appliedFixes,
    diffLines,
    beforeReport,
    afterReport,
  };
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
