import { MapEdge, MapNode, NodeStatus, Position3D } from '../types/atlas';
import { detectCycle, REGIONS } from './questGraphEngine';

export interface MarkdownParseResult {
  nodes: MapNode[];
  edges: MapEdge[];
  regions: string[];
  warnings: string[];
}

interface ParsedTaskBlock {
  id: string;
  title: string;
  region: string;
  notes: string;
  xpReward: number;
  explicitStatus?: NodeStatus;
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
 * Normalizes title for comparison (case-insensitive, trims punctuation).
 */
function normalizeTitle(text: string): string {
  return text.trim().toLowerCase().replace(/['"`,]/g, '');
}

/**
 * Canonical region name matcher. Falls back to closest known region or defaults to 'Frontend Archipelago'.
 */
function canonicalizeRegion(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Frontend Archipelago';

  const known = Object.keys(REGIONS);
  const found = known.find((k) => k.toLowerCase() === trimmed.toLowerCase());
  if (found) return found;

  // Partial match
  const partial = known.find((k) => k.toLowerCase().includes(trimmed.toLowerCase()) || trimmed.toLowerCase().includes(k.toLowerCase()));
  if (partial) return partial;

  return trimmed;
}

/**
 * Intelligently parses markdown documents into a Directed Acyclic Graph (DAG) of MapNodes and MapEdges.
 *
 * Supports TWO primary formats seamlessly:
 *
 * 1. SECTION FORMAT (used by Kiro specs, course syllabi, and roadmap presets):
 *    # Document Title
 *    ## Task Title
 *    - Region: Frontend Archipelago
 *    - Prerequisites: HTML, CSS & Semantic Foundations
 *    - XP: 150
 *    - Tags: typescript, js
 *    Detailed description / notes text...
 *
 * 2. HIERARCHICAL OUTLINE FORMAT:
 *    # Frontend Archipelago (Region heading)
 *    - [ ] Task Title (XP: 100) [tags: react] [prereq: Parent Title]
 *      - [ ] Child Task Title (nested under parent)
 */
export function parseMarkdownToQuestGraph(markdown: string): MarkdownParseResult {
  const lines = markdown.split(/\r?\n/);
  const warnings: string[] = [];

  // Detect whether markdown uses Section Format (## Task Title with - Region: / - Prerequisites: bullets)
  const isSectionFormat = lines.some((line) => {
    const trimmed = line.trim();
    return /^-\s*(?:Region|Prerequisites?|Depends?|XP|Tags):\s*/i.test(trimmed);
  });

  if (isSectionFormat) {
    return parseSectionFormat(lines, warnings);
  } else {
    return parseOutlineFormat(lines, warnings);
  }
}

/**
 * Parses markdown using the Section Format (## Task Title + metadata bullets).
 */
function parseSectionFormat(lines: string[], warnings: string[]): MarkdownParseResult {
  const tasks: ParsedTaskBlock[] = [];
  let currentTask: ParsedTaskBlock | null = null;
  const noteLines: string[] = [];

  const finalizeCurrentTask = () => {
    if (currentTask) {
      if (noteLines.length > 0) {
        const joinedNotes = noteLines.join('\n').trim();
        currentTask.notes = currentTask.notes ? `${currentTask.notes}\n\n${joinedNotes}` : joinedNotes;
      }
      tasks.push(currentTask);
      currentTask = null;
      noteLines.length = 0;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (currentTask && noteLines.length > 0) {
        noteLines.push('');
      }
      continue;
    }

    // Check for Task Header (## or ###)
    // Note: # is treated as document title unless there are no ##
    const taskHeaderMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
    if (taskHeaderMatch) {
      finalizeCurrentTask();

      let headerTitle = taskHeaderMatch[1].trim();
      let explicitStatus: NodeStatus | undefined = undefined;

      const checkboxMatch = headerTitle.match(/^\[([ xX])\]\s*(.+)$/);
      if (checkboxMatch) {
        explicitStatus = checkboxMatch[1].toLowerCase() === 'x' ? 'COMPLETED' : 'UNLOCKED';
        headerTitle = checkboxMatch[2].trim();
      }

      currentTask = {
        id: slugify(headerTitle) || `task-${tasks.length + 1}`,
        title: headerTitle,
        region: 'Frontend Archipelago',
        notes: '',
        xpReward: 100,
        explicitStatus,
        prerequisiteTitles: [],
        tags: [],
      };
      continue;
    }

    // If we haven't encountered any task header yet, check if this is a single # title
    if (!currentTask) {
      // Document title or preamble, ignore or note
      continue;
    }

    // Check for metadata bullets under the active task
    const metaBulletMatch = trimmed.match(/^[-*+]\s*([A-Za-z]+):\s*(.*)$/);
    if (metaBulletMatch) {
      const key = metaBulletMatch[1].toLowerCase();
      const val = metaBulletMatch[2].trim();

      if (key === 'region') {
        currentTask.region = canonicalizeRegion(val);
        continue;
      }

      if (key === 'prerequisite' || key === 'prerequisites' || key === 'prereq' || key === 'depends' || key === 'dependency') {
        if (val && val.toLowerCase() !== 'none') {
          currentTask.prerequisiteTitles.push(val);
        }
        continue;
      }

      if (key === 'xp' || key === 'xpreward' || key === 'points') {
        const parsedXp = parseInt(val.replace(/\D/g, ''), 10);
        if (!isNaN(parsedXp) && parsedXp > 0) {
          currentTask.xpReward = parsedXp;
        }
        continue;
      }

      if (key === 'tag' || key === 'tags') {
        val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((t) => currentTask!.tags.push(t));
        continue;
      }

      if (key === 'status') {
        const upper = val.toUpperCase();
        if (upper === 'COMPLETED' || upper === 'UNLOCKED' || upper === 'LOCKED') {
          currentTask.explicitStatus = upper as NodeStatus;
          continue;
        }
      }
    }

    // Otherwise, this is narrative description/notes text for the task
    noteLines.push(rawLine);
  }

  finalizeCurrentTask();

  return assembleGraphFromParsedTasks(tasks, warnings);
}

/**
 * Parses markdown using hierarchical outline format (# Region, - Task bullets, nested sub-bullets).
 */
function parseOutlineFormat(lines: string[], warnings: string[]): MarkdownParseResult {
  const tasks: ParsedTaskBlock[] = [];
  let currentRegion = 'Frontend Archipelago';
  const indentStack: { depth: number; taskIndex: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    // Check for Region Heading (# or ##)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      currentRegion = canonicalizeRegion(headingMatch[1].trim());
      indentStack.length = 0;
      continue;
    }

    // Check for Bullet item: -, *, or numbered
    const bulletMatch = rawLine.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/);
    if (!bulletMatch) {
      // Append as notes to previous task
      if (tasks.length > 0) {
        const last = tasks[tasks.length - 1];
        last.notes = last.notes ? `${last.notes}\n${trimmed}` : trimmed;
      }
      continue;
    }

    const leadingSpaces = bulletMatch[1].length;
    let content = bulletMatch[2].trim();

    // Checkbox [x] or [ ]
    let explicitStatus: NodeStatus | undefined = undefined;
    const checkboxMatch = content.match(/^\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch) {
      explicitStatus = checkboxMatch[1].toLowerCase() === 'x' ? 'COMPLETED' : 'UNLOCKED';
      content = checkboxMatch[2].trim();
    }

    // Extract XP (XP: 100) or [XP: 100]
    let xpReward = 100;
    const xpMatch = content.match(/[\(\[]XP:\s*(\d+)[\)\]]/i);
    if (xpMatch) {
      xpReward = parseInt(xpMatch[1], 10);
      content = content.replace(xpMatch[0], '').trim();
    }

    // Extract [tags: ...]
    const tags: string[] = [];
    const tagsMatch = content.match(/\[tags?:\s*([^\]]+)\]/i);
    if (tagsMatch) {
      tagsMatch[1]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => tags.push(t));
      content = content.replace(tagsMatch[0], '').trim();
    }

