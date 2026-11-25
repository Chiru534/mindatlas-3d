import { describe, it, expect } from 'vitest';
import { analyzeCodeAutopsy } from './curseAnalyzer';
import { resurrectCode } from './resurrectionEngine';
import { LEGACY_PRESETS } from '../data/legacyPresets';

describe('DeadCode Necromancer — Curse Analyzer & Resurrection Engine', () => {
  it('detects critical security curses and computes low vitality on haunted preset', () => {
    const haunted = LEGACY_PRESETS[0].code;
    const report = analyzeCodeAutopsy(haunted);

    expect(report.vitalityScore).toBeLessThan(50);
    expect(report.curses.some((c) => c.ruleId === 'no-eval-injection')).toBe(true);
    expect(report.curses.some((c) => c.ruleId === 'sql-string-concat')).toBe(true);
    expect(report.curses.some((c) => c.ruleId === 'hardcoded-secret')).toBe(true);
    expect(report.policies.find((p) => p.id === 'zero-eval-policy')?.passed).toBe(false);
  });

  it('resurrects haunted code, raises vitality score, and passes security policies', () => {
    const haunted = LEGACY_PRESETS[1].code; // XSS jQuery widget
    const result = resurrectCode(haunted);

    expect(result.appliedFixes.length).toBeGreaterThan(0);
    expect(result.afterReport.vitalityScore).toBeGreaterThan(result.beforeReport.vitalityScore);
    expect(result.afterReport.vitalityScore).toBe(100);
    expect(result.afterReport.policies.every((p) => p.passed)).toBe(true);
    expect(result.diffLines.some((d) => d.type === 'added')).toBe(true);
    expect(result.diffLines.some((d) => d.type === 'removed')).toBe(true);
  });

  it('builds 2D SVG topology nodes and edges for functions and curses', () => {
    const report = analyzeCodeAutopsy(LEGACY_PRESETS[0].code);
    expect(report.nodes.some((n) => n.kind === 'ENTRY')).toBe(true);
    expect(report.nodes.some((n) => n.kind === 'FUNCTION')).toBe(true);
    expect(report.nodes.some((n) => n.kind === 'CURSE')).toBe(true);
    expect(report.edges.length).toBeGreaterThan(0);
  });
});
