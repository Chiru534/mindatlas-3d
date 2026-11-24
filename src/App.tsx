import React, { useState, useEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { AtlasCanvas3D } from './components/AtlasCanvas3D';
import { SyllabusOutlineView } from './components/SyllabusOutlineView';
import { TopHudBar } from './components/TopHudBar';
import { QuestInspectorDrawer } from './components/QuestInspectorDrawer';
import { QuestImportModal } from './components/QuestImportModal';
import { AddQuestModal } from './components/AddQuestModal';
import { Rocket, FileText } from 'lucide-react';
import {
  AtlasWorldState,
  MapNode,
  MapEdge,
} from './types/atlas';
import {
  createDefaultWorldState,
  loadWorldStateFromStorage,
  saveWorldStateToStorage,
  completeNodeAndPropagate,
  resetToDefaultDemoWorld,
  addCustomNode,
  calculateWorldStats,
  getNodePrerequisites,
  toggleNodeSubTask,
  updateNodeNotes,
} from './services/questGraphEngine';
import {
  playSelectTone,
  playCompleteFanfare,
  playUnlockWhoosh,
  startAmbientHum,
  stopAmbientHum,
  setMuted,
  isMuted,
} from './services/spatialAudioEngine';

export const App: React.FC = () => {
  // Initialize state from localStorage or default demo world
  const [worldState, setWorldState] = useState<AtlasWorldState>(() => {
    const saved = loadWorldStateFromStorage();
    return saved || createDefaultWorldState();
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [currentViewMode, setCurrentViewMode] = useState<'3d' | 'syllabus'>('3d');
  const [cameraResetTrigger, setCameraResetTrigger] = useState<number>(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isAddQuestModalOpen, setIsAddQuestModalOpen] = useState<boolean>(false);
  const [audioMutedState, setAudioMutedState] = useState<boolean>(() => isMuted());

  // Save changes to localStorage
  useEffect(() => {
    saveWorldStateToStorage(worldState);
  }, [worldState]);

  // Derived statistics
  const stats = useMemo(() => calculateWorldStats(worldState), [worldState]);

  // Next Recommended Mission (Up Next in Syllabus)
  const nextMissionNode = useMemo(() => {
    return (
      worldState.nodes.find((n) => n.status === 'UNLOCKED') ||
      worldState.nodes.find((n) => n.status === 'LOCKED') ||
      null
    );
  }, [worldState.nodes]);

  // Selected node object
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return worldState.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, worldState.nodes]);

  // Prerequisites for selected node
  const selectedNodePrerequisites = useMemo(() => {
    if (!selectedNode) return [];
    return getNodePrerequisites(selectedNode, worldState.nodes);
  }, [selectedNode, worldState.nodes]);

  // Audio mute toggle
  const handleToggleAudio = useCallback(() => {
    const newMuted = !audioMutedState;
    setMuted(newMuted);
    setAudioMutedState(newMuted);
    if (!newMuted) {
      startAmbientHum();
      playSelectTone();
    } else {
      stopAmbientHum();
    }
  }, [audioMutedState]);

  // Node selection handler
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setIsDrawerOpen(true);
    },
    []
  );

  // Node hover audio trigger (handled internally by AtlasCanvas3D with region-tuned pitch)
  const handleHoverNode = useCallback((_nodeId: string | null) => {
    // Avoid double playback; Canvas handles spatial audio hover
  }, []);

  // Update notes on a landmark (Requirement 2.2 / Task 5)
  const handleUpdateNotes = useCallback((nodeId: string, updatedNotes: string) => {
    setWorldState((prev) => updateNodeNotes(prev, nodeId, updatedNotes));
  }, []);

  // Toggle sub-task handler (Requirement 2.2)
  const handleToggleSubTask = useCallback((nodeId: string, subTaskId: string) => {
    setWorldState((prev) => toggleNodeSubTask(prev, nodeId, subTaskId));
  }, []);

  // Quest Completion Handler
  const handleCompleteQuest = useCallback(
    (nodeId: string) => {
      const result = completeNodeAndPropagate(worldState, nodeId);
      setWorldState(result.newState);

      // Play triumphant fanfare & whoosh for unlocked regions
      playCompleteFanfare(result.unlockedNodeIds.length);
      if (result.unlockedNodeIds.length > 0) {
        setTimeout(() => playUnlockWhoosh(), 350);
      }

      // Celebratory confetti burst
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.65 },
          colors: ['#06b6d4', '#eab308', '#a855f7', '#10b981'],
        });
      } catch (err) {
        console.debug('Confetti execution skipped:', err);
      }
    },
    [worldState]
  );

  // Add Custom Quest Node Handler
  const handleAddQuest = useCallback(
    (newQuestData: {
      title: string;
      region: string;
      notes: string;
      xpReward: number;
      prerequisites: string[];
      tags: string[];
    }) => {
      const result = addCustomNode(worldState, newQuestData);
      setWorldState(result.newState);
      setIsAddQuestModalOpen(false);
      playSelectTone();
    },
    [worldState]
  );

  // Markdown Import Handler
  const handleImportGraph = useCallback(
    (importedNodes: MapNode[], importedEdges: MapEdge[], replaceWorld: boolean) => {
      setWorldState((prev) => {
        if (replaceWorld) {
          const completedXp = importedNodes
            .filter((n) => n.status === 'COMPLETED')
            .reduce((sum, n) => sum + n.xpReward, 0);
          const playerLevel = 1 + Math.floor(completedXp / 250);

          return {
            playerLevel,
            totalXp: completedXp,
            nodes: importedNodes,
            edges: importedEdges,
            selectedNodeId: null,
            audioMuted: prev.audioMuted,
          };
        }

        // Merge logic
        const mergedNodes = [...prev.nodes];
        const mergedEdges = [...prev.edges];

        importedNodes.forEach((impNode) => {
          const idx = mergedNodes.findIndex((n) => n.id === impNode.id);
          if (idx >= 0) {
            mergedNodes[idx] = impNode;
          } else {
            mergedNodes.push(impNode);
          }
        });

        importedEdges.forEach((impEdge) => {
          const exists = mergedEdges.some(
            (e) => e.fromNodeId === impEdge.fromNodeId && e.toNodeId === impEdge.toNodeId
          );
          if (!exists) {
            mergedEdges.push(impEdge);
          }
        });

        return {
          ...prev,
          nodes: mergedNodes,
          edges: mergedEdges,
        };
      });

      setSelectedNodeId(null);
      setIsImportModalOpen(false);
      setCameraResetTrigger((c) => c + 1);
      playCompleteFanfare(3);
    },
    []
  );

  // Reset Demo World
  const handleResetDemoWorld = useCallback(() => {
    const fresh = resetToDefaultDemoWorld();
    setWorldState(fresh);
    setSelectedNodeId(null);
    setIsDrawerOpen(false);
    playSelectTone();
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 3D WebGL Three.js Canvas Container */}
      <div className={`w-full h-full ${currentViewMode === '3d' ? 'block' : 'hidden'}`}>
        <AtlasCanvas3D
          nodes={worldState.nodes}
          edges={worldState.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          onHoverNode={handleHoverNode}
          cameraResetTrigger={cameraResetTrigger}
          audioMuted={audioMutedState}
          isDrawerOpen={isDrawerOpen && selectedNode !== null}
        />
      </div>

      {/* 2D Structured Syllabus Outline View */}
      {currentViewMode === 'syllabus' && (
        <div className="w-full h-full relative z-10">
          <SyllabusOutlineView
            nodes={worldState.nodes}
            edges={worldState.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onCompleteQuest={handleCompleteQuest}
            onToggleSubTask={handleToggleSubTask}
            onSwitchTo3D={(focusNodeId) => {
              setCurrentViewMode('3d');
              if (focusNodeId) {
                handleSelectNode(focusNodeId);
              }
            }}
          />
        </div>
      )}

      {/* Persistent Mission Compass HUD Bar (3D Mode) */}
      {currentViewMode === '3d' && nextMissionNode && !isDrawerOpen && (
        <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-xl w-[92vw] sm:w-auto">
          <div className="glass-panel px-4 py-2.5 rounded-2xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/80 bg-slate-950/90 backdrop-blur-md flex items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0 text-cyan-400">
                <Rocket className="w-4 h-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <span>Current Mission</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">{nextMissionNode.region}</span>
                </div>
                <div className="font-bold text-slate-100 truncate text-xs sm:text-sm">
                  {nextMissionNode.title}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleSelectNode(nextMissionNode.id);
                  playSelectTone();
                }}
                className="px-3 py-1.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-900/50 flex items-center gap-1 cursor-pointer transition-all active:scale-95 text-[11px]"
              >
                <span>Warp to Planet</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentViewMode('syllabus')}
                title="View in Syllabus Outline"
                className="p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top HUD Bar */}
      <TopHudBar
        playerLevel={worldState.playerLevel}
        totalXp={worldState.totalXp}
        stats={stats}
        audioMuted={audioMutedState}
        nodes={worldState.nodes}
        currentViewMode={currentViewMode}
        onToggleViewMode={setCurrentViewMode}
        onSelectNode={handleSelectNode}
        onToggleAudio={handleToggleAudio}
        onOpenAddQuest={() => setIsAddQuestModalOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onResetDemoWorld={handleResetDemoWorld}
        onResetCamera={() => {
          setSelectedNodeId(null);
          setCameraResetTrigger((c) => c + 1);
          playSelectTone();
        }}
      />

      {/* Slide-In Quest Inspector Drawer */}
      <QuestInspectorDrawer
        node={selectedNode}
        prerequisites={selectedNodePrerequisites}
        isOpen={isDrawerOpen && selectedNode !== null}
        onClose={() => setIsDrawerOpen(false)}
        onCompleteQuest={handleCompleteQuest}
        onFocusNode={(nodeId) => handleSelectNode(nodeId)}
        onUpdateNotes={handleUpdateNotes}
        onToggleSubTask={handleToggleSubTask}
      />

      {/* Import Markdown / Kiro Spec Modal */}
      <QuestImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportGraph={handleImportGraph}
      />

      {/* Quick Add Quest Modal */}
      <AddQuestModal
        isOpen={isAddQuestModalOpen}
        onClose={() => setIsAddQuestModalOpen(false)}
        existingNodes={worldState.nodes}
        onAddQuest={handleAddQuest}
      />

      {/* Floating Exploration Controls Hint */}
      <div className="fixed bottom-4 left-4 z-20 pointer-events-none hidden sm:block">
        <div className="glass-panel px-3.5 py-2 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono flex items-center gap-3 shadow-lg">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Orbit: Drag Left-Click
          </span>
          <span className="text-slate-600">|</span>
          <span>Pan: Drag Right-Click</span>
          <span className="text-slate-600">|</span>
          <span>Zoom: Scroll Wheel</span>
        </div>
      </div>
    </div>
  );
};

export default App;
