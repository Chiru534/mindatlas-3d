import { MapEdge, MapNode, NodeStatus, Position3D } from '../types/atlas';
import { detectCycle, REGIONS } from './questGraphEngine';

export interface MarkdownParseResult {
  nodes: MapNode[];
  edges: MapEdge[];
  regions: string[];
  warnings: string[];
}

interface RawParsedItem {
  id: string;
  title: string;
  region: string;
  notes: string;
  xpReward: number;
  explicitStatus?: NodeStatus;
  indentDepth: number;
  parentIndex: number | null;
  prerequisiteTitles: string[];
  tags: string[];
}

/**
 * Slugs a string into a clean, deterministic identifier.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Parses markdown study plans, roadmaps, or Kiro specs into a valid DAG of MapNodes and MapEdges.
 *
 * Supported syntax:
 * - `# Region Name` or `## Region Name`: Sets active island region.
 * - `- [x] Task Title`: Marks completed task.
 * - `- [ ] Task Title`: Explicitly marks task to be solved.
 * - `- Task Title: Notes here`: Bullet item with inline notes.
 * - `(XP: 100)` or `[XP: 100]`: Custom XP reward value.
 * - `[tags: tag1, tag2]`: Custom tag metadata.
 * - `[depends: Parent Title]` or `[prereq: Parent Title]`: Explicit prerequisite link.
 * - Nested indentation: Automatically makes the parent bullet a prerequisite of the child.
 */
