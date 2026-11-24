import React from 'react';
import { 
  X, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  ShieldAlert, 
  Compass, 
  Layers, 
  FileText, 
  Tag, 
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MapNode, PrerequisiteDetail } from '../types/atlas';
import { playLockedDenialTone } from '../services/spatialAudioEngine';

export interface QuestInspectorDrawerProps {
  node: MapNode | null;
  prerequisites: PrerequisiteDetail[];
  isOpen: boolean;
  onClose: () => void;
  onCompleteQuest: (nodeId: string) => void;
  onFocusNode?: (nodeId: string) => void;
}

export const QuestInspectorDrawer: React.FC<QuestInspectorDrawerProps> = ({
  node,
  prerequisites,
  isOpen,
  onClose,
  onCompleteQuest,
  onFocusNode,
}) => {
  if (!isOpen || !node) return null;

  const isCompleted = node.status === 'COMPLETED';
  const isUnlocked = node.status === 'UNLOCKED';
  const isLocked = node.status === 'LOCKED';

  // Check if any prerequisite is incomplete
  const missingPrerequisites = prerequisites.filter((p) => !p.isCompleted);
  const canComplete = isUnlocked && missingPrerequisites.length === 0;

  const handleCompleteClick = () => {
    if (isCompleted) return;

    if (isLocked || missingPrerequisites.length > 0) {
      playLockedDenialTone();
      return;
    }

    // Trigger fireworks / confetti blast
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { x: 0.85, y: 0.7 },
        colors: ['#06b6d4', '#eab308', '#10b981', '#a855f7'],
        disableForReducedMotion: true,
      });
    } catch {
      // Ignore if in environments without canvas context
    }

    onCompleteQuest(node.id);
  };

  const getRegionBadgeColor = (region: string) => {
    if (region.includes('Frontend')) return 'from-cyan-500/20 to-blue-500/20 text-cyan-300 border-cyan-500/40';
    if (region.includes('Backend')) return 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/40';
    if (region.includes('AI') || region.includes('Neural')) return 'from-purple-500/20 to-indigo-500/20 text-purple-300 border-purple-500/40';
    if (region.includes('Cyber') || region.includes('Security')) return 'from-rose-500/20 to-red-500/20 text-rose-300 border-rose-500/40';
    return 'from-slate-500/20 to-slate-600/20 text-slate-300 border-slate-500/40';
  };

  return (
    <aside 
      className="fixed top-16 right-3 bottom-4 z-40 w-full sm:w-96 max-w-[calc(100vw-24px)] flex flex-col glass-panel rounded-2xl border border-cyan-500/30 shadow-2xl shadow-black/80 overflow-hidden transition-all duration-300 ease-out"
      aria-label="Quest Inspector Drawer"
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Status and Region Badges */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            {/* Status Badge */}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                COMPLETED
              </span>
            )}
            {isUnlocked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 animate-pulse">
                <Unlock className="w-3.5 h-3.5 text-cyan-400" />
                AVAILABLE
              </span>
            )}
            {isLocked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                LOCKED
              </span>
            )}

            {/* Region Pill */}
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border bg-gradient-to-r ${getRegionBadgeColor(node.region)}`}>
              <Compass className="w-3 h-3" />
              {node.region}
            </span>
          </div>

          {/* Quest Title */}
          <h2 className="text-lg font-bold text-slate-100 font-mono tracking-tight leading-tight line-clamp-2">
            {node.title}
          </h2>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
          title="Close Inspector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* XP Reward Card */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-yellow-500/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Quest Reward</div>
              <div className="text-sm font-mono font-bold text-yellow-300">+{node.xpReward} XP</div>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">
            3D Landmark: <span className="text-cyan-400 font-semibold">{isCompleted ? 'Gold Monument' : isUnlocked ? 'Cyan Beacon' : 'Obsidian Monolith'}</span>
          </span>
        </div>

        {/* Prerequisites Checklist */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1 font-semibold text-slate-300">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              PREREQUISITES ({prerequisites.filter((p) => p.isCompleted).length}/{prerequisites.length})
            </span>
            {prerequisites.length === 0 && (
              <span className="text-[11px] text-emerald-400">Root Landmark</span>
            )}
          </div>

          {prerequisites.length > 0 ? (
            <div className="space-y-1.5">
              {prerequisites.map((prereq) => (
                <div
                  key={prereq.id}
                  onClick={() => onFocusNode && onFocusNode(prereq.id)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs font-mono cursor-pointer transition-all ${
                    prereq.isCompleted
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200 hover:border-emerald-500/50'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-200 hover:border-rose-500/50'
                  }`}
                  title={prereq.isCompleted ? 'Prerequisite completed (Click to view)' : 'Prerequisite locked (Click to view)'}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {prereq.isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="truncate">{prereq.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-0.5 ml-2 hover:text-cyan-300">
                    Jump <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
              No prerequisite landmarks required. This is a foundational territory quest.
            </div>
          )}
        </div>

        {/* Rich Notes Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs font-mono font-semibold text-slate-300">
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            FIELD RESEARCH & NOTES
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 font-mono leading-relaxed space-y-2">
            {node.notes ? (
              node.notes.split('\n\n').map((paragraph, index) => {
                // If paragraph is a bullet list
                if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
                  return (
                    <ul key={index} className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                      {paragraph.split('\n').map((item, itemIdx) => (
                        <li key={itemIdx} className="text-slate-300">
                          {item.replace(/^[-*]\s+/, '')}
                        </li>
                      ))}
                    </ul>
                  );
                }
                // If paragraph is code or block
                if (paragraph.startsWith('```')) {
                  const cleaned = paragraph.replace(/```[a-z]*/g, '').trim();
                  return (
                    <pre key={index} className="p-2 rounded bg-slate-900 border border-cyan-500/20 text-cyan-300 overflow-x-auto text-[11px]">
                      <code>{cleaned}</code>
                    </pre>
                  );
                }
                return <p key={index}>{paragraph}</p>;
              })
            ) : (
              <p className="text-slate-500 italic">No field research notes recorded for this landmark.</p>
            )}
          </div>
        </div>

        {/* Tags (if any) */}
        {node.tags && node.tags.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 pt-1">
            {node.tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800/80 text-slate-400 border border-slate-700/60"
              >
                <Tag className="w-2.5 h-2.5 text-slate-500" />
                {tag}
              </span>
            ))}
          </div>
        )}

      </div>

      {/* Drawer Footer Action */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/90">
        {isCompleted ? (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-mono font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
            <Award className="w-4 h-4 text-emerald-400" />
            TERRITORY CONQUERED (+{node.xpReward} XP AWARDED)
          </div>
        ) : isUnlocked ? (
          <button
            onClick={handleCompleteClick}
            disabled={!canComplete}
            className={`w-full py-3 px-4 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-98 ${
              canComplete
                ? 'bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 shadow-cyan-500/30 cursor-pointer animate-cyber-pulse'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            COMPLETE QUEST & UNLOCK TERRITORY
          </button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleCompleteClick}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/40 transition-colors cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              LOCKED BY PREREQUISITES
            </button>
            <p className="text-[10px] font-mono text-center text-slate-400">
              Complete {missingPrerequisites.length} prerequisite {missingPrerequisites.length === 1 ? 'task' : 'tasks'} to lift fog-of-war.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default QuestInspectorDrawer;
