import React, { useState, useEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { AtlasCanvas3D } from './components/AtlasCanvas3D';
import { TopHudBar } from './components/TopHudBar';
import { QuestInspectorDrawer } from './components/QuestInspectorDrawer';
import { QuestImportModal } from './components/QuestImportModal';
import { AddQuestModal } from './components/AddQuestModal';
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
} from './services/questGraphEngine';
import { parseMarkdownToQuestGraph } from './services/markdownQuestParser';
import {
  playHoverBlip,
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
      playSelectTone();
    },
    []
  );

  // Node hover audio trigger
  const handleHoverNode = useCallback((nodeId: string | null, elevation?: number) => {
    if (nodeId) {
      playHoverBlip(elevation);
    }
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
    (importedNodes: MapNode[], importedEdges: MapEdge[]) => {
      setWorldState((prev) => {
        // Merge or replace graph
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

      setIsImportModalOpen(false);
      playCompleteFanfare(2);
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
      {/* 3D WebGL Three.js Canvas */}
      <AtlasCanvas3D
        nodes={worldState.nodes}
        edges={worldState.edges}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
        onHoverNode={handleHoverNode}
      />

      {/* Top HUD Bar */}
      <TopHudBar
        playerLevel={worldState.playerLevel}
        totalXp={worldState.totalXp}
        stats={stats}
        audioMuted={audioMutedState}
        onToggleAudio={handleToggleAudio}
        onOpenAddQuest={() => setIsAddQuestModalOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onResetDemoWorld={handleResetDemoWorld}
        onResetCamera={() => {
          // Deselect node to center overview
          setSelectedNodeId(null);
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
      />

      {/* Import Markdown / Kiro Spec Modal */}
      <QuestImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportGraph={handleImportGraph}
        parseMarkdownToGraph={(md) => {
          const res = parseMarkdownToQuestGraph(md);
          return { nodes: res.nodes, edges: res.edges };
        }}
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
