import React, { useState, useMemo } from 'react';
import { 
  Compass, 
  Plus, 
  FileCode2, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  CheckCircle2, 
  Layers,
  Search,
  X
} from 'lucide-react';
import { MapNode, WorldStats } from '../types/atlas';

export interface TopHudBarProps {
  playerLevel: number;
  totalXp: number;
  stats?: WorldStats;
  audioMuted: boolean;
  nodes?: MapNode[];
  onSelectNode?: (nodeId: string) => void;
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
  nodes = [],
  onSelectNode,
  onToggleAudio,
  onOpenAddQuest,
  onOpenImportModal,
  onResetDemoWorld,
  onResetCamera,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // XP progression math: 250 XP per level
  const xpPerLevel = 250;
  const currentLevelProgress = totalXp % xpPerLevel;
  const xpProgressPercent = Math.min(100, Math.round((currentLevelProgress / xpPerLevel) * 100));
  const xpNeeded = xpPerLevel - currentLevelProgress;

  const totalQuests = stats?.totalNodes ?? 0;
  const completedQuests = stats?.completedNodes ?? 0;
  const unlockedQuests = stats?.unlockedNodes ?? 0;
  const completionRatio = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;

  // Search filter results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes
      .filter((n) => n.title.toLowerCase().includes(q) || n.region.toLowerCase().includes(q) || (n.tags && n.tags.some((t) => t.toLowerCase().includes(q))))
      .slice(0, 6);
  }, [searchQuery, nodes]);

  const handleSelectSearchResult = (nodeId: string) => {
    onSelectNode?.(nodeId);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-3 py-2.5 sm:px-6 pointer-events-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 pointer-events-auto">
        
        {/* Brand & Theme Pill */}
        <div className="flex items-center justify-between w-full md:w-auto gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 glass-panel px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-cyan-500/30 shadow-lg shadow-cyan-950/40 shrink-0 whitespace-nowrap">
            <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 text-cyan-400">
              <Compass className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" style={{ animationDuration: '24s' }} />
              <div className="absolute inset-0 rounded-lg blur-sm bg-cyan-400/20" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-200 font-mono">
                  MINDATLAS 3D
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/40 text-purple-300 shadow-sm shadow-purple-900/50">
                  Frankenstein 2026
                </span>
              </div>
              <p className="hidden sm:flex text-[11px] text-slate-400 font-mono items-center gap-1.5 whitespace-nowrap">
                <span>Spatial Cartography</span>
                <span className="text-slate-600">•</span>
                <span>DAG Engine</span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400">Web Audio</span>
              </p>
            </div>
          </div>

          {/* Mobile search toggle button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            title="Search Landmarks"
            aria-label="Toggle Search"
            className="md:hidden p-2 rounded-xl glass-panel border border-slate-800 text-slate-400 hover:text-cyan-300"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Real-time Quest Search & Fly-To Filter */}
        <div className={`relative w-full md:w-60 lg:w-72 ${isSearchOpen ? 'block' : 'hidden md:block'}`}>
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search 3D landmarks..."
              className="w-full pl-8 pr-7 py-1.5 rounded-xl glass-panel text-xs font-mono text-slate-200 placeholder:text-slate-500 border border-slate-800 focus:border-cyan-500/50 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl glass-panel border border-cyan-500/30 shadow-2xl bg-slate-950/95 overflow-hidden z-50 font-mono text-xs max-h-56 overflow-y-auto">
              {searchResults.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => handleSelectSearchResult(node.id)}
                  className="w-full text-left px-3 py-2 border-b border-slate-800/60 last:border-0 hover:bg-cyan-950/40 flex items-center justify-between text-slate-200"
                >
                  <div className="truncate mr-2">
                    <div className="font-semibold truncate">{node.title}</div>
                    <div className="text-[10px] text-slate-400">{node.region}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                    node.status === 'COMPLETED' ? 'bg-yellow-500/20 text-yellow-300' :
                    node.status === 'UNLOCKED' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {node.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Player Telemetry, Level & XP HUD */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 glass-panel px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-800 shadow-lg shrink-0">
          
          {/* Level Hexagon Badge */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-yellow-500/20 to-amber-600/30 border border-yellow-500/50 text-yellow-400 font-extrabold font-mono text-xs sm:text-sm shadow-inner shadow-yellow-500/20">
              {playerLevel}
            </div>
            <div>
              <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                LEVEL {playerLevel}
              </div>
              <div className="text-xs font-bold text-slate-200 font-mono">
                {totalXp} <span className="text-[10px] font-normal text-slate-400">XP</span>
              </div>
            </div>
          </div>

          <div className="w-px h-6 bg-slate-800" />

          {/* XP Progress Bar */}
          <div className="w-24 sm:w-36 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-400">NEXT LVL {playerLevel + 1}</span>
              <span className="text-cyan-400 font-semibold">{xpProgressPercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden p-0.5 border border-slate-700/50">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 shadow-sm shadow-cyan-400 transition-all duration-500"
                style={{ width: `${xpProgressPercent}%` }}
              />
            </div>
            <div className="hidden sm:block text-[9px] text-slate-400 font-mono text-right">
              {xpNeeded} XP to next level
            </div>
          </div>

          <div className="w-px h-6 bg-slate-800 hidden sm:block" />

          {/* Territory Unlock Statistics */}
          <div className="hidden sm:flex items-center gap-2.5 font-mono text-[11px]">
            <div className="text-center px-1">
              <div className="text-yellow-400 font-bold flex items-center gap-1 justify-center">
                <CheckCircle2 className="w-3 h-3" /> {completedQuests}
              </div>
              <div className="text-[9px] text-slate-400">MASTERED</div>
            </div>

            <div className="text-center px-1">
              <div className="text-cyan-400 font-bold flex items-center gap-1 justify-center">
                <Sparkles className="w-3 h-3" /> {unlockedQuests}
              </div>
              <div className="text-[9px] text-slate-400">UNLOCKED</div>
            </div>

            <div className="text-center px-1">
              <div className="text-slate-300 font-bold flex items-center gap-1 justify-center">
                <Layers className="w-3 h-3 text-slate-400" /> {completionRatio}%
              </div>
              <div className="text-[9px] text-slate-400 uppercase">PROGRESS</div>
            </div>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-1.5 glass-panel p-1.5 rounded-xl border border-slate-800 shadow-lg shrink-0">
          
          {/* Quick Add Quest Button */}
          <button
            onClick={onOpenAddQuest}
            title="Create 3D Landmark & Highway"
            aria-label="Add Quest Node"
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-slate-200 bg-slate-800/60 hover:bg-cyan-950/60 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/50 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">Add Quest</span>
          </button>

          {/* Import Syllabus / Spec Button */}
          <button
            onClick={onOpenImportModal}
            title="Import Markdown Syllabus or Spec"
            aria-label="Import Markdown Spec"
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-slate-200 bg-slate-800/60 hover:bg-purple-950/60 hover:text-purple-300 border border-slate-700 hover:border-purple-500/50 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden lg:inline">Import Spec</span>
          </button>

          <div className="w-px h-5 bg-slate-800 mx-0.5" />

          {/* Camera Reset Overview Button */}
          <button
            onClick={onResetCamera}
            title="Reset Camera to Overview"
            aria-label="Reset Camera"
            className="p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors"
          >
            <Compass className="w-4 h-4" />
          </button>

          {/* Audio Synthesizer Mute Toggle */}
          <button
            onClick={onToggleAudio}
            title={audioMuted ? 'Unmute Web Audio Telemetry' : 'Mute Web Audio Telemetry'}
            aria-label={audioMuted ? 'Unmute Audio' : 'Mute Audio'}
            className={`p-2 rounded-lg transition-colors ${
              audioMuted 
                ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60' 
                : 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 shadow-sm shadow-cyan-950'
            }`}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Reset Demo World (Critical for Hackathon Judges) */}
          <button
            onClick={onResetDemoWorld}
            title="Reset Demo World to Pristine State (Judge Demo Mode)"
            aria-label="Reset Demo World"
            className="p-2 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-slate-800/60 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

        </div>

      </div>
    </header>
  );
};

export default TopHudBar;
