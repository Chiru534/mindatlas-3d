import {
  AtlasWorldState,
  MapEdge,
  MapNode,
  NodeStatus,
  Position3D,
  PrerequisiteDetail,
  QuestCompletionResult,
  RegionTheme,
  WorldStats,
} from '../types/atlas';

export const STORAGE_KEY = 'mindatlas_3d_world_state_v1';

export const REGIONS: Record<string, RegionTheme> = {
  'Frontend Archipelago': {
    name: 'Frontend Archipelago',
    color: '#06b6d4', // Cyan
    emissiveColor: '#22d3ee',
    center: { x: -26, y: 0, z: -22 },
    description: 'Bioluminescent atolls of UI cartography, responsive layouts, and spatial shaders.',
    islandRadius: 20,
  },
  'Backend Citadel': {
    name: 'Backend Citadel',
    color: '#10b981', // Emerald
    emissiveColor: '#34d399',
    center: { x: 26, y: 0, z: -22 },
    description: 'High-availability monolithic bastions, async event loops, and distributed datastores.',
    islandRadius: 20,
  },
  'AI & Neural Sanctuary': {
    name: 'AI & Neural Sanctuary',
    color: '#8b5cf6', // Violet
    emissiveColor: '#a855f7',
    center: { x: -26, y: 0, z: 24 },
    description: 'Synaptic mountain shrines, latent manifolds, and autonomous agent swarms.',
    islandRadius: 20,
  },
  'Cybersecurity Bastion': {
    name: 'Cybersecurity Bastion',
    color: '#f43f5e', // Rose
    emissiveColor: '#fb7185',
    center: { x: 26, y: 0, z: 24 },
    description: 'Zero-trust fortresses, cryptographic keystones, and exploit mitigation bulwarks.',
    islandRadius: 20,
  },
};

/**
 * Calculates level from total XP using the formula:
 * Level = 1 + floor(totalXp / 250)
 */
export function calculateLevelFromXp(totalXp: number): number {
  return 1 + Math.floor(Math.max(0, totalXp) / 250);
}

/**
 * Pre-populated demo world containing 4 themed regions with an engaging DAG structure.
 */
