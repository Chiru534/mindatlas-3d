export type NodeStatus = 'LOCKED' | 'UNLOCKED' | 'COMPLETED';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface MapNode {
  id: string;
  title: string;
  region: string;
  notes: string;
  xpReward: number;
  status: NodeStatus;
  position: Position3D;
  prerequisites: string[]; // IDs of parent nodes that must be COMPLETED first
  color?: string;
  tags?: string[];
  subTasks?: SubTask[];
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

export interface RegionTheme {
  name: string;
  color: string;
  emissiveColor: string;
  center: Position3D;
  description: string;
  islandRadius: number;
}

export interface QuestCompletionResult {
  newState: AtlasWorldState;
  unlockedNodeIds: string[];
  newlyEarnedXp: number;
}

export interface PrerequisiteDetail {
  id: string;
  title: string;
  isCompleted: boolean;
  region: string;
}

export interface WorldStats {
  totalNodes: number;
  completedNodes: number;
  unlockedNodes: number;
  lockedNodes: number;
  completionPercentage: number;
  totalPossibleXp: number;
  currentXp: number;
  level: number;
  nextLevelXp: number;
  currentLevelBaseXp: number;
}