    // Extract [prereq: ...] or [depends: ...]
    const prerequisiteTitles: string[] = [];
    const prereqMatch = content.match(/\[(?:prereqs?|depends?):\s*([^\]]+)\]/i);
    if (prereqMatch) {
      prereqMatch[1]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => prerequisiteTitles.push(p));
      content = content.replace(prereqMatch[0], '').trim();
    }

    // Clean inline notes if formatted like "Task Title: Note explanation"
    let title = content;
    let notes = '';
    const colonIndex = content.indexOf(':');
    if (colonIndex > 3 && colonIndex < content.length - 1 && !content.slice(0, colonIndex).includes('[')) {
      title = content.slice(0, colonIndex).trim();
      notes = content.slice(colonIndex + 1).trim();
    }

    // Handle indentation hierarchy (sub-bullets depend on parent bullet)
    while (indentStack.length > 0 && indentStack[indentStack.length - 1].depth >= leadingSpaces) {
      indentStack.pop();
    }

    if (indentStack.length > 0) {
      const parentTask = tasks[indentStack[indentStack.length - 1].taskIndex];
      if (parentTask && !prerequisiteTitles.includes(parentTask.title)) {
        prerequisiteTitles.push(parentTask.title);
      }
    }

    const newTaskIndex = tasks.length;
    tasks.push({
      id: slugify(title) || `task-${tasks.length + 1}`,
      title,
      region: currentRegion,
      notes,
      xpReward,
      explicitStatus,
      prerequisiteTitles,
      tags,
    });

    indentStack.push({ depth: leadingSpaces, taskIndex: newTaskIndex });
  }

  return assembleGraphFromParsedTasks(tasks, warnings);
}

/**
 * Assembles valid MapNode[] and MapEdge[] from parsed task blocks, resolving prerequisite links and 3D island positions.
 */
function assembleGraphFromParsedTasks(tasks: ParsedTaskBlock[], warnings: string[]): MarkdownParseResult {
  if (tasks.length === 0) {
    warnings.push('No valid tasks or landmarks were found in the provided markdown.');
    return { nodes: [], edges: [], regions: [], warnings };
  }

  // Ensure unique IDs
  const seenIds = new Set<string>();
  tasks.forEach((t, i) => {
    let candidate = t.id || `node-${i + 1}`;
    let counter = 1;
    while (seenIds.has(candidate)) {
      candidate = `${t.id}-${counter++}`;
    }
    t.id = candidate;
    seenIds.add(t.id);
  });

  // Build title lookup maps for prerequisite linking
  const titleToIdMap = new Map<string, string>();
  const normalizedTitleToIdMap = new Map<string, string>();
  tasks.forEach((t) => {
    titleToIdMap.set(t.title, t.id);
    normalizedTitleToIdMap.set(normalizeTitle(t.title), t.id);
  });

  // Collect regions
  const regionsSet = new Set<string>();
  tasks.forEach((t) => regionsSet.add(t.region));
  const regionsList = Array.from(regionsSet);

  // Group tasks by region to position them aesthetically across islands
  const tasksByRegion = new Map<string, ParsedTaskBlock[]>();
  tasks.forEach((t) => {
    const list = tasksByRegion.get(t.region) || [];
    list.push(t);
    tasksByRegion.set(t.region, list);
  });

  // Compute 3D Coordinates
  const positionsMap = new Map<string, Position3D>();

  tasksByRegion.forEach((regionTasks, regionName) => {
    const regionInfo = REGIONS[regionName];
    const center: Position3D = regionInfo ? regionInfo.center : { x: 0, y: 0, z: 0 };
    const radius = regionInfo ? regionInfo.islandRadius * 0.65 : 12;

    const count = regionTasks.length;
    regionTasks.forEach((task, index) => {
      let x = center.x;
      let y = center.y + 0.5;
      let z = center.z;

      if (count === 1) {
        // Center of island
        x = center.x;
        z = center.z;
      } else {
        // Golden ratio spiral distribution around island center
        const phi = index * 2.39996; // Golden angle in radians
        const r = Math.min(radius, Math.sqrt((index + 1) / count) * radius);
        x = center.x + Math.cos(phi) * r;
        z = center.z + Math.sin(phi) * r;
        y = center.y + 0.5 + ((index % 3) * 0.4);
      }

      positionsMap.set(task.id, {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        z: Math.round(z * 10) / 10,
      });
    });
  });

  // Create Edges and Resolve Prerequisites
  const edges: MapEdge[] = [];
  const edgeSet = new Set<string>();
  const nodesPrerequisitesMap = new Map<string, string[]>();

  tasks.forEach((t) => {
    const resolvedPrereqIds: string[] = [];

    // Unpack multiple prerequisites while safely preserving titles that contain commas
    const unpackedTitles: string[] = [];
    const allTitlesSorted = tasks.map((tk) => tk.title).sort((a, b) => b.length - a.length);

    t.prerequisiteTitles.forEach((rawPrereq) => {
      const trimmed = rawPrereq.trim();
      if (!trimmed) return;

      // 1. Direct match with a task title (e.g. "HTML, CSS & Semantic Foundations")
      if (titleToIdMap.has(trimmed) || normalizedTitleToIdMap.has(normalizeTitle(trimmed))) {
        unpackedTitles.push(trimmed);
        return;
      }

      // 2. Greedy match against known titles to unpack multiple prerequisites
      let remaining = trimmed;
      let matchedAny = false;
      for (const knownTitle of allTitlesSorted) {
        if (knownTitle === t.title) continue;
        const normKnown = normalizeTitle(knownTitle);
        const normRemaining = normalizeTitle(remaining);
        if (normRemaining.includes(normKnown)) {
          unpackedTitles.push(knownTitle);
          matchedAny = true;
          const idx = normRemaining.indexOf(normKnown);
          remaining = remaining.slice(0, idx) + remaining.slice(idx + knownTitle.length);
        }
      }

      // 3. Fallback: split by comma if no greedy match
      if (!matchedAny) {
        trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((p) => unpackedTitles.push(p));
      }
    });

    unpackedTitles.forEach((prereqText) => {
      const directId = titleToIdMap.get(prereqText);
      const normalizedId = normalizedTitleToIdMap.get(normalizeTitle(prereqText));
      const slugId = seenIds.has(slugify(prereqText)) ? slugify(prereqText) : undefined;

      const parentId = directId || normalizedId || slugId;

      if (parentId && parentId !== t.id) {
        resolvedPrereqIds.push(parentId);

        const edgeKey = `${parentId}->${t.id}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            id: `edge-${parentId}-${t.id}`,
            fromNodeId: parentId,
            toNodeId: t.id,
          });
        }
      } else if (!parentId) {
        warnings.push(`Task "${t.title}": referenced prerequisite "${prereqText}" could not be resolved.`);
      }
    });

    nodesPrerequisitesMap.set(t.id, resolvedPrereqIds);
  });

  // Determine Node Status
  // If no prerequisites -> UNLOCKED (or explicitStatus)
  // If prerequisites exist -> LOCKED (unless explicitly COMPLETED)
  const nodes: MapNode[] = tasks.map((t) => {
    const prereqIds = nodesPrerequisitesMap.get(t.id) || [];
    let status: NodeStatus = 'UNLOCKED';

    if (t.explicitStatus) {
      status = t.explicitStatus;
    } else if (prereqIds.length > 0) {
      status = 'LOCKED';
    } else {
      status = 'UNLOCKED';
    }

    return {
      id: t.id,
      title: t.title,
      region: t.region,
      notes: t.notes || `Landmark: ${t.title}. Explore and complete prerequisite tasks to expand your knowledge atlas.`,
      xpReward: t.xpReward,
      status,
      position: positionsMap.get(t.id) || { x: 0, y: 0.5, z: 0 },
      prerequisites: prereqIds,
      tags: t.tags.length > 0 ? t.tags : [t.region.toLowerCase().replace(/\s+/g, '-')],
    };
  });

  // Check for Cycles in the Generated Graph
  if (detectCycle(nodes, edges)) {
    warnings.push('A circular dependency was detected in the imported markdown. Removing circular road edges to maintain a valid DAG.');

    // Break circular edges safely
    const cleanEdges: MapEdge[] = [];
    const testEdges: MapEdge[] = [];

    for (const edge of edges) {
      testEdges.push(edge);
      if (detectCycle(nodes, testEdges)) {
        testEdges.pop(); // Remove cycle-causing edge
        warnings.push(`Broke cycle caused by dependency edge: ${edge.fromNodeId} -> ${edge.toNodeId}`);
      } else {
        cleanEdges.push(edge);
      }
    }

    return {
      nodes,
      edges: cleanEdges,
      regions: regionsList,
      warnings,
    };
  }

  return {
    nodes,
    edges,
    regions: regionsList,
    warnings,
  };
}
