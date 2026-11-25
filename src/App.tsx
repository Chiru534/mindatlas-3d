import React, { useState, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { LEGACY_PRESETS } from './data/legacyPresets';
import { analyzeCodeAutopsy } from './services/curseAnalyzer';
import { resurrectCode } from './services/resurrectionEngine';
import { DiffLine } from './types/necromancer';
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

export const App: React.FC = () => {
  const [activePresetId, setActivePresetId] = useState<string>(LEGACY_PRESETS[0].id);
  const [code, setCode] = useState<string>(LEGACY_PRESETS[0].code);
  const [originalCode, setOriginalCode] = useState<string>(LEGACY_PRESETS[0].code);
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('editor');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [isResurrected, setIsResurrected] = useState<boolean>(false);
  const [audioMutedState, setAudioMutedState] = useState<boolean>(() => isAudioMuted());

  const activePreset = useMemo(
    () => LEGACY_PRESETS.find((p) => p.id === activePresetId) || LEGACY_PRESETS[0],
    [activePresetId]
  );

  const report = useMemo(() => analyzeCodeAutopsy(code), [code]);

  const handleSelectPreset = useCallback((presetId: string) => {
    const found = LEGACY_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(found.id);
    setCode(found.code);
    setOriginalCode(found.code);
    setViewMode('editor');
    setHighlightedLine(null);
    setAppliedFixes([]);
    setDiffLines([]);
    setIsResurrected(false);
    playScanPulse();
  }, []);

  const handleResetCode = useCallback(() => {
    setCode(originalCode);
    setViewMode('editor');
    setHighlightedLine(null);
    setAppliedFixes([]);
    setDiffLines([]);
    setIsResurrected(false);
    playScanPulse();
  }, [originalCode]);

  const handleCastResurrection = useCallback(() => {
    const result = resurrectCode(code);
    setCode(result.resurrectedCode);
    setAppliedFixes(result.appliedFixes);
    setDiffLines(result.diffLines);
    setViewMode('diff');
    setIsResurrected(true);
    playResurrectChord();
    confetti({
      particleCount: 55,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#10b981', '#8b5cf6', '#38bdf8'],
    });
  }, [code]);

  const handleExorciseSingle = useCallback(
    (ruleId: string) => {
      const result = resurrectCode(code, ruleId);
      setCode(result.resurrectedCode);
      setAppliedFixes((prev) => Array.from(new Set([...prev, ...result.appliedFixes])));
      setDiffLines(result.diffLines);
      playScanPulse();
    },
    [code]
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
        onSelectPreset={handleSelectPreset}
        vitalityScore={report.vitalityScore}
        curseCount={report.curses.length}
        isResurrected={isResurrected}
        onCastResurrection={handleCastResurrection}
        onResetCode={handleResetCode}
        audioMuted={audioMutedState}
        onToggleAudio={handleToggleAudio}
      />

      {/* Main 2D Studio Grid */}
      <main className="flex-1 min-h-0 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left/Center: Code Editor + 2D SVG Call & Taint Topology */}
        <div className="lg:col-span-8 flex flex-col gap-3 min-h-0">
          <div className="flex-[3] min-h-0">
            <CodeAutopsyEditor
              code={code}
              onChangeCode={handleCodeEdit}
              curses={report.curses}
              highlightedLine={highlightedLine}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              diffLines={diffLines}
              eraLabel={activePreset.era}
            />
          </div>

          <div className="flex-[2] min-h-[210px]">
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
            appliedFixes={appliedFixes}
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
