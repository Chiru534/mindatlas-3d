import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Wand2,
  Activity,
  CheckCircle2,
  XCircle,
  FileCheck2,
} from 'lucide-react';
import { AutopsyReport, Curse } from '../types/necromancer';

interface CurseInspectorPanelProps {
  report: AutopsyReport;
  appliedFixes: string[];
  onSelectCurse: (line: number) => void;
  onExorciseSingle: (ruleId: string) => void;
}

export const CurseInspectorPanel: React.FC<CurseInspectorPanelProps> = ({
  report,
  appliedFixes,
  onSelectCurse,
  onExorciseSingle,
}) => {
  const [tab, setTab] = useState<'curses' | 'kiro'>('curses');

  const badgeStyle = (sev: Curse['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      case 'HIGH':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    }
  };

  return (
    <aside className="flex flex-col h-full bg-[#090d14] border border-slate-800/90 rounded-xl overflow-hidden">
      {/* Telemetry Metrics Strip */}
      <div className="grid grid-cols-3 border-b border-slate-800/90 bg-[#0d121c] divide-x divide-slate-800/80">
        <div className="p-2.5 text-center">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Complexity</div>
          <div className="text-sm font-bold font-mono text-white">
            {report.cyclomaticComplexity}
          </div>
        </div>
        <div className="p-2.5 text-center">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Tech Debt</div>
          <div className="text-sm font-bold font-mono text-amber-400">
            {report.estimatedDebtHours}h
          </div>
        </div>
        <div className="p-2.5 text-center">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Lines</div>
          <div className="text-sm font-bold font-mono text-cyan-400">{report.lineCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/90 bg-[#0b0f17] p-1 gap-1">
        <button
          onClick={() => setTab('curses')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === 'curses'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Curses ({report.curses.length})</span>
        </button>
        <button
          onClick={() => setTab('kiro')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === 'kiro'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            Kiro Hooks ({report.policies.filter((p) => p.passed).length}/{report.policies.length})
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {tab === 'curses' ? (
          report.curses.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Vessel Purified (100% Vitality)</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Zero security, concurrency, or legacy curses remain in this module.
                </p>
              </div>
              {appliedFixes.length > 0 && (
                <div className="w-full mt-2 text-left bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-1">
                  <div className="text-[10px] font-mono uppercase text-emerald-400 font-semibold mb-1.5">
                    Surgical Patches Applied
                  </div>
                  {appliedFixes.map((fix, i) => (
                    <div key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{fix}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            report.curses.map((curse) => (
              <div
                key={curse.id}
                onClick={() => onSelectCurse(curse.line)}
                className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${badgeStyle(
                      curse.severity
                    )}`}
                  >
                    {curse.severity}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">Line {curse.line}</span>
                </div>

                <h4 className="text-xs font-semibold text-white leading-snug">{curse.title}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">{curse.description}</p>

                <div className="text-[11px] font-mono bg-[#05080f] border border-slate-800/90 rounded px-2 py-1.5 text-rose-300 truncate">
                  {curse.snippet}
                </div>

                <div className="pt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-emerald-400/90 truncate">
                    Fix: {curse.fixSummary}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExorciseSingle(curse.ruleId);
                    }}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Exorcise</span>
                  </button>
                </div>
              </div>
            ))
          )
        ) : (
          <div className="space-y-2">
            <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center gap-2 text-[11px] text-slate-300">
              <Activity className="w-4 h-4 text-violet-400 shrink-0" />
              <span>
                Live validation against{' '}
                <code className="text-violet-300 font-mono">
                  .kiro/hooks/resurrection-validator.json
                </code>
              </span>
            </div>
            {report.policies.map((policy) => (
              <div
                key={policy.id}
                className={`p-3 rounded-xl border ${
                  policy.passed
                    ? 'bg-emerald-500/5 border-emerald-500/25'
                    : 'bg-rose-500/5 border-rose-500/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-white">
                    {policy.label}
                  </span>
                  {policy.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{policy.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
