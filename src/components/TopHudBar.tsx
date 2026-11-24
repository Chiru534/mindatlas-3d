import React from 'react';
import { 
  Compass, 
  Plus, 
  FileCode2, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Camera, 
  Sparkles, 
  CheckCircle2, 
  Layers
} from 'lucide-react';
import { WorldStats } from '../types/atlas';

export interface TopHudBarProps {
  playerLevel: number;
  totalXp: number;
  stats?: WorldStats;
  audioMuted: boolean;
  onToggleAudio: () => void;
  onOpenAddQuest: () => void;
  onOpenImportModal: () => void;
  onResetDemoWorld: () => void;
  onResetCamera: () => void;
}

export const TopHudBar: React.FC<TopHudBarProps> = ({
  playerLevel,
  totalXp,
  stats,
  audioMuted,
  onToggleAudio,
  onOpenAddQuest,
  onOpenImportModal,
  onResetDemoWorld,
  onResetCamera,
}) => {
  // XP progression math: 250 XP per level
  const xpPerLevel = 250;
  const currentLevelProgress = totalXp % xpPerLevel;
  const xpProgressPercent = Math.min(100, Math.round((currentLevelProgress / xpPerLevel) * 100));
  const xpNeeded = xpPerLevel - currentLevelProgress;

  const totalQuests = stats?.totalNodes ?? 0;
  const completedQuests = stats?.completedNodes ?? 0;
  const unlockedQuests = stats?.unlockedNodes ?? 0;
  const completionRatio = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-3 py-2.5 sm:px-6 pointer-events-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 pointer-events-auto">
        
        {/* Brand & Theme Pill */}
        <div className="flex items-center gap-3 glass-panel px-3.5 py-2 rounded-xl border border-cyan-500/30 shadow-lg shadow-cyan-950/40">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 text-cyan-400">
            <Compass className="w-5 h-5 animate-spin" style={{ animationDuration: '24s' }} />
            <div className="absolute inset-0 rounded-lg blur-sm bg-cyan-400/20" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-200 font-mono">
                MINDATLAS 3D
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/40 text-purple-300 shadow-sm shadow-purple-900/50">
                Frankenstein 2026
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <span>Spatial Cartography</span>
              <span className="text-cyan-500">•</span>
              <span>DAG Knowledge Islands</span>
            </p>
          </div>
        </div>

        {/* Player Level & XP Telemetry Bar */}
        <div className="flex-1 max-w-md w-full glass-panel px-4 py-2 rounded-xl border border-slate-700/60 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-sm shadow-cyan-500/40">
                LVL {playerLevel}
              </span>
              <span className="font-mono text-slate-300 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                {totalXp} <span className="text-[10px] text-slate-500 font-normal">TOTAL XP</span>
              </span>
            </div>
            <span className="font-mono text-[11px] text-cyan-400/90 font-medium">
              {currentLevelProgress} / {xpPerLevel} XP <span className="text-slate-500">(-{xpNeeded})</span>
            </span>
          </div>

          {/* XP Progress Bar */}
          <div className="relative w-full h-2 rounded-full bg-slate-900/90 border border-slate-700/50 overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-400 transition-all duration-700 ease-out shadow-sm shadow-cyan-400/50"
              style={{ width: `${xpProgressPercent}%` }}
            />
            {/* Holographic shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse pointer-events-none" />
          </div>

          {/* Territory Quests Ratio */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Completed: <span className="text-emerald-300 font-semibold">{completedQuests}/{totalQuests}</span> ({completionRatio}%)
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-cyan-400" />
              Available: <span className="text-cyan-300 font-semibold">{unlockedQuests}</span>
            </span>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center flex-wrap justify-end gap-1.5 glass-panel px-2.5 py-1.5 rounded-xl border border-slate-700/60 shadow-lg shadow-black/40">
          
          {/* Add Quest */}
          <button
            onClick={onOpenAddQuest}
            title="Create a new 3D knowledge landmark"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 transition-all active:scale-95 shadow-sm hover:shadow-cyan-500/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Quest</span>
          </button>

          {/* Import Spec / Markdown */}
          <button
            onClick={onOpenImportModal}
            title="Import Kiro spec or syllabus markdown into 3D graph"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 hover:border-purple-400 transition-all active:scale-95 shadow-sm hover:shadow-purple-500/20"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import Spec</span>
          </button>

          {/* Reset Demo World (For Hackathon Judges) */}
          <button
            onClick={onResetDemoWorld}
            title="Reset world to default 4-region demo DAG (For Hackathon Judges)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 hover:border-amber-400 transition-all active:scale-95 shadow-sm hover:shadow-amber-500/20"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reset Demo</span>
          </button>

          {/* Camera Reset */}
          <button
            onClick={onResetCamera}
            title="Recenter 3D Camera view"
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-300 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 transition-all active:scale-95"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Audio Synthesizer Mute Toggle */}
          <button
            onClick={onToggleAudio}
            title={audioMuted ? 'Unmute Web Audio Synthesizer' : 'Mute Web Audio Synthesizer'}
            className={`p-1.5 rounded-lg border transition-all active:scale-95 ${
              audioMuted 
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25' 
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/20'
            }`}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

        </div>

      </div>
    </header>
  );
};

export default TopHudBar;
