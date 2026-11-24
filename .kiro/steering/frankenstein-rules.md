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
