import React, { useMemo } from 'react';
import { 
  CheckCircle2, 
  Sparkles, 
  Lock, 
  Rocket, 
  Layers, 
  Globe2,
  Award,
  ListTodo
} from 'lucide-react';
import { MapNode, MapEdge, NodeStatus } from '../types/atlas';
import { REGIONS } from '../services/questGraphEngine';

export interface SyllabusOutlineViewProps {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onCompleteQuest: (nodeId: string) => void;
  onToggleSubTask: (nodeId: string, subTaskId: string) => void;
  onSwitchTo3D: (focusNodeId?: string) => void;
}

export const SyllabusOutlineView: React.FC<SyllabusOutlineViewProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onCompleteQuest,
  onToggleSubTask,
  onSwitchTo3D,
}) => {
  // Group nodes by region (Subject Galaxy)
  const groupedRegions = useMemo(() => {
    const map = new Map<string, MapNode[]>();
    nodes.forEach((node) => {
      const region = node.region || 'General Cosmos';
      if (!map.has(region)) {
        map.set(region, []);
      }
      map.get(region)!.push(node);
    });

    // Sort nodes within each region: COMPLETED first, then UNLOCKED, then LOCKED
    const result: { region: string; nodes: MapNode[]; total: number; completed: number; percent: number }[] = [];
    map.forEach((regionNodes, region) => {
      const completed = regionNodes.filter((n) => n.status === 'COMPLETED').length;
      const total = regionNodes.length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      result.push({
        region,
        nodes: regionNodes,
        total,
        completed,
        percent,
      });
    });

    return result;
  }, [nodes]);

  // Overall syllabus stats
  const totalNodes = nodes.length;
  const completedNodes = nodes.filter((n) => n.status === 'COMPLETED').length;
  const overallPercent = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
  const totalXp = nodes.filter((n) => n.status === 'COMPLETED').reduce((sum, n) => sum + n.xpReward, 0);

  // Status color helper
  const getStatusBadge = (status: NodeStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            TERRAFORMED
          </span>
        );
      case 'UNLOCKED':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            ACTIVE MISSION
          </span>
        );
      case 'LOCKED':
      default:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-slate-800/80 border border-slate-700 text-slate-400">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            IN STASIS
          </span>
        );
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-4 py-8 sm:px-8 lg:px-12 bg-slate-950/95 font-sans text-slate-200">
      <div className="max-w-5xl mx-auto space-y-8 pt-16 pb-24">
        
        {/* Header Hero Banner */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-cyan-500/30 shadow-2xl relative overflow-hidden bg-gradient-to-br from-slate-900/90 via-slate-950/95 to-indigo-950/40">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase font-mono tracking-wider bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                  Curriculum & Syllabus Map
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Kiroween 2026 Academic Specification
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono flex items-center gap-3">
                <Globe2 className="w-7 h-7 text-cyan-400" />
                Interstellar Knowledge Syllabus
              </h1>
              <p className="text-sm text-slate-400 max-w-2xl">
                A structured, pedagogical roadmap of all planetary modules across star systems. Track prerequisites, complete milestone objectives, and inspect deep technical notes.
              </p>
            </div>

            {/* Quick Action to 3D Space */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={() => onSwitchTo3D()}
                className="px-5 py-3 rounded-xl font-mono text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-900/40 border border-cyan-400/50 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <Rocket className="w-4 h-4 text-cyan-100" />
                Launch 3D Planetary Space
              </button>
            </div>
          </div>

          {/* Overall Progress Ribbon */}
          <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-mono uppercase">Total Modules</div>
              <div className="text-xl font-extrabold font-mono text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                {totalNodes} Planets
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-mono uppercase">Mastered / Cleared</div>
              <div className="text-xl font-extrabold font-mono text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {completedNodes} / {totalNodes}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-mono uppercase">Cosmic XP Earned</div>
              <div className="text-xl font-extrabold font-mono text-amber-400 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                {totalXp} XP
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-mono uppercase">Curriculum Completion</div>
              <div className="text-xl font-extrabold font-mono text-cyan-300">
                {overallPercent}%
              </div>
            </div>
          </div>
        </div>

        {/* Sections Grouped by Subject Galaxy */}
        <div className="space-y-8">
          {groupedRegions.map((group, groupIdx) => {
            const theme = REGIONS[group.region];
            const themeColor = theme?.color || '#06b6d4';

            return (
              <section
                key={group.region}
                className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl"
              >
                {/* Subject Galaxy Section Header */}
                <div 
                  className="px-6 py-4.5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60"
                  style={{ borderLeft: `4px solid ${themeColor}` }}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono uppercase font-bold tracking-wider text-slate-400">
                        Sector {String(groupIdx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-[11px] font-mono font-semibold" style={{ color: themeColor }}>
                        {group.total} Planetary Modules
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold font-mono text-white flex items-center gap-2">
                      {group.region}
                    </h2>
                    {theme?.description && (
                      <p className="text-xs text-slate-400 max-w-xl">
                        {theme.description}
                      </p>
                    )}
                  </div>

                  {/* Regional Completion Meter */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-slate-300">
                        {group.completed} / {group.total} Mastered
                      </div>
                      <div className="text-[11px] font-mono text-cyan-400">
                        {group.percent}% Complete
                      </div>
                    </div>
                    <div className="w-20 sm:w-28 h-2 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${group.percent}%`,
                          backgroundColor: themeColor,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Planetary Lesson Cards in Sequence */}
                <div className="divide-y divide-slate-800/60">
                  {group.nodes.map((node, nodeIdx) => {
                    const isSelected = node.id === selectedNodeId;
                    const subTasks = node.subTasks || [];
                    const completedSubTasks = subTasks.filter((st) => st.completed).length;

                    return (
                      <div
                        key={node.id}
                        className={`p-5 sm:p-6 transition-colors hover:bg-slate-900/40 ${
                          isSelected ? 'bg-cyan-950/20 border-l-2 border-cyan-400' : ''
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          
                          {/* Module Header & Metadata */}
                          <div className="space-y-2.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-extrabold bg-slate-800 border border-slate-700 text-slate-300">
                                #{String(nodeIdx + 1).padStart(2, '0')}
                              </span>
                              
                              <h3 className="text-base sm:text-lg font-bold font-mono text-white hover:text-cyan-300 cursor-pointer"
                                  onClick={() => onSelectNode(node.id)}>
                                {node.title}
                              </h3>

                              {getStatusBadge(node.status)}

                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300">
                                +{node.xpReward} XP
                              </span>
                            </div>

                            {/* Module Description / Notes */}
                            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                              {node.notes || 'No curriculum syllabus notes recorded for this milestone.'}
                            </p>

                            {/* Tags & Prerequisites Pills */}
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                              {node.prerequisites.length > 0 && (
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Requires:</span>
                                  {node.prerequisites.map((prereqId) => {
                                    const pNode = nodes.find((n) => n.id === prereqId);
                                    return (
                                      <span
                                        key={prereqId}
                                        className={`px-2 py-0.5 rounded text-[10px] border ${
                                          pNode?.status === 'COMPLETED'
                                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-400'
                                        }`}
                                      >
                                        {pNode?.title || prereqId}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {node.tags && node.tags.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {node.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800/80 text-slate-400"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Subtask Checklists (if any) */}
                            {subTasks.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-800/50 space-y-2">
                                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                                  <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                                    <ListTodo className="w-3.5 h-3.5 text-cyan-400" />
                                    Learning Objectives & Subtasks ({completedSubTasks}/{subTasks.length})
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {subTasks.map((st) => (
                                    <label
                                      key={st.id}
                                      className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs font-mono transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={st.completed}
                                        onChange={() => onToggleSubTask(node.id, st.id)}
                                        className="w-3.5 h-3.5 rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-950 cursor-pointer"
                                      />
                                      <span className={st.completed ? 'line-through text-slate-500' : 'text-slate-300'}>
                                        {st.title}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}

                          </div>

                          {/* Quick Actions (Complete & 3D Warp) */}
                          <div className="flex lg:flex-col items-center gap-2 shrink-0 pt-2 lg:pt-0">
                            {node.status === 'UNLOCKED' && (
                              <button
                                onClick={() => onCompleteQuest(node.id)}
                                className="px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-md shadow-emerald-950 border border-emerald-400/50 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Clear Milestone
                              </button>
                            )}

                            <button
                              onClick={() => {
                                onSelectNode(node.id);
                                onSwitchTo3D(node.id);
                              }}
                              title="Warp camera in 3D to this planet"
                              className="px-3.5 py-2 rounded-lg text-xs font-mono font-semibold text-slate-300 bg-slate-800 hover:bg-cyan-950/60 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/50 flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Rocket className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Warp in 3D</span>
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default SyllabusOutlineView;
