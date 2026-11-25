export type CurseSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type CurseCategory =
  | 'SECURITY'
  | 'ASYNC'
  | 'TYPE_SAFETY'
  | 'DEAD_CODE'
  | 'LEGACY_API';

export interface Curse {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: CurseSeverity;
  category: CurseCategory;
  line: number;
  snippet: string;
  fixSummary: string;
}

export interface GraphNode2D {
  id: string;
  label: string;
  kind: 'ENTRY' | 'FUNCTION' | 'SINK' | 'CURSE';
  line: number;
  severity?: CurseSeverity;
  x: number;
  y: number;
}

export interface GraphEdge2D {
  id: string;
  from: string;
  to: string;
  tainted: boolean;
}

export interface PolicyCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface AutopsyReport {
  vitalityScore: number; // 0 to 100
  cyclomaticComplexity: number;
  lineCount: number;
  curses: Curse[];
  nodes: GraphNode2D[];
  edges: GraphEdge2D[];
  policies: PolicyCheck[];
  estimatedDebtHours: number;
}

export interface DiffLine {
  type: 'unchanged' | 'removed' | 'added';
  oldLineNum: number | null;
  newLineNum: number | null;
  content: string;
}

export interface ResurrectionResult {
  resurrectedCode: string;
  appliedFixes: string[];
  diffLines: DiffLine[];
  beforeReport: AutopsyReport;
  afterReport: AutopsyReport;
}

export interface LegacyPreset {
  id: string;
  name: string;
  era: string;
  tagline: string;
  language: string;
  code: string;
}