export function createDefaultDemoNodes(): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = [
    // --- Region 1: Frontend Archipelago (Center: x: -26, y: 0, z: -22) ---
    {
      id: 'fe-html-semantics',
      title: 'HTML5 Semantic Foundations',
      region: 'Frontend Archipelago',
      notes:
        'Master structural semantics, accessibility ARIA landmarks, and modern DOM tree layouts for spatial cartography.',
      xpReward: 50,
      status: 'COMPLETED',
      position: { x: -33, y: 1.5, z: -27 },
      prerequisites: [],
      color: '#06b6d4',
      tags: ['HTML5', 'DOM', 'Accessibility'],
    },
    {
      id: 'fe-css-grid',
      title: 'CSS Grid & Kinetic Layouts',
      region: 'Frontend Archipelago',
      notes:
        'Construct fluid glassmorphic HUD overlays, viewport coordinate spaces, and subgrid responsiveness.',
      xpReward: 75,
      status: 'COMPLETED',
      position: { x: -28, y: 2.2, z: -20 },
      prerequisites: ['fe-html-semantics'],
      color: '#06b6d4',
      tags: ['CSS', 'Layout', 'Tailwind'],
    },
    {
      id: 'fe-typescript-strict',
      title: 'Strict TypeScript Types',
      region: 'Frontend Archipelago',
      notes:
        'Eliminate any, define algebraic data types for 3D state, and enforce immutable world state transitions.',
      xpReward: 100,
      status: 'COMPLETED',
      position: { x: -20, y: 2.8, z: -26 },
      prerequisites: ['fe-html-semantics'],
      color: '#38bdf8',
      tags: ['TypeScript', 'Types', 'Generics'],
    },
    {
      id: 'fe-react19-state',
      title: 'React 19 & Concurrent State',
      region: 'Frontend Archipelago',
      notes:
        'Integrate useActionState, optimistic updates, and reactive synchronization between 2D HUD and 3D Canvas.',
      xpReward: 125,
      status: 'UNLOCKED',
      position: { x: -22, y: 3.5, z: -16 },
      prerequisites: ['fe-css-grid', 'fe-typescript-strict'],
      color: '#22d3ee',
      tags: ['React19', 'Components', 'Hooks'],
    },
    {
      id: 'fe-threejs-shaders',
      title: 'Three.js Spatial Viewport & Shaders',
      region: 'Frontend Archipelago',
      notes:
        'Render floating regional island landmasses, custom GLSL rim shaders, and raycast ray-to-mesh collisions at 60 FPS.',
      xpReward: 175,
      status: 'LOCKED',
      position: { x: -16, y: 4.8, z: -10 },
      prerequisites: ['fe-react19-state'],
      color: '#67e8f9',
      tags: ['Three.js', 'WebGL', 'Shaders', '3D'],
    },
    {
      id: 'fe-spatial-audio-vis',
      title: 'Procedural Web Audio Telemetry',
      region: 'Frontend Archipelago',
      notes:
        'Synthesize elevation-mapped blips, harmonic chords, and resonant filters purely in software via AudioContext.',
      xpReward: 150,
      status: 'LOCKED',
      position: { x: -14, y: 4.0, z: -21 },
      prerequisites: ['fe-react19-state'],
      color: '#a5f3fc',
      tags: ['WebAudio', 'DSP', 'Soundscape'],
    },

    // --- Region 2: Backend Citadel (Center: x: 26, y: 0, z: -22) ---
    {
      id: 'be-node-runtime',
      title: 'Node.js & V8 Event Loop',
      region: 'Backend Citadel',
      notes:
        'Master the libuv microtask queue, stream backpressure, and high-concurrency worker threads for spatial graphs.',
      xpReward: 50,
      status: 'COMPLETED',
      position: { x: 20, y: 1.6, z: -27 },
      prerequisites: [],
      color: '#10b981',
      tags: ['NodeJS', 'Runtime', 'V8'],
    },
    {
      id: 'be-rest-graphql',
      title: 'RESTful Contracts & GraphQL APIs',
      region: 'Backend Citadel',
      notes:
        'Design deterministic schema specifications, query batching with dataloaders, and WebSocket telemetry streams.',
      xpReward: 75,
      status: 'COMPLETED',
      position: { x: 28, y: 2.3, z: -22 },
      prerequisites: ['be-node-runtime'],
      color: '#10b981',
      tags: ['API', 'GraphQL', 'REST'],
    },
    {
      id: 'be-postgres-modeling',
      title: 'PostgreSQL & Relational Schemas',
      region: 'Backend Citadel',
      notes:
        'Model ACID transactions, recursive CTEs for DAG traversal, and spatial GiST index bounding boxes.',
      xpReward: 125,
      status: 'UNLOCKED',
      position: { x: 33, y: 3.1, z: -15 },
      prerequisites: ['be-rest-graphql'],
      color: '#34d399',
      tags: ['SQL', 'Postgres', 'ACID'],
    },
    {
      id: 'be-distributed-cache',
      title: 'Distributed In-Memory Caching',
      region: 'Backend Citadel',
      notes:
        'Implement Redis cache-aside invalidation, pub-sub spatial presence channels, and distributed locks.',
      xpReward: 150,
      status: 'LOCKED',
      position: { x: 24, y: 4.2, z: -13 },
      prerequisites: ['be-postgres-modeling'],
      color: '#6ee7b7',
      tags: ['Redis', 'Distributed', 'Caching'],
    },
    {
      id: 'be-microservices-mesh',
      title: 'Microservices & Service Mesh',
      region: 'Backend Citadel',
      notes:
        'Deploy gRPC streaming buffers, mTLS mutual authentication, and circuit breakers under load spikes.',
      xpReward: 175,
      status: 'LOCKED',
      position: { x: 17, y: 4.9, z: -8 },
      prerequisites: ['be-distributed-cache'],
      color: '#a7f3d0',
      tags: ['gRPC', 'Mesh', 'Kubernetes'],
    },

    // --- Region 3: AI & Neural Sanctuary (Center: x: -26, y: 0, z: 24) ---
    {
      id: 'ai-python-foundations',
      title: 'Python for Scientific Computing',
      region: 'AI & Neural Sanctuary',
      notes:
        'Vectorized NumPy memory buffers, broadcasting arithmetic, and high-performance tensor transformations.',
      xpReward: 50,
      status: 'COMPLETED',
      position: { x: -33, y: 1.7, z: 18 },
      prerequisites: [],
      color: '#8b5cf6',
      tags: ['Python', 'NumPy', 'Math'],
    },
    {
      id: 'ai-linear-algebra',
      title: 'Linear Algebra & Manifolds',
      region: 'AI & Neural Sanctuary',
      notes:
        'Eigenvalue decomposition, projection matrices, and multi-dimensional latent space representations.',
      xpReward: 75,
      status: 'COMPLETED',
      position: { x: -27, y: 2.5, z: 26 },
      prerequisites: ['ai-python-foundations'],
      color: '#8b5cf6',
      tags: ['Math', 'Vectors', 'Tensors'],
    },
    {
      id: 'ai-neural-nets',
      title: 'Backpropagation & Deep Neural Nets',
      region: 'AI & Neural Sanctuary',
      notes:
        'Gradient descent optimization, activation manifolds, and loss surfaces in PyTorch computational graphs.',
      xpReward: 125,
      status: 'UNLOCKED',
      position: { x: -20, y: 3.4, z: 20 },
      prerequisites: ['ai-linear-algebra'],
      color: '#a855f7',
      tags: ['PyTorch', 'NeuralNets', 'ML'],
    },
    {
      id: 'ai-transformers-attention',
      title: 'Transformers & Self-Attention',
      region: 'AI & Neural Sanctuary',
      notes:
        'Multi-head scaled dot-product attention, positional embeddings, and auto-regressive context windows.',
      xpReward: 175,
      status: 'LOCKED',
      position: { x: -16, y: 4.6, z: 28 },
      prerequisites: ['ai-neural-nets'],
      color: '#c084fc',
      tags: ['Transformers', 'LLM', 'Attention'],
    },
    {
      id: 'ai-autonomous-swarms',
      title: 'Autonomous Swarm Orchestration',
      region: 'AI & Neural Sanctuary',
      notes:
        'Multi-agent role coordination, peer-to-peer message boards, dynamic tool dispatch, and self-healing systems.',
      xpReward: 200,
      status: 'LOCKED',
      position: { x: -8, y: 5.5, z: 16 },
      prerequisites: ['ai-transformers-attention'],
      color: '#e9d5ff',
      tags: ['Agents', 'Swarms', 'Orchestration'],
    },

    // --- Region 4: Cybersecurity Bastion (Center: x: 26, y: 0, z: 24) ---
    {
      id: 'sec-osi-networking',
      title: 'TCP/IP & Network Topologies',
      region: 'Cybersecurity Bastion',
      notes:
        'Packet encapsulation, SYN/ACK handshakes, routing tables, and deep packet inspection diagnostics.',
      xpReward: 50,
      status: 'COMPLETED',
      position: { x: 33, y: 1.6, z: 19 },
      prerequisites: [],
      color: '#f43f5e',
      tags: ['Networking', 'TCP/IP', 'Packets'],
    },
    {
      id: 'sec-cryptography',
      title: 'Public Key Cryptography & PKI',
      region: 'Cybersecurity Bastion',
      notes:
        'Diffie-Hellman key exchanges, elliptic curve cryptography (Ed25519), and digital signature chains of trust.',
      xpReward: 75,
      status: 'COMPLETED',
      position: { x: 27, y: 2.4, z: 27 },
      prerequisites: ['sec-osi-networking'],
      color: '#f43f5e',
      tags: ['Cryptography', 'PKI', 'ECDSA'],
    },
    {
      id: 'sec-web-pentesting',
      title: 'Web Application Exploitation & Defense',
      region: 'Cybersecurity Bastion',
      notes:
        'OWASP Top 10 mitigation: SQL injection sanitization, CSRF defenses, and strict Content Security Policies (CSP).',
      xpReward: 125,
      status: 'UNLOCKED',
      position: { x: 20, y: 3.3, z: 19 },
      prerequisites: ['sec-cryptography'],
      color: '#fb7185',
      tags: ['Pentesting', 'OWASP', 'Security'],
    },
    {
      id: 'sec-zero-trust',
      title: 'Zero-Trust Architecture & IAM',
      region: 'Cybersecurity Bastion',
      notes:
        'Least-privilege role-based access control, cryptographic device attestation, and continuous ephemeral token refresh.',
      xpReward: 150,
      status: 'LOCKED',
      position: { x: 15, y: 4.4, z: 27 },
      prerequisites: ['sec-web-pentesting'],
      color: '#fda4af',
      tags: ['ZeroTrust', 'IAM', 'RBAC'],
    },
    {
      id: 'sec-threat-modeling',
      title: 'STRIDE Threat Modeling & Defense',
      region: 'Cybersecurity Bastion',
      notes:
        'Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege analysis.',
      xpReward: 175,
      status: 'LOCKED',
      position: { x: 8, y: 5.2, z: 15 },
      prerequisites: ['sec-zero-trust'],
      color: '#ffe4e6',
      tags: ['ThreatModel', 'STRIDE', 'Defense'],
    },
  ];

  // Derive edges cleanly from prerequisites
  const edges: MapEdge[] = [];
  for (const node of nodes) {
    for (const prereqId of node.prerequisites) {
      edges.push({
        id: `edge-${prereqId}->${node.id}`,
        fromNodeId: prereqId,
        toNodeId: node.id,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Calculates initial total XP for all completed nodes in the default world.
 */
export function calculateCompletedXp(nodes: MapNode[]): number {
  return nodes
    .filter((n) => n.status === 'COMPLETED')
    .reduce((sum, n) => sum + n.xpReward, 0);
}

/**
 * Creates the default initial state for MindAtlas 3D.
 */
export function createDefaultWorldState(): AtlasWorldState {
  const { nodes, edges } = createDefaultDemoNodes();
  const totalXp = calculateCompletedXp(nodes);
  const playerLevel = calculateLevelFromXp(totalXp);

  return {
    playerLevel,
    totalXp,
    nodes,
    edges,
    selectedNodeId: 'fe-react19-state', // Pre-select a compelling unlocked quest
    audioMuted: false,
  };
}

/**
 * Detects whether an edge addition would introduce a cycle, or whether the entire graph has cycles.
 * Uses Depth-First Search with 3-color node classification (0 = unvisited, 1 = visiting, 2 = visited).
 */
export function detectCycle(nodes: MapNode[], edges: MapEdge[]): boolean {
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId);
    if (list) {
      list.push(edge.toNodeId);
    }
  }

  const visitState = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

  function hasCycleDfs(nodeId: string): boolean {
    visitState.set(nodeId, 1); // Mark in-process

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighborId of neighbors) {
      const state = visitState.get(neighborId) || 0;
      if (state === 1) {
        return true; // Found back-edge to ancestor in current recursion stack!
      }
      if (state === 0) {
        if (hasCycleDfs(neighborId)) {
          return true;
        }
      }
    }

    visitState.set(nodeId, 2); // Done visiting
    return false;
  }

  for (const node of nodes) {
    if ((visitState.get(node.id) || 0) === 0) {
      if (hasCycleDfs(node.id)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Computes a topological ordering of the DAG.
 * Returns null if the graph contains a cycle.
 */
export function topologicalSort(nodes: MapNode[], edges: MapEdge[]): MapNode[] | null {
  const nodeMap = new Map<string, MapNode>(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.fromNodeId) && nodeMap.has(edge.toNodeId)) {
      inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) || 0) + 1);
      adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: MapNode[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = nodeMap.get(currentId);
    if (currentNode) {
      sorted.push(currentNode);
    }

    const neighbors = adjacency.get(currentId) || [];
    for (const neighborId of neighbors) {
      const newDegree = (inDegree.get(neighborId) || 0) - 1;
      inDegree.set(neighborId, newDegree);
      if (newDegree === 0) {
        queue.push(neighborId);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    return null; // Cycle detected
  }

  return sorted;
}

/**
 * Checks whether all prerequisites for a node are COMPLETED.
 */
export function arePrerequisitesCompleted(node: MapNode, allNodes: MapNode[]): boolean {
  if (node.prerequisites.length === 0) {
    return true;
  }

  const nodeMap = new Map<string, MapNode>(allNodes.map((n) => [n.id, n]));
  return node.prerequisites.every((prereqId) => {
    const prereqNode = nodeMap.get(prereqId);
    return prereqNode !== undefined && prereqNode.status === 'COMPLETED';
  });
}

/**
 * Inspects all prerequisites of a node with their individual completion status and details.
 */
export function getNodePrerequisites(node: MapNode, allNodes: MapNode[]): PrerequisiteDetail[] {
  const nodeMap = new Map<string, MapNode>(allNodes.map((n) => [n.id, n]));
  return node.prerequisites.map((prereqId) => {
    const prereq = nodeMap.get(prereqId);
    return {
      id: prereqId,
      title: prereq ? prereq.title : `Unknown Node (${prereqId})`,
      isCompleted: prereq ? prereq.status === 'COMPLETED' : false,
      region: prereq ? prereq.region : 'Unknown',
    };
  });
}

/**
 * Determines whether a node can currently be marked as COMPLETED by the user.
 * It must be UNLOCKED and all prerequisites must be COMPLETED.
 */
export function canCompleteNode(node: MapNode, allNodes: MapNode[]): boolean {
  if (node.status !== 'UNLOCKED') {
    return false;
  }
  return arePrerequisitesCompleted(node, allNodes);
}

/**
 * Completes a node, adds its XP, recalculates player level, and propagates unlock status
 * to any downstream nodes whose prerequisites are now ALL fulfilled.
 *
 * Formula:
 * - Level = 1 + floor(totalXp / 250)
 * - Downstream node unlocks ONLY if all its prerequisites are COMPLETED.
 */
export function completeNodeAndPropagate(
  state: AtlasWorldState,
  nodeId: string
): QuestCompletionResult {
  const targetNode = state.nodes.find((n) => n.id === nodeId);

  // If node does not exist or is already completed, return unchanged
  if (!targetNode || targetNode.status === 'COMPLETED') {
    return {
      newState: state,
      unlockedNodeIds: [],
      newlyEarnedXp: 0,
    };
  }

  // Verify prerequisites are completed
  if (!arePrerequisitesCompleted(targetNode, state.nodes)) {
    return {
      newState: state,
      unlockedNodeIds: [],
      newlyEarnedXp: 0,
    };
  }

  const newlyEarnedXp = targetNode.xpReward;
  const newTotalXp = state.totalXp + newlyEarnedXp;
  const newPlayerLevel = calculateLevelFromXp(newTotalXp);

  // Step 1: Mark the target node as COMPLETED
  const updatedNodes = state.nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, status: 'COMPLETED' as NodeStatus };
    }
    return node;
  });

  // Step 2: Propagate unlocks to downstream locked nodes
  const nodeMap = new Map<string, MapNode>(updatedNodes.map((n) => [n.id, n]));
  const unlockedNodeIds: string[] = [];

  const finalNodes = updatedNodes.map((node) => {
    if (node.status === 'LOCKED') {
      const allPrereqsMet = node.prerequisites.length === 0 || node.prerequisites.every((prereqId) => {
        const prereq = nodeMap.get(prereqId);
        return prereq !== undefined && prereq.status === 'COMPLETED';
      });

      if (allPrereqsMet) {
        unlockedNodeIds.push(node.id);
        return { ...node, status: 'UNLOCKED' as NodeStatus };
      }
    }
    return node;
  });

  const newState: AtlasWorldState = {
    ...state,
    playerLevel: newPlayerLevel,
    totalXp: newTotalXp,
    nodes: finalNodes,
    selectedNodeId: state.selectedNodeId,
  };

  saveWorldStateToStorage(newState);

  return {
    newState,
    unlockedNodeIds,
    newlyEarnedXp,
  };
}