export function parseMarkdownToQuestGraph(markdown: string): MarkdownParseResult {
  const lines = markdown.split(/\r?\n/);
  const warnings: string[] = [];
  const rawItems: RawParsedItem[] = [];
  const discoveredRegions = new Set<string>();

  let currentRegion = 'Frontend Archipelago';
  discoveredRegions.add(currentRegion);

  // Stack of parent item indices by indent level
  const indentStack: { depth: number; index: number }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    // Check for Region Heading (# or ##)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      const headingTitle = headingMatch[1].trim();
      currentRegion = headingTitle;
      discoveredRegions.add(currentRegion);
      indentStack.length = 0; // Reset indent hierarchy for new region
      continue;
    }

    // Check for bullet list item: -, *, or numbered
    const bulletMatch = rawLine.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/);
    if (!bulletMatch) {
      // Append text as notes to the most recent item if applicable
      if (rawItems.length > 0) {
        const lastItem = rawItems[rawItems.length - 1];
        lastItem.notes = lastItem.notes ? `${lastItem.notes}\n${trimmed}` : trimmed;
      }
      continue;
    }

    const leadingSpaces = bulletMatch[1].length;
    let itemContent = bulletMatch[2].trim();

    // Determine completion checkbox if present: [x] or [ ]
    let explicitStatus: NodeStatus | undefined = undefined;
    const checkboxMatch = itemContent.match(/^\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch) {
      explicitStatus = checkboxMatch[1].toLowerCase() === 'x' ? 'COMPLETED' : 'UNLOCKED';
      itemContent = checkboxMatch[2].trim();
    }

    // Extract XP reward if specified, e.g. (XP: 150) or [XP: 150]
    let xpReward = 100;
    const xpMatch = itemContent.match(/[\(\[]XP:\s*(\d+)[\)\]]/i);
    if (xpMatch) {
      xpReward = parseInt(xpMatch[1], 10);
      itemContent = itemContent.replace(xpMatch[0], '').trim();
    }

    // Extract Tags if specified, e.g. [tags: React, 3D, WebGL]
    const tags: string[] = [];
    const tagsMatch = itemContent.match(/\[tags:\s*([^\]]+)\]/i);
    if (tagsMatch) {
      tagsMatch[1]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => tags.push(t));
      itemContent = itemContent.replace(tagsMatch[0], '').trim();
    }

    // Extract explicit dependencies, e.g. [depends: Node A, Node B] or [prereq: Node A]
    const prerequisiteTitles: string[] = [];
    const prereqMatch = itemContent.match(/\[(?:depends|prereq|requires):\s*([^\]]+)\]/i);
    if (prereqMatch) {
      prereqMatch[1]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => prerequisiteTitles.push(p));
      itemContent = itemContent.replace(prereqMatch[0], '').trim();
    }

    // Split title and inline notes (separated by colon or dash)
    let title = itemContent;
    let notes = '';
    const colonIdx = itemContent.indexOf(':');
    if (colonIdx !== -1) {
      title = itemContent.substring(0, colonIdx).trim();
      notes = itemContent.substring(colonIdx + 1).trim();
    }

    // Determine parent from indent stack
    while (indentStack.length > 0 && indentStack[indentStack.length - 1].depth >= leadingSpaces) {
      indentStack.pop();
    }
    const parentIndex = indentStack.length > 0 ? indentStack[indentStack.length - 1].index : null;

    const baseSlug = slugify(title) || `node-${rawItems.length + 1}`;
    let finalId = baseSlug;
    let counter = 1;
    while (rawItems.some((item) => item.id === finalId)) {
      finalId = `${baseSlug}-${counter++}`;
    }

    const currentIndex = rawItems.length;
    rawItems.push({
      id: finalId,
      title,
      region: currentRegion,
      notes: notes || `Objective and mastery notes for ${title}.`,
      xpReward,
      explicitStatus,
      indentDepth: leadingSpaces,
      parentIndex,
      prerequisiteTitles,
      tags,
    });

    indentStack.push({ depth: leadingSpaces, index: currentIndex });
  }

  if (rawItems.length === 0) {
    warnings.push('No bullet list items or headings found in markdown input.');
    return {
      nodes: [],
      edges: [],
      regions: [],
      warnings,
    };
  }

  // Map of title to ID for resolving explicit prerequisites
  const titleToId = new Map<string, string>();
  for (const item of rawItems) {
    titleToId.set(item.title.toLowerCase(), item.id);
  }

  // Build nodes and resolve prerequisites
  const preliminaryNodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const prerequisites: string[] = [];

    // 1. Add hierarchical parent prerequisite from indentation
    if (item.parentIndex !== null && item.parentIndex >= 0 && item.parentIndex < rawItems.length) {
      const parentId = rawItems[item.parentIndex].id;
      if (!prerequisites.includes(parentId)) {
        prerequisites.push(parentId);
      }
    }

    // 2. Add explicit prerequisites
    for (const prereqTitle of item.prerequisiteTitles) {
      const resolvedId = titleToId.get(prereqTitle.toLowerCase());
      if (resolvedId && resolvedId !== item.id && !prerequisites.includes(resolvedId)) {
        prerequisites.push(resolvedId);
      } else if (!resolvedId) {
        warnings.push(`Could not find prerequisite "${prereqTitle}" for task "${item.title}".`);
      }
    }

    preliminaryNodes.push({
      id: item.id,
      title: item.title,
      region: item.region,
      notes: item.notes,
      xpReward: item.xpReward,
      status: item.explicitStatus || 'LOCKED',
      position: { x: 0, y: 0, z: 0 }, // Will calculate below
      prerequisites,
      tags: item.tags,
    });
  }

  // Build candidate edges
  for (const node of preliminaryNodes) {
    for (const prereqId of node.prerequisites) {
      edges.push({
        id: `edge-${prereqId}->${node.id}`,
        fromNodeId: prereqId,
        toNodeId: node.id,
      });
    }
  }

  // Validate for cycles
  if (detectCycle(preliminaryNodes, edges)) {
    warnings.push('Cycle detected in prerequisites. Pruning circular back-edges.');
    // Prune back-edges safely to ensure valid DAG
    const safeEdges: MapEdge[] = [];
    for (const edge of edges) {
      if (!detectCycle(preliminaryNodes, [...safeEdges, edge])) {
        safeEdges.push(edge);
      } else {
        warnings.push(`Pruned circular edge: ${edge.fromNodeId} -> ${edge.toNodeId}`);
      }
    }
    edges.length = 0;
    edges.push(...safeEdges);

    // Synchronize prerequisites on nodes
    for (const node of preliminaryNodes) {
      node.prerequisites = edges
        .filter((e) => e.toNodeId === node.id)
        .map((e) => e.fromNodeId);
    }
  }

  // Compute unlock status: if node has explicitStatus === 'COMPLETED', keep it;
  // otherwise, if all prerequisites are completed or it has none, it is UNLOCKED, else LOCKED.
  const nodeMap = new Map<string, MapNode>(preliminaryNodes.map((n) => [n.id, n]));
  for (const node of preliminaryNodes) {
    if (node.status !== 'COMPLETED') {
      const allPrereqsDone =
        node.prerequisites.length === 0 ||
        node.prerequisites.every((pid) => {
          const p = nodeMap.get(pid);
          return p !== undefined && p.status === 'COMPLETED';
        });
      node.status = allPrereqsDone ? 'UNLOCKED' : 'LOCKED';
    }
  }

  // Calculate 3D spatial layout for nodes grouped by region
  const nodesByRegion = new Map<string, MapNode[]>();
  for (const node of preliminaryNodes) {
    const list = nodesByRegion.get(node.region) || [];
    list.push(node);
    nodesByRegion.set(node.region, list);
  }

  const regionNames = Array.from(discoveredRegions);
  const regionCenters = new Map<string, Position3D>();

  // Assign region centers (match pre-defined regions if available, or compute evenly spaced island coords)
  regionNames.forEach((regionName, idx) => {
    if (REGIONS[regionName]) {
      regionCenters.set(regionName, REGIONS[regionName].center);
    } else {
      const totalCustom = regionNames.length;
      const angle = (idx / totalCustom) * Math.PI * 2;
      const radius = 32;
      regionCenters.set(regionName, {
        x: Number((Math.cos(angle) * radius).toFixed(1)),
        y: 0,
        z: Number((Math.sin(angle) * radius).toFixed(1)),
      });
    }
  });

  // Position nodes within each region
  for (const [regionName, rNodes] of nodesByRegion.entries()) {
    const center = regionCenters.get(regionName) || { x: 0, y: 0, z: 0 };

    rNodes.forEach((node, nodeIndex) => {
      // Golden angle spiral placement around island center
      const angle = nodeIndex * 2.39996; // ~137.5 degrees in radians
      const dist = 3 + Math.sqrt(nodeIndex + 1) * 3.2;
      const elevation = 1.5 + (nodeIndex % 4) * 0.9;

      node.position = {
        x: Number((center.x + Math.cos(angle) * dist).toFixed(1)),
        y: Number(elevation.toFixed(1)),
        z: Number((center.z + Math.sin(angle) * dist).toFixed(1)),
      };

      // Set regional color if not present
      const theme = REGIONS[regionName];
      if (theme) {
        node.color = theme.color;
      }
    });
  }

  return {
    nodes: preliminaryNodes,
    edges,
    regions: regionNames,
    warnings,
  };
}

