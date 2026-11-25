import React from 'react';
import {
  Zap,
  RotateCcw,
  Volume2,
  VolumeX,
  Skull,
  HeartPulse,
  Sparkles,
} from 'lucide-react';
import { LegacyPreset } from '../types/necromancer';

interface TopBarProps {
  presets: LegacyPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  vitalityScore: number;
  curseCount: number;
  isResurrected: boolean;
  onCastResurrection: () => void;
  onResetCode: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  presets,
  activePresetId,
  onSelectPreset,
  vitalityScore,
  curseCount,
  isResurrected,
  onCastResurrection,
  onResetCode,
  audioMuted,
  onToggleAudio,
}) => {
  const vitalityColor =
    vitalityScore >= 85
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : vitalityScore >= 50
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0b0f17] px-4 flex items-center justify-between gap-4">
      {/* Brand */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-violet-950/50 shrink-0">
          <Skull className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-white truncate">
              DeadCode Necromancer
            </h1>
            <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
              KIROWEEN 2026
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate hidden sm:block">
            Legacy Codebase Autopsy &amp; Surgical Resurrection Studio
          </p>
        </div>
      </div>

      {/* Preset Selector */}
      <div className="flex items-center gap-2">
        <label htmlFor="preset-select" className="text-xs text-slate-400 hidden lg:inline font-mono">
          SPECIMEN:
        </label>
        <select
          id="preset-select"
          value={activePresetId}
          onChange={(e) => onSelectPreset(e.target.value)}
          className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer max-w-[220px]"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Vitality & Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold ${vitalityColor}`}
        >
          <HeartPulse className="w-3.5 h-3.5" />
          <span>{vitalityScore}%</span>
          <span className="text-[10px] opacity-75 hidden md:inline">
            ({curseCount} {curseCount === 1 ? 'curse' : 'curses'})
          </span>
        </div>

        <button
          onClick={onResetCode}
          title="Restore Original Haunted Specimen"
          className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleAudio}
          title={audioMuted ? 'Unmute Audio Cues' : 'Mute Audio Cues'}
          className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition-colors cursor-pointer"
        >
          {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onCastResurrection}
          disabled={curseCount === 0}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            curseCount === 0
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
              : 'bg-gradient-to-r from-violet-600 to-emerald-500 hover:from-violet-500 hover:to-emerald-400 text-white shadow-lg shadow-violet-950/60'
          }`}
        >
          {curseCount === 0 && isResurrected ? (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Resurrected</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              <span>Cast Resurrection</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
