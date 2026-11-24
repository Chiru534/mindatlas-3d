# MindAtlas 3D (SpatialQuest 3D) — Kiroween 2026 Master Build & Kiro Spec Plan
**Category:** Frankenstein  
**Devpost Participant:** Chiru534 (`https://devpost.com/Chiru534`)  
**Tech Stack:** React 19, TypeScript (Strict), Three.js, Tailwind CSS, Web Audio API, Kiro Specs & Agent Hooks

---

## 1. How Kiro Understands & Builds This Project
When you open your new project folder in the **Kiro IDE**, Kiro does not just act like a regular chat box—it reads a dedicated `.kiro/` folder at the root of your repository. By placing the files below inside `.kiro/`, Kiro automatically understands:
1. **Your Rules (`.kiro/steering/`):** Forces Kiro to write clean TypeScript without `any`, clean up Three.js 3D memory properly, and maintain the Frankenstein theme (stitching together 3D maps + gamified tasks + Web Audio).
2. **Your Blueprint (`.kiro/specs/mind-atlas-3d/`):**
   * `requirements.md` — Tells Kiro *what* features the user needs (written in EARS acceptance criteria so Kiro can verify every feature).
   * `design.md` — Tells Kiro *how* the 3D world, task nodes, fog-of-war unlocking, and audio synthesizer fit together.
   * `tasks.md` — Breaks the entire app into small, step-by-step checkboxes that Kiro executes one by one.
3. **Your Automation (`.kiro/hooks/`):** Runs automatic checks whenever you save a file or complete a task in your app.

> **CRITICAL HACKATHON RULE:** Never add `.kiro/` to your `.gitignore` file. Judges inspect your public GitHub repository to verify that `.kiro/specs/`, `.kiro/steering/`, and `.kiro/hooks/` were actively used to build the project.

---

## 2. Folder Structure to Create in Your New Repo
Create a brand-new folder on your computer called `mindatlas-3d`, initialize Git, and create this exact folder layout:

```text
mindatlas-3d/
├── .kiro/
│   ├── steering/
│   │   └── frankenstein-rules.md
│   ├── specs/
│   │   └── mind-atlas-3d/
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   └── hooks/
│       └── quest-spec-validator.json
├── src/
│   ├── components/
│   │   ├── AtlasCanvas3D.tsx
│   │   ├── QuestInspectorDrawer.tsx
│   │   └── TopHudBar.tsx
│   ├── services/
│   │   ├── questGraphEngine.ts
│   │   └── spatialAudioEngine.ts
│   ├── types/
│   │   └── atlas.ts
│   └── App.tsx
├── LICENSE
└── package.json
```

---

## 3. File 1: `.kiro/steering/frankenstein-rules.md`
Copy everything inside the block below into `.kiro/steering/frankenstein-rules.md` so Kiro follows these rules on every prompt:

```markdown
# MindAtlas 3D — Kiro Steering Rules (Frankenstein Category)

## Project Identity
MindAtlas 3D stitches together three distinct technologies into one seamless web application:
1. **3D Spatial Cartography (Three.js):** An interactive Google Maps / city-builder style 3D terrain of study topics, notes, and tasks.
2. **Gamified Knowledge & Quest Engine (React + TypeScript):** Tasks act as unlockable map landmarks with XP, fog-of-war progression, and dependency roads.
3. **Procedural Soundscape & Feedback (Web Audio API):** Real-time synthesized chimes, ambient region hums, and unlock fanfare without external MP3 assets.

## Mandatory Coding Standards
- **Strict TypeScript:** Never use `any`. Define all 3D coordinates, quest nodes, edges, and audio presets in `src/types/atlas.ts`.
- **Three.js Resource Hygiene:** Every `BufferGeometry`, `Material`, and `WebGLRenderer` created in React components must be disposed of inside `useEffect` cleanup functions.
- **Zero External Audio Assets:** All sound effects (node click, task complete, region unlock) must be synthesized programmatically via the browser `AudioContext`.
- **Spec-First Execution:** Always verify new features against `.kiro/specs/mind-atlas-3d/requirements.md` before modifying UI components.
```

---

## 4. File 2: `.kiro/specs/mind-atlas-3d/requirements.md`
Copy this into `.kiro/specs/mind-atlas-3d/requirements.md`. Kiro reads these `WHEN ... THE SYSTEM SHALL ...` rules to build and test your app:

