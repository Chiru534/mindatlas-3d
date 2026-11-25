import { describe, it, expect } from 'vitest';
import { analyzeCodeAutopsy } from './curseAnalyzer';
import { resurrectCode } from './resurrectionEngine';
import { LEGACY_PRESETS } from '../data/legacyPresets';

describe('DeadCode Necromancer — TypeScript AST Analyzer & Resurrection Codemod', () => {
  it('detects critical AST security curses and computes low vitality on haunted preset', () => {
    const haunted = LEGACY_PRESETS[0].code;
    const report = analyzeCodeAutopsy(haunted);

    expect(report.vitalityScore).toBeLessThan(50);
    expect(report.curses.some((c) => c.ruleId === 'no-eval-injection')).toBe(true);
    expect(report.curses.some((c) => c.ruleId === 'sql-string-concat')).toBe(true);
    expect(report.curses.some((c) => c.ruleId === 'hardcoded-secret')).toBe(true);
    expect(report.policies.find((p) => p.id === 'zero-eval-policy')?.passed).toBe(false);
    expect(report.diagnostics.filter((d) => d.category === 'error').length).toBe(0);
  });

  it('ignores cursed keywords inside plain strings or comments except zombie code', () => {
    const safeCode = `const note = "eval('safe') and x == y";\nexport { note };`;
    const report = analyzeCodeAutopsy(safeCode);
    expect(report.curses.length).toBe(0);
    expect(report.vitalityScore).toBe(100);
  });

  it('uses AST reassignment tracking to choose let vs const when upgrading var', () => {
    const sample = `var count = 0;\ncount += 1;\nvar fixed = 42;\nexport { count, fixed };`;
    const res = resurrectCode(sample);
    expect(res.resurrectedCode).toContain('let count = 0;');
    expect(res.resurrectedCode).toContain('const fixed = 42;');
  });

  it('parameterizes SQL query AND binds parameter array at db call site', () => {
    const sample = LEGACY_PRESETS[0].code;
    const res = resurrectCode(sample);
    expect(res.resurrectedCode).toContain('SELECT * FROM users WHERE username = $1');
    expect(res.resurrectedCode).toContain('db.query(query, [userInput],');
    expect(res.afterReport.diagnostics.filter((d) => d.category === 'error').length).toBe(0);
    expect(res.unifiedPatch).toContain('--- a/specimen.ts');
  });

  it('resurrects XSS jQuery preset to 100% vitality and passes all Kiro policies', () => {
    const haunted = LEGACY_PRESETS[1].code;
    const result = resurrectCode(haunted);

    expect(result.appliedFixes.length).toBeGreaterThan(0);
    expect(result.afterReport.vitalityScore).toBe(100);
    expect(result.afterReport.policies.every((p) => p.passed)).toBe(true);
    expect(result.diffLines.some((d) => d.type === 'added')).toBe(true);
    expect(result.diffLines.some((d) => d.type === 'removed')).toBe(true);
  });

  it('reports real TypeScript compiler syntax diagnostics on broken code', () => {
    const broken = `function broken( { return 123;`;
    const report = analyzeCodeAutopsy(broken);
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(report.diagnostics[0].category).toBe('error');
  });
});
