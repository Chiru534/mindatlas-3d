# Technical Design Document: MindAtlas 3D

## Architecture Overview
MindAtlas 3D combines three core engines inside a single React + TypeScript client:
1. **Quest Graph Engine (`src/services/questGraphEngine.ts`):** Manages the Directed Acyclic Graph (DAG) of study regions, task nodes, notes, XP calculation, and topological unlock propagation.
2. **Three.js Cartography Renderer (`src/components/AtlasCanvas3D.tsx`):** Converts graph nodes into 3D terrain landmarks arranged across regional islands with glowing road curves and raycast click detection.
3. **Web Audio Synthesizer (`src/services/spatialAudioEngine.ts`):** Uses native `OscillatorNode` and `GainNode` envelopes to generate harmonic feedback scaled by task progress.

## Core Data Model (`src/types/atlas.ts`)
```typescript
export type NodeStatus = 'LOCKED' | 'UNLOCKED' | 'COMPLETED';

export interface MapNode {
  id: string;
  title: string;
  region: string;
  notes: string;
  xpReward: number;
  status: NodeStatus;
  position: { x: number; y: number; z: number };
  prerequisites: string[];
  color?: string;
  tags?: string[];
}

export interface MapEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface AtlasWorldState {
  playerLevel: number;
  totalXp: number;
  nodes: MapNode[];
  edges: MapEdge[];
  selectedNodeId: string | null;
  audioMuted: boolean;
}
```

## Progression & Unlock Propagation Logic
When node $u$ transitions from `UNLOCKED` to `COMPLETED`:
1. Add $u.\text{xpReward}$ to `totalXp`, computing level as:
   $$\text{Level} = 1 + \left\lfloor \frac{\text{totalXp}}{250} \right\rfloor$$
2. For every downstream node $v$ where $u \in v.\text{prerequisites}$:
   $$\text{status}(v) = \begin{cases} \text{UNLOCKED} & \text{if } \forall p \in v.\text{prerequisites},\ \text{status}(p) = \text{COMPLETED} \\ \text{LOCKED} & \text{otherwise} \end{cases}$$
3. Trigger `spatialAudioEngine.playCompleteFanfare(unlockedCount)` and animate the 3D landmark scale with an emissive glow pulse.