/**
 * Calculates a reasonable 3D position for a new node based on its region or prerequisites.
 */
export function calculateSmartNodePosition(
  regionName: string,
  prerequisites: string[],
  existingNodes: MapNode[]
): Position3D {
  const region = REGIONS[regionName];
  const center = region ? region.center : { x: 0, y: 0, z: 0 };

  if (prerequisites.length > 0) {
    const prereqNodes = existingNodes.filter((n) => prerequisites.includes(n.id));
    if (prereqNodes.length > 0) {
      const avgX = prereqNodes.reduce((sum, n) => sum + n.position.x, 0) / prereqNodes.length;
      const avgZ = prereqNodes.reduce((sum, n) => sum + n.position.z, 0) / prereqNodes.length;
      const maxElevation = Math.max(...prereqNodes.map((n) => n.position.y));

      // Jitter slightly radially away from center
      const angle = Math.random() * Math.PI * 2;
      const distance = 4 + Math.random() * 4;
      return {
        x: Number((avgX + Math.cos(angle) * distance).toFixed(1)),
        y: Number((maxElevation + 0.8 + Math.random() * 0.5).toFixed(1)),
        z: Number((avgZ + Math.sin(angle) * distance).toFixed(1)),
      };
    }
  }

  // Position randomly on the regional island
  const angle = Math.random() * Math.PI * 2;
  const radius = 3 + Math.random() * 10;
  return {
    x: Number((center.x + Math.cos(angle) * radius).toFixed(1)),
    y: Number((1.5 + Math.random() * 2.5).toFixed(1)),
    z: Number((center.z + Math.sin(angle) * radius).toFixed(1)),
  };
}