```markdown
# Requirements Document: MindAtlas 3D

## Introduction
MindAtlas 3D transforms a user's daily tasks, study topics, and notes into an interactive 3D map inspired by Google Maps and city-builder games. Completing tasks unlocks connected regions, upgrades 3D landmarks, and triggers spatial Web Audio feedback.

## Requirements

### Requirement 1: Interactive 3D Map Viewport
**User Story:** As a learner or worker, I want to view my topics and tasks as an explorable 3D map with smooth camera controls, so my workload feels like an adventure rather than a boring checklist.
#### Acceptance Criteria
1. WHEN the application loads, THE SYSTEM SHALL render a 60 FPS Three.js 3D terrain grid populated with topic islands, 3D landmark buildings/nodes, and glowing road paths connecting prerequisite tasks.
2. WHEN the user drags, scrolls, or clicks on the 3D canvas, THE SYSTEM SHALL provide smooth orbit, zoom, and raycast node selection with visual hover highlights.

### Requirement 2: Task, Note & Topic Creation (Map Builder)
**User Story:** As a user, I want to add new study topics, notes, and tasks and see them spawn dynamically onto the 3D map.
#### Acceptance Criteria
1. WHEN the user submits a new task with a title, topic region, markdown notes, and prerequisite node, THE SYSTEM SHALL immediately spawn a new 3D landmark on the map and draw a connecting road edge from its prerequisite.
2. WHEN a user clicks any 3D node on the map, THE SYSTEM SHALL open a side drawer displaying its rich notes, sub-tasks, XP reward, and completion toggle.

### Requirement 3: Fog-of-War & Gamified Progression
**User Story:** As a user, I want locked topics to appear shrouded in fog or dark stone until I complete their prerequisite tasks, so I feel rewarded for finishing my work.
#### Acceptance Criteria
1. WHEN a node has incomplete prerequisite tasks, THE SYSTEM SHALL render the node in a `LOCKED` state (dimmed obsidian shader + mist ring) and prevent marking it complete until prerequisites are cleared.
2. WHEN the user marks an active task as `COMPLETED`, THE SYSTEM SHALL animate the 3D landmark into an illuminated, upgraded structure, unlock all downstream connected nodes, and increment the user's Level and XP bar.

### Requirement 4: Synthesized Web Audio Telemetry
**User Story:** As a user, I want immediate musical and spatial audio feedback when exploring the map or completing tasks.
#### Acceptance Criteria
1. WHEN the user hovers or clicks a 3D map node, THE SYSTEM SHALL synthesize a pitch-mapped Web Audio API chime corresponding to the node's elevation and region.
2. WHEN a task is completed and unlocks a new map region, THE SYSTEM SHALL play an ascending arpeggio chord via `AudioContext` without requiring external audio files.

### Requirement 5: Kiro Spec-to-Quest Generator
**User Story:** As a developer using Kiro, I want Kiro Agent Hooks to validate and sync markdown study outlines into playable 3D map quests automatically.
#### Acceptance Criteria
1. WHEN a user imports or edits a markdown study plan (`quests.md`), THE SYSTEM SHALL parse headings and bullet items into a valid Directed Acyclic Graph (DAG) of 3D map nodes with zero circular dependencies.
```

---

## 5. File 3: `.kiro/specs/mind-atlas-3d/design.md`
Copy this into `.kiro/specs/mind-atlas-3d/design.md` so Kiro knows the exact data models and math:

```markdown
# Technical Design Document: MindAtlas 3D

## Architecture Overview
MindAtlas 3D combines three core engines inside a single React + TypeScript client:
1. **Quest Graph Engine (`src/services/questGraphEngine.ts`):** Manages the Directed Acyclic Graph (DAG) of study regions, task nodes, notes, XP calculation, and topological unlock propagation.
2. **Three.js Cartography Renderer (`src/components/AtlasCanvas3D.tsx`):** Converts graph nodes into 3D terrain landmarks (`CylinderGeometry`, `OctahedronGeometry`, `BoxGeometry`) arranged across regional islands with glowing `TubeGeometry` / `Line` roads and raycast click detection.
3. **Web Audio Synthesizer (`src/services/spatialAudioEngine.ts`):** Uses `OscillatorNode` and `GainNode` envelopes to generate harmonic feedback scaled by task completion progress.

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
  prerequisites: string[]; // IDs of parent nodes that must be COMPLETED first
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
}
```

## Progression & Unlock Propagation Logic
When node $u$ transitions from `UNLOCKED` to `COMPLETED`:
1. Add $u.\text{xpReward}$ to `totalXp`, computing level as:
   $$\text{Level} = 1 + \left\lfloor \frac{\text{totalXp}}{250} \right\rfloor$$
