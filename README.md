# MindAtlas 3D (SpatialQuest 3D)

MindAtlas 3D is an interactive 3D spatial cartography and gamified quest engine built with React, Three.js, and the Web Audio API.

## Core Features

- **Interactive 3D Viewport:** Explorable 3D terrain rendered at 60 FPS using Three.js, featuring distinct island landmasses and animated highways.
- **Topological Quest DAG:** Task progression engine where prerequisite dependencies determine unlock states and fog-of-war clearing.
- **Procedural Audio Telemetry:** Real-time spatial sound feedback generated entirely via the browser Web Audio API without external audio assets.
- **Markdown Importer:** Convert Markdown outlines or study plans directly into interactive 3D quest graphs.

## Quickstart

### Prerequisites
- Node.js (v18 or newer)
- npm

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open `http://localhost:3000` in your web browser.

### Production Build
```bash
npm run build
```

## Architecture

- `src/components/AtlasCanvas3D.tsx`: Three.js scene, lighting, controls, and memory disposal.
- `src/components/TopHudBar.tsx`: Telemetry header displaying level, XP, and quick actions.
- `src/components/QuestInspectorDrawer.tsx`: Node inspection drawer with prerequisite validation.
- `src/services/questGraphEngine.ts`: Topological sort, DAG validation, and unlock propagation.
- `src/services/spatialAudioEngine.ts`: Mathematical sound synthesis with `AudioContext`.
- `.kiro/`: Specification rules, EARS requirements, and agent hooks.