/**
 * Adds a new custom node with automatic edge generation and cycle validation.
 */
export function addCustomNode(
  state: AtlasWorldState,
  nodeData: {
    id?: string;
    title: string;
    region: string;
    notes: string;
    xpReward?: number;
    position?: Position3D;
    prerequisites?: string[];
    color?: string;
    tags?: string[];
  }
): { newState: AtlasWorldState; createdNode: MapNode; createdEdges: MapEdge[] } {
  const id = nodeData.id || `node-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const prerequisites = nodeData.prerequisites || [];
  const regionTheme = REGIONS[nodeData.region];
  const color = nodeData.color || (regionTheme ? regionTheme.color : '#06b6d4');
  const xpReward = typeof nodeData.xpReward === 'number' && nodeData.xpReward > 0 ? nodeData.xpReward : 100;

  const position =
    nodeData.position ||
    calculateSmartNodePosition(nodeData.region, prerequisites, state.nodes);

  // Check initial status: UNLOCKED if no prerequisites or all completed, otherwise LOCKED
  const nodeMap = new Map<string, MapNode>(state.nodes.map((n) => [n.id, n]));
  const allPrereqsCompleted =
    prerequisites.length === 0 ||
    prerequisites.every((prereqId) => {
      const p = nodeMap.get(prereqId);
      return p !== undefined && p.status === 'COMPLETED';
    });

  const initialStatus: NodeStatus = allPrereqsCompleted ? 'UNLOCKED' : 'LOCKED';

  const createdNode: MapNode = {
    id,
    title: nodeData.title.trim(),
    region: nodeData.region,
    notes: nodeData.notes.trim(),
    xpReward,
    status: initialStatus,
    position,
    prerequisites,
    color,
    tags: nodeData.tags || [],
  };

  const createdEdges: MapEdge[] = prerequisites.map((prereqId) => ({
    id: `edge-${prereqId}->${id}`,
    fromNodeId: prereqId,
    toNodeId: id,
  }));

  const candidateNodes = [...state.nodes, createdNode];
  const candidateEdges = [...state.edges, ...createdEdges];

  if (detectCycle(candidateNodes, candidateEdges)) {
    throw new Error(`Cycle detected: Adding node "${createdNode.title}" creates a circular dependency.`);
  }

  const newState: AtlasWorldState = {
    ...state,
    nodes: candidateNodes,
    edges: candidateEdges,
    selectedNodeId: createdNode.id,
  };

  saveWorldStateToStorage(newState);

  return {
    newState,
    createdNode,
    createdEdges,
  };
}

/**
 * Calculates world completion statistics for HUD display.
 */
export function calculateWorldStats(state: AtlasWorldState): WorldStats {
  const totalNodes = state.nodes.length;
  const completedNodes = state.nodes.filter((n) => n.status === 'COMPLETED').length;
  const unlockedNodes = state.nodes.filter((n) => n.status === 'UNLOCKED').length;
  const lockedNodes = state.nodes.filter((n) => n.status === 'LOCKED').length;
  const completionPercentage =
    totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  const totalPossibleXp = state.nodes.reduce((sum, n) => sum + n.xpReward, 0);
  const currentXp = state.totalXp;
  const level = state.playerLevel;
  const currentLevelBaseXp = (level - 1) * 250;
  const nextLevelXp = level * 250;

  return {
    totalNodes,
    completedNodes,
    unlockedNodes,
    lockedNodes,
    completionPercentage,
    totalPossibleXp,
    currentXp,
    level,
    nextLevelXp,
    currentLevelBaseXp,
  };
}

/**
 * Persists the AtlasWorldState safely to localStorage.
 */
export function saveWorldStateToStorage(state: AtlasWorldState): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (err) {
    console.warn('[questGraphEngine] Failed to save world state to localStorage:', err);
  }
}

/**
 * Loads the AtlasWorldState from localStorage with validation fallback.
 */
export function loadWorldStateFromStorage(): AtlasWorldState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AtlasWorldState>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray(parsed.nodes) &&
      Array.isArray(parsed.edges)
    ) {
      // Recalculate level and XP directly from completed nodes (never trust stale/corrupt client values)
      const completedXp = parsed.nodes
        .filter((n) => n.status === 'COMPLETED')
        .reduce((sum, n) => sum + (n.xpReward || 0), 0);
      const recalculatedLevel = 1 + Math.floor(completedXp / 250);

      return {
        playerLevel: recalculatedLevel,
        totalXp: completedXp,
        nodes: parsed.nodes,
        edges: parsed.edges,
        selectedNodeId: parsed.selectedNodeId || null,
        audioMuted: !!parsed.audioMuted,
      };
    }
  } catch (err) {
    console.warn('[questGraphEngine] Corrupted state in localStorage, resetting:', err);
  }
  return null;
}

/**
 * Toggles a sub-task on a specific landmark and returns the updated state.
 */
export function toggleNodeSubTask(state: AtlasWorldState, nodeId: string, subTaskId: string): AtlasWorldState {
  const updatedNodes = state.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const currentSubTasks = node.subTasks && node.subTasks.length > 0 ? node.subTasks : [
      { id: 'sub-1', title: `Review foundational concepts for ${node.title}`, completed: node.status === 'COMPLETED' },
      { id: 'sub-2', title: `Complete hands-on exercise / lab session`, completed: node.status === 'COMPLETED' },
      { id: 'sub-3', title: `Verify implementation & clear dependencies`, completed: node.status === 'COMPLETED' },
    ];
    const toggled = currentSubTasks.map((st) => (st.id === subTaskId ? { ...st, completed: !st.completed } : st));
    return {
      ...node,
      subTasks: toggled,
    };
  });

  return {
    ...state,
    nodes: updatedNodes,
  };
}

/**
 * Updates study notes on a specific landmark and returns the updated state.
 */
export function updateNodeNotes(state: AtlasWorldState, nodeId: string, newNotes: string): AtlasWorldState {
  const updatedNodes = state.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    return {
      ...node,
      notes: newNotes,
    };
  });

  return {
    ...state,
    nodes: updatedNodes,
  };
}

/**
 * Resets the world to the default pre-populated demo dataset and saves to localStorage.
 */
export function resetToDefaultDemoWorld(): AtlasWorldState {
  const defaultState = createDefaultWorldState();
  saveWorldStateToStorage(defaultState);
  return defaultState;
}