2. For every downstream node $v$ where $u \in v.\text{prerequisites}$:
   $$\text{status}(v) = \begin{cases} \text{UNLOCKED} & \text{if } \forall p \in v.\text{prerequisites},\ \text{status}(p) = \text{COMPLETED} \\ \text{LOCKED} & \text{otherwise} \end{cases}$$
3. Trigger `spatialAudioEngine.playUnlockFanfare(unlockedCount)` and animate the 3D landmark scale from $1.0 \rightarrow 1.35$ with an emissive glow pulse.
```

---

## 6. File 4: `.kiro/specs/mind-atlas-3d/tasks.md`
Copy this into `.kiro/specs/mind-atlas-3d/tasks.md`. Inside Kiro IDE, you can click **"Start Task"** right next to each item and watch Kiro build the entire project step by step:

```markdown
# Implementation Tasks: MindAtlas 3D

- [ ] 1. Initialize project scaffold and strict TypeScript types
  - Set up Vite + React + TypeScript + Tailwind CSS + Three.js (`three`, `@types/three`, `lucide-react`).
  - Create `src/types/atlas.ts` matching the exact interfaces in `design.md`.
- [ ] 2. Build the Quest Graph & Topological Unlock Engine
  - Implement `src/services/questGraphEngine.ts` with cycle detection, initial demo world data (e.g., "Frontend Island", "Backend Citadel", "AI Sanctuary"), and `completeNodeAndPropagate(state, nodeId)`.
  - Persist world state to `localStorage` with a "Reset Demo Map" button for judges.
- [ ] 3. Implement the Procedural Web Audio Synthesizer
  - Implement `src/services/spatialAudioEngine.ts` using `AudioContext` with methods `playHoverBlip()`, `playSelectTone()`, `playCompleteFanfare()`, and a mute toggle in the HUD.
- [ ] 4. Build the Interactive Three.js 3D Map Canvas
  - Create `src/components/AtlasCanvas3D.tsx` with OrbitControls, directional + ambient lighting, regional island bases, status-colored 3D landmarks (`LOCKED` dark stone, `UNLOCKED` pulsing cyan beacon, `COMPLETED` golden monument), glowing connecting roads, and raycast click/hover handlers.
- [ ] 5. Build the Map HUD, Node Inspector Drawer, and Markdown Quest Importer
  - Create `src/components/TopHudBar.tsx` showing Player Level, XP progress bar, completion percentage, and "+ Add Quest Node" modal.
  - Create `src/components/QuestInspectorDrawer.tsx` allowing users to edit notes, view prerequisites, and click "Complete Quest & Unlock Region".
- [ ] 6. Polish Visuals & Record < 3-Minute Kiroween Demo
  - Add smooth camera fly-to transitions when clicking a node in the search bar or 3D map.
  - Verify `.kiro/` directory is committed to GitHub with an MIT `LICENSE` file.
```

---

## 7. File 5: `.kiro/hooks/quest-spec-validator.json`
Copy this into `.kiro/hooks/quest-spec-validator.json` so Kiro automatically checks your code every time you save a file:

```json
{
  "name": "MindAtlas TypeScript & Spec Integrity Hook",
  "description": "Validates strict TypeScript types and verifies Three.js disposal rules whenever a source file is saved.",
  "trigger": {
    "type": "onFileSave",
    "filePattern": "src/**/*.{ts,tsx}"
  },
  "action": {
    "type": "agentPrompt",
    "prompt": "Check the saved file against `.kiro/steering/frankenstein-rules.md` and `.kiro/specs/mind-atlas-3d/design.md`. Verify there are no `any` types and that any Three.js geometries or materials created are properly cleaned up."
  }
}
```

---

## 8. Step-by-Step Guide to Use This in Kiro Today
1. **Submit Your Credit Form First:** Finish submitting the credit form with `Category: Frankenstein` at the top so your 4,000 bonus credits arrive within ~48 hours.
2. **Create Your Repo & Paste These Files:** Create a brand-new public GitHub repo (`mindatlas-3d`), add an **MIT License**, and create the `.kiro/` files above inside the folder.
3. **Open in Kiro IDE:** Open the `mindatlas-3d` folder in Kiro. Open `.kiro/specs/mind-atlas-3d/tasks.md` and click **"Start Task"** on Task 1. Kiro will automatically read your `steering`, `requirements.md`, and `design.md` files and build each piece cleanly!