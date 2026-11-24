import React, { useState, useEffect } from 'react';
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
  Award,
  Edit3,
  Save,
  CheckSquare,
  Square
} from 'lucide-react';
import { MapNode, PrerequisiteDetail } from '../types/atlas';
import { playLockedDenialTone } from '../services/spatialAudioEngine';

export interface QuestInspectorDrawerProps {
  node: MapNode | null;
  prerequisites: PrerequisiteDetail[];
  isOpen: boolean;
  onClose: () => void;
  onCompleteQuest: (nodeId: string) => void;
  onFocusNode?: (nodeId: string) => void;
  onUpdateNotes?: (nodeId: string, updatedNotes: string) => void;
  onToggleSubTask?: (nodeId: string, subTaskId: string) => void;
}

interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export const QuestInspectorDrawer: React.FC<QuestInspectorDrawerProps> = ({
  node,
  prerequisites,
  isOpen,
  onClose,
  onCompleteQuest,
  onFocusNode,
  onUpdateNotes,
  onToggleSubTask,
}) => {
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);
  const [editedNotes, setEditedNotes] = useState<string>('');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);

  // Synchronize state when selected node changes
  useEffect(() => {
    if (node) {
      setEditedNotes(node.notes || '');
      setIsEditingNotes(false);

      if (node.subTasks && node.subTasks.length > 0) {
        setSubTasks(node.subTasks);
      } else {
        // Generate or parse sub-tasks for this quest (Requirement 2.2)
        // Check if notes contain markdown bullet items
        const lines = (node.notes || '').split('\n').filter((l) => l.trim().startsWith('- '));
        if (lines.length > 0) {
          setSubTasks(
            lines.map((line, idx) => ({
              id: `sub-${idx}`,
              title: line.replace(/^-\s*(\[[ xX]\])?\s*/, '').trim(),
              completed: line.includes('[x]') || line.includes('[X]') || node.status === 'COMPLETED',
            }))
          );
        } else {
          // Default milestone sub-tasks based on node title
          setSubTasks([
            { id: 'sub-1', title: `Review foundational concepts for ${node.title}`, completed: node.status === 'COMPLETED' },
            { id: 'sub-2', title: `Complete hands-on exercise / lab session`, completed: node.status === 'COMPLETED' },
            { id: 'sub-3', title: `Verify implementation & clear dependencies`, completed: node.status === 'COMPLETED' },
          ]);
        }
      }
    }
  }, [node]);

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

    // Call complete quest (confetti is fired centrally by App.tsx to prevent duplicates)
    onCompleteQuest(node.id);
  };

  const handleToggleSubTask = (subTaskId: string) => {
    setSubTasks((prev) =>
      prev.map((st) => (st.id === subTaskId ? { ...st, completed: !st.completed } : st))
    );
    if (node) {
      onToggleSubTask?.(node.id, subTaskId);
    }
  };

  const handleSaveNotes = () => {
    onUpdateNotes?.(node.id, editedNotes);
    setIsEditingNotes(false);
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
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {/* Status Badge */}
            <span className={`px-2.5 py-0.5 text-[11px] font-bold font-mono uppercase tracking-wider rounded-full border flex items-center gap-1.5 ${
              isCompleted 
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' 
                : isUnlocked 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {isCompleted && <CheckCircle2 className="w-3 h-3 text-yellow-400" />}
              {isUnlocked && <Unlock className="w-3 h-3 text-cyan-400" />}
              {isLocked && <Lock className="w-3 h-3 text-slate-400" />}
              {node.status}
            </span>

            {/* Region Badge */}
            <span className={`px-2.5 py-0.5 text-[11px] font-mono rounded-full border bg-gradient-to-r ${getRegionBadgeColor(node.region)}`}>
              {node.region}
            </span>
          </div>

          <h2 className="text-base sm:text-lg font-bold font-mono text-slate-100 truncate" title={node.title}>
            {node.title}
          </h2>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Close Inspector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        
        {/* XP Reward & Coordinates Banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />
            <span className="text-slate-400">Reward:</span>
            <span className="text-yellow-400 font-bold">+{node.xpReward} XP</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>({Math.round(node.position.x)}, {Math.round(node.position.z)})</span>
          </div>
        </div>

        {/* Prerequisites Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1 font-semibold text-slate-300">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              PREREQUISITES ({prerequisites.length})
            </span>
            {missingPrerequisites.length > 0 && (
              <span className="text-rose-400 text-[10px] flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                {missingPrerequisites.length} Required
              </span>
            )}
          </div>

          {prerequisites.length === 0 ? (
            <div className="p-2.5 rounded-lg bg-slate-900/30 border border-slate-800 text-slate-400 text-[11px]">
              No prerequisite tasks required. This is an entry-level landmark on the island.
            </div>
          ) : (
            <div className="space-y-1.5">
              {prerequisites.map((prereq) => (
                <div
                  key={prereq.id}
                  onClick={() => onFocusNode?.(prereq.id)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                    prereq.isCompleted
                      ? 'bg-yellow-950/20 border-yellow-500/30 text-yellow-200 hover:bg-yellow-900/30'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                  }`}
                  title="Click to locate on map"
                >
                  <div className="flex items-center gap-2 truncate">
                    {prereq.isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate">{prereq.title}</span>
                  </div>

                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interactive Milestone Sub-tasks (Requirement 2.2) */}
        <div className="space-y-2">
          <span className="flex items-center gap-1 font-semibold text-slate-300">
            <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
            MILESTONE SUB-TASKS ({subTasks.filter((s) => s.completed).length}/{subTasks.length})
          </span>

          <div className="space-y-1.5">
            {subTasks.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => handleToggleSubTask(st.id)}
                className={`w-full text-left flex items-start gap-2 p-2 rounded-lg border text-[11px] transition-colors ${
                  st.completed
                    ? 'bg-cyan-950/25 border-cyan-500/30 text-cyan-200'
                    : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:bg-slate-900/60'
                }`}
              >
                {st.completed ? (
                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                )}
                <span className={st.completed ? 'line-through text-slate-400' : 'text-slate-200'}>
                  {st.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Study Notes & Documentation (with in-place editing) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1 font-semibold">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              STUDY NOTES & SPEC
            </span>
            {!isEditingNotes ? (
              <button
                type="button"
                onClick={() => setIsEditingNotes(true)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" /> Edit Notes
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveNotes}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            )}
          </div>

          {isEditingNotes ? (
            <textarea
              value={editedNotes}
              onChange={(e) => setEditedNotes(e.target.value)}
              rows={5}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-cyan-500/50 text-slate-200 text-xs font-mono focus:outline-none resize-y"
              placeholder="Add your study notes or markdown explanation..."
            />
          ) : (
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
              {node.notes || 'No study notes recorded yet. Click Edit Notes to document key learning points.'}
            </div>
          )}
        </div>

        {/* Tags */}
        {node.tags && node.tags.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-400" /> Tags
            </span>
            <div className="flex flex-wrap gap-1.5">
              {node.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 border border-slate-700/80"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Drawer Action Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/70">
        {isCompleted ? (
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 font-mono text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-yellow-400" />
            <span>Landmark Mastered (+{node.xpReward} XP Earned)</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCompleteClick}
            disabled={!canComplete}
            className={`w-full py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              canComplete
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-950/60 active:scale-98 animate-pulse'
                : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-80'
            }`}
          >
            {isLocked ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Prerequisites Required</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>Complete Quest & Unlock Territory</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
};

export default QuestInspectorDrawer;
