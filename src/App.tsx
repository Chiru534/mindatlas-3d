import React, { useState, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { LEGACY_PRESETS } from './data/legacyPresets';
import { analyzeCodeAutopsy } from './services/curseAnalyzer';
import { resurrectCode } from './services/resurrectionEngine';
import { resurrectWithAi } from './services/aiNecromancer';
import { AiProviderConfig, DiffLine } from './types/necromancer';
import { TopBar } from './components/TopBar';
import { CodeAutopsyEditor } from './components/CodeAutopsyEditor';
import { AutopsyGraph2D } from './components/AutopsyGraph2D';
import { CurseInspectorPanel } from './components/CurseInspectorPanel';
import {
  isAudioMuted,
  setAudioMuted,
  playScanPulse,
  playResurrectChord,
} from './services/necromancerAudio';

function toRawGitHubUrl(input: string): string {
  const blobMatch = input.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i
  );
  if (blobMatch) {
    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  }
  return input;
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const App: React.FC = () => {
  const [activePresetId, setActivePresetId] = useState<string>(LEGACY_PRESETS[0].id);
  const [fileName, setFileName] = useState<string>('authenticateUser.js');
  const [code, setCode] = useState<string>(LEGACY_PRESETS[0].code);
  const [originalCode, setOriginalCode] = useState<string>(LEGACY_PRESETS[0].code);
  const [viewMode, setViewMode] = useState<'editor' | 'split' | 'diff'>('editor');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [unifiedPatch, setUnifiedPatch] = useState<string>('');
  const [beforeVitality, setBeforeVitality] = useState<number | null>(null);
  const [resurrectionMode, setResurrectionMode] = useState<'local-ast' | 'ai-assisted' | null>(null);
  const [isResurrected, setIsResurrected] = useState<boolean>(false);
  const [isResurrecting, setIsResurrecting] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig | null>(null);
  const [audioMutedState, setAudioMutedState] = useState<boolean>(() => isAudioMuted());

  const activePreset = useMemo(
    () => LEGACY_PRESETS.find((p) => p.id === activePresetId),
    [activePresetId]
  );

  const report = useMemo(() => analyzeCodeAutopsy(code), [code]);

  const loadSpecimen = useCallback((presetId: string, name: string, source: string) => {
    setActivePresetId(presetId);
    setFileName(name);
    setCode(source);
    setOriginalCode(source);
    setViewMode('editor');
    setHighlightedLine(null);
    setAppliedFixes([]);
    setDiffLines([]);
    setUnifiedPatch('');
    setBeforeVitality(null);
    setResurrectionMode(null);
    setIsResurrected(false);
    setAiError(null);
    playScanPulse();
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const found = LEGACY_PRESETS.find((p) => p.id === presetId);
      if (!found) return;
      loadSpecimen(found.id, `${found.id}.ts`, found.code);
    },
    [loadSpecimen]
  );

  const handleUploadFile = useCallback(
    (name: string, content: string) => {
      loadSpecimen('custom-upload', name, content);
    },
    [loadSpecimen]
  );

  const handleImportGitHubUrl = useCallback(
    async (rawInput: string) => {
      const rawUrl = toRawGitHubUrl(rawInput);
      const res = await fetch(rawUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${rawUrl}`);
      }
      const text = await res.text();
      const extractedName = rawUrl.split('/').pop() || 'imported-specimen.ts';
      loadSpecimen('custom-upload', extractedName, text);
    },
    [loadSpecimen]
  );

  const handleResetCode = useCallback(() => {
    setCode(originalCode);
    setViewMode('editor');
    setHighlightedLine(null);
    setAppliedFixes([]);
    setDiffLines([]);
    setUnifiedPatch('');
    setBeforeVitality(null);
    setResurrectionMode(null);
    setIsResurrected(false);
    setAiError(null);
    playScanPulse();
  }, [originalCode]);

  const handleCastResurrection = useCallback(async () => {
    setAiError(null);
    const startingVitality = report.vitalityScore;

    if (aiConfig) {
      setIsResurrecting(true);
      try {
        const result = await resurrectWithAi(code, report.curses, aiConfig);
        setBeforeVitality(startingVitality);
        setResurrectionMode('ai-assisted');
        setCode(result.resurrectedCode);
        setAppliedFixes(result.appliedFixes);
        setDiffLines(result.diffLines);
        setUnifiedPatch(result.unifiedPatch);
        setViewMode('split');
        setIsResurrected(true);
        playResurrectChord();
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10b981', '#8b5cf6', '#38bdf8'],
        });
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'AI Resurrection failed');
      } finally {
        setIsResurrecting(false);
      }
      return;
    }

    const result = resurrectCode(code);
    setBeforeVitality(startingVitality);
    setResurrectionMode('local-ast');
    setCode(result.resurrectedCode);
    setAppliedFixes(result.appliedFixes);
    setDiffLines(result.diffLines);
    setUnifiedPatch(result.unifiedPatch);
    setViewMode('split');
    setIsResurrected(true);
    playResurrectChord();
    confetti({
      particleCount: 55,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#10b981', '#8b5cf6', '#38bdf8'],
    });
  }, [aiConfig, code, report.curses, report.vitalityScore]);

  const handleExorciseSingle = useCallback(
    (ruleId: string) => {
      if (beforeVitality === null) {
        setBeforeVitality(report.vitalityScore);
      }
      const result = resurrectCode(code, ruleId);
      setResurrectionMode('local-ast');
      setCode(result.resurrectedCode);
      setAppliedFixes((prev) => Array.from(new Set([...prev, ...result.appliedFixes])));
      setDiffLines(result.diffLines);
      setUnifiedPatch(result.unifiedPatch);
      playScanPulse();
    },
    [beforeVitality, code, report.vitalityScore]
  );

  const handleToggleAudio = useCallback(() => {
    const next = !audioMutedState;
    setAudioMuted(next);
    setAudioMutedState(next);
  }, [audioMutedState]);

  const handleCodeEdit = useCallback((newCode: string) => {
    setCode(newCode);
    setIsResurrected(false);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07090e] text-slate-100 overflow-hidden">
      <TopBar
        presets={LEGACY_PRESETS}
        activePresetId={activePresetId}
        fileName={fileName}
        onSelectPreset={handleSelectPreset}
        onUploadFile={handleUploadFile}
        onImportGitHubUrl={handleImportGitHubUrl}
        onDownloadCode={() => {
          const outName = fileName.replace(/\.(jsx?|cjs|mjs)$/, '.ts');
          triggerDownload(outName, code);
        }}
        onDownloadPatch={() => triggerDownload(`${fileName}.patch`, unifiedPatch)}
        hasPatch={unifiedPatch.length > 0}
        vitalityScore={report.vitalityScore}
        curseCount={report.curses.length}
        isResurrected={isResurrected}
        isResurrecting={isResurrecting}
        onCastResurrection={handleCastResurrection}
        onResetCode={handleResetCode}
        audioMuted={audioMutedState}
        onToggleAudio={handleToggleAudio}
        aiConfig={aiConfig}
        onSaveAiConfig={setAiConfig}
      />

      {aiError && (
        <div className="bg-rose-950/70 border-b border-rose-500/40 px-4 py-1.5 text-xs text-rose-200 flex items-center justify-between">
          <span>AI Mode Error: {aiError}</span>
          <button onClick={() => setAiError(null)} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2D Studio Grid */}
      <main className="flex-1 min-h-0 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left/Center: Code Editor + 2D SVG Call & Taint Topology */}
        <div className="lg:col-span-8 flex flex-col gap-3 min-h-0">
          <div className="flex-[3] min-h-0">
            <CodeAutopsyEditor
              fileName={fileName}
              code={code}
              originalCode={originalCode}
              onChangeCode={handleCodeEdit}
              onDropFile={handleUploadFile}
              curses={report.curses}
              diagnostics={report.diagnostics}
              highlightedLine={highlightedLine}
              onHighlightLine={setHighlightedLine}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              diffLines={diffLines}
              eraLabel={activePreset?.era || 'Custom Specimen'}
            />
          </div>

          <div className="flex-[2] min-h-[200px]">
            <AutopsyGraph2D
              nodes={report.nodes}
              edges={report.edges}
              onSelectLine={(line) => {
                setViewMode('editor');
                setHighlightedLine(line);
                playScanPulse();
              }}
              highlightedLine={highlightedLine}
            />
          </div>
        </div>

        {/* Right: Curse & Kiro Policy Inspector */}
        <div className="lg:col-span-4 min-h-0">
          <CurseInspectorPanel
            report={report}
            beforeVitality={beforeVitality}
            appliedFixes={appliedFixes}
            resurrectionMode={resurrectionMode}
            onSelectCurse={(line) => {
              setViewMode('editor');
              setHighlightedLine(line);
              playScanPulse();
            }}
            onExorciseSingle={handleExorciseSingle}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