/**
 * Pre-configured Markdown templates for quick import and demo testing.
 */
export const PRESET_MARKDOWN_TEMPLATES = {
  fullstack: `# Frontend Archipelago
- [x] HTML5 Semantics & Web APIs: Semantic landmarks, Canvas, and Service Workers (XP: 50) [tags: HTML, Web]
  - [x] Modern CSS & Tailwind: Flexbox, CSS Grid, animations, and dark mode (XP: 75) [tags: CSS, Styling]
    - [ ] React 19 Ecosystem: Concurrent mode, Server Components, and Actions (XP: 125) [tags: React, TypeScript]
      - [ ] Three.js 3D Cartography: Interactive WebGL viewports and GLSL shaders (XP: 175) [tags: 3D, WebGL]

# Backend Citadel
- [x] Node.js Core Architecture: V8 engine, Event Loop, and Buffer streams (XP: 50) [tags: Node, Runtime]
  - [x] PostgreSQL & Relational Modeling: Schema indexing, CTEs, and ACID transactions (XP: 100) [tags: Database, SQL]
    - [ ] Distributed Caching with Redis: Eviction policies, pub/sub, and cluster mode (XP: 150) [tags: Redis, Cache]
      - [ ] Microservices Mesh: gRPC streaming, Docker containers, and Kubernetes pods (XP: 200) [tags: Microservices, K8s]
`,

  aiEngineer: `# AI & Neural Sanctuary
- [x] Linear Algebra for Deep Learning: Matrix decomposition, eigenvalues, and tensors (XP: 75) [tags: Math, AI]
  - [x] PyTorch Computational Graphs: Autograd, loss functions, and backprop (XP: 100) [tags: PyTorch, ML]
    - [ ] Transformer Architectures: Scaled dot-product self-attention mechanisms (XP: 150) [tags: Transformers, NLP]
      - [ ] Autonomous Agent Swarms: Multi-agent coordination and DAG workflows (XP: 200) [tags: Agents, LLM]

# Cybersecurity Bastion
- [x] Cryptography Keystones: Public-key cryptography, Diffie-Hellman, and SHA-256 (XP: 75) [tags: Crypto, Security]
  - [ ] Zero-Trust Architecture: Continuous authentication and least-privilege IAM (XP: 150) [tags: IAM, ZeroTrust]
    - [ ] Penetration Testing & Threat Defense: OWASP Top 10 mitigation and fuzzing (XP: 175) [tags: Pentesting, Defense]
`,
};
