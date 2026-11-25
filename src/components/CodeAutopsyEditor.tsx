import React, { useState } from 'react';
import {
  Code2,
  GitCompare,
  Columns2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Upload,
} from 'lucide-react';
import { CompilerDiagnostic, Curse, DiffLine } from '../types/necromancer';

interface CodeAutopsyEditorProps {
  fileName: string;
  code: string;
  originalCode: string;
  onChangeCode: (newCode: string) => void;
  onDropFile: (name: string, content: string) => void;
  curses: Curse[];
  diagnostics: CompilerDiagnostic[];
  highlightedLine: number | null;
  onHighlightLine: (line: number) => void;
  viewMode: 'editor' | 'split' | 'diff';
  onChangeViewMode: (mode: 'editor' | 'split' | 'diff') => void;
  diffLines: DiffLine[];
  eraLabel: string;
}

export const CodeAutopsyEditor: React.FC<CodeAutopsyEditorProps> = ({
  fileName,
  code,
  originalCode,
  onChangeCode,
  onDropFile,
  curses,
  diagnostics,
  highlightedLine,
  onHighlightLine,
  viewMode,
  onChangeViewMode,
  diffLines,
  eraLabel,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const lines = code.split(/\r?\n/);

  const cursesByLine = new Map<number, Curse[]>();
  curses.forEach((c) => {
    const existing = cursesByLine.get(c.line) || [];
    existing.push(c);
    cursesByLine.set(c.line, existing);
  });

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    onDropFile(file.name, text);
  };

  const errorDiagnostics = diagnostics.filter((d) => d.category === 'error');

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col h-full bg-[#090d14] border rounded-xl overflow-hidden transition-colors ${
        isDragging ? 'border-violet-400 bg-violet-950/20' : 'border-slate-800/90'
      }`}
    >
      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-30 bg-[#070a12]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Upload className="w-8 h-8 text-violet-400 animate-bounce" />
          <span className="text-sm font-semibold text-white">
            Drop .js / .ts / .tsx file for AST Autopsy
          </span>
        </div>
      )}

      {/* Editor Header */}
      <div className="h-10 shrink-0 px-3 border-b border-slate-800/90 bg-[#0d121c] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-slate-200 truncate">
            {fileName}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 truncate hidden sm:inline">
            {eraLabel}
          </span>
        </div>

        {/* Source / Split / Unified Diff Segmented Control */}
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
            onClick={() => onChangeViewMode('split')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              viewMode === 'split'
                ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            <span className="hidden sm:inline">Split Diff</span>
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
            <span className="hidden sm:inline">Unified Diff</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
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
      ) : viewMode === 'split' ? (
        <div className="flex-1 grid grid-cols-2 divide-x divide-slate-800/90 min-h-0 overflow-hidden font-mono text-xs leading-6">
          {/* Before Pane */}
          <div className="flex flex-col min-h-0 overflow-auto bg-rose-950/5">
            <div className="sticky top-0 z-10 px-3 py-1 bg-[#0b0e15] border-b border-slate-800 text-[10px] font-mono uppercase text-rose-400">
              Original Specimen (Dead)
            </div>
            <div className="py-2">
              {originalCode.split(/\r?\n/).map((line, i) => (
                <div key={i} className="flex px-3 hover:bg-slate-800/30">
                  <span className="w-7 shrink-0 text-right pr-2 text-slate-600 select-none">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre text-slate-300">{line}</span>
                </div>
              ))}
            </div>
          </div>

          {/* After Pane */}
          <div className="flex flex-col min-h-0 overflow-auto bg-emerald-950/5">
            <div className="sticky top-0 z-10 px-3 py-1 bg-[#0b0e15] border-b border-slate-800 text-[10px] font-mono uppercase text-emerald-400">
              Current Vessel (Resurrected)
            </div>
            <div className="py-2">
              {lines.map((line, i) => (
                <div key={i} className="flex px-3 hover:bg-slate-800/30">
                  <span className="w-7 shrink-0 text-right pr-2 text-slate-600 select-none">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre text-emerald-100">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto font-mono text-xs leading-6 py-2">
          {diffLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              Click &ldquo;Cast Resurrection&rdquo; or exorcise a curse to generate unified diff.
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

      {/* Real TypeScript Compiler Diagnostics Footer */}
      <div className="h-7 shrink-0 px-3 border-t border-slate-800/90 bg-[#0b0f17] flex items-center justify-between text-[11px] font-mono">
        {errorDiagnostics.length === 0 ? (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>tsc AST &amp; Syntax Check: 0 errors</span>
          </div>
        ) : (
          <button
            onClick={() => {
              onChangeViewMode('editor');
              onHighlightLine(errorDiagnostics[0].line);
            }}
            className="flex items-center gap-1.5 text-rose-400 hover:underline cursor-pointer truncate"
          >
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              TS{errorDiagnostics[0].code} (Line {errorDiagnostics[0].line}):{' '}
              {errorDiagnostics[0].message}
            </span>
          </button>
        )}
        <span className="text-slate-500 hidden sm:inline">Drag &amp; drop any .js/.ts file</span>
      </div>
    </div>
  );
};
