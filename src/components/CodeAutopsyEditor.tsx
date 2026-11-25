import React from 'react';
import { Code2, GitCompare, AlertTriangle } from 'lucide-react';
import { Curse, DiffLine } from '../types/necromancer';

interface CodeAutopsyEditorProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  curses: Curse[];
  highlightedLine: number | null;
  viewMode: 'editor' | 'diff';
  onChangeViewMode: (mode: 'editor' | 'diff') => void;
  diffLines: DiffLine[];
  eraLabel: string;
}

export const CodeAutopsyEditor: React.FC<CodeAutopsyEditorProps> = ({
  code,
  onChangeCode,
  curses,
  highlightedLine,
  viewMode,
  onChangeViewMode,
  diffLines,
  eraLabel,
}) => {
  const lines = code.split(/\r?\n/);

  const cursesByLine = new Map<number, Curse[]>();
  curses.forEach((c) => {
    const existing = cursesByLine.get(c.line) || [];
    existing.push(c);
    cursesByLine.set(c.line, existing);
  });

  return (
    <div className="flex flex-col h-full bg-[#090d14] border border-slate-800/90 rounded-xl overflow-hidden">
      {/* Editor Header */}
      <div className="h-10 shrink-0 px-3 border-b border-slate-800/90 bg-[#0d121c] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-slate-200 truncate">
            specimen.ts
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 truncate hidden sm:inline">
            {eraLabel}
          </span>
        </div>

        {/* Source / Diff Segmented Control */}
        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => onChangeViewMode('editor')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              viewMode === 'editor'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3 h-3" />
            <span>Source</span>
          </button>
          <button
            onClick={() => onChangeViewMode('diff')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              viewMode === 'diff'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCompare className="w-3 h-3" />
            <span>Surgical Diff</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {viewMode === 'editor' ? (
        <div className="relative flex-1 overflow-auto font-mono text-xs leading-6 flex">
          {/* Gutter */}
          <div className="shrink-0 py-3 px-2 bg-[#070a10] border-r border-slate-800/70 select-none text-right min-w-[3.25rem]">
            {lines.map((_, idx) => {
              const lineNum = idx + 1;
              const lineCurses = cursesByLine.get(lineNum);
              const isHighlighted = highlightedLine === lineNum;
              const hasCritical = lineCurses?.some((c) => c.severity === 'CRITICAL');

              return (
                <div
                  key={lineNum}
                  className={`h-6 flex items-center justify-end gap-1.5 pr-1 rounded-l ${
                    isHighlighted
                      ? 'bg-violet-500/25 text-violet-200 font-bold'
                      : lineCurses
                      ? hasCritical
                        ? 'text-rose-400 font-semibold'
                        : 'text-amber-400'
                      : 'text-slate-600'
                  }`}
                >
                  {lineCurses && (
                    <AlertTriangle
                      className={`w-3 h-3 shrink-0 ${
                        hasCritical ? 'text-rose-500' : 'text-amber-400'
                      }`}
                    />
                  )}
                  <span>{lineNum}</span>
                </div>
              );
            })}
          </div>

          {/* Editable Textarea + Highlight Backdrop */}
          <div className="relative flex-1 min-w-0">
            {/* Line highlight overlay */}
            <div className="absolute inset-0 py-3 pointer-events-none">
              {lines.map((_, idx) => {
                const lineNum = idx + 1;
                const lineCurses = cursesByLine.get(lineNum);
                const isHighlighted = highlightedLine === lineNum;
                const hasCritical = lineCurses?.some((c) => c.severity === 'CRITICAL');

                return (
                  <div
                    key={lineNum}
                    className={`h-6 w-full ${
                      isHighlighted
                        ? 'bg-violet-500/15 border-l-2 border-violet-400'
                        : lineCurses
                        ? hasCritical
                          ? 'bg-rose-500/10'
                          : 'bg-amber-500/5'
                        : ''
                    }`}
                  />
                );
              })}
            </div>

            <textarea
              value={code}
              onChange={(e) => onChangeCode(e.target.value)}
              spellCheck={false}
              aria-label="Legacy Code Editor"
              className="relative z-10 w-full h-full min-h-full py-3 px-4 bg-transparent text-slate-200 font-mono text-xs leading-6 resize-none focus:outline-none whitespace-pre overflow-x-auto select-text"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto font-mono text-xs leading-6 py-2">
          {diffLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              Click &ldquo;Cast Resurrection&rdquo; to generate surgical diff.
            </div>
          ) : (
            diffLines.map((d, idx) => (
              <div
                key={idx}
                className={`flex items-start px-3 ${
                  d.type === 'removed'
                    ? 'bg-rose-500/15 text-rose-200'
                    : d.type === 'added'
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'text-slate-400'
                }`}
              >
                <span className="w-8 shrink-0 text-right pr-2 text-slate-600 select-none">
                  {d.oldLineNum ?? ''}
                </span>
                <span className="w-8 shrink-0 text-right pr-2 text-slate-600 select-none">
                  {d.newLineNum ?? ''}
                </span>
                <span className="w-4 shrink-0 select-none font-bold">
                  {d.type === 'removed' ? '-' : d.type === 'added' ? '+' : ' '}
                </span>
                <span className="whitespace-pre flex-1">{d.content}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
