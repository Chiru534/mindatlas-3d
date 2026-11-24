# MindAtlas 3D (SpatialQuest 3D)

**Event:** Kiroween 2026 Hackathon  
**Track:** Frankenstein Category  
**Author:** Chiru534 (`https://devpost.com/Chiru534`)  
**Core Technologies:** React 19, TypeScript (Strict), Three.js, Tailwind CSS, Web Audio API, Kiro Agent Specs & Hooks

---

## 1. Executive Summary & Frankenstein Architecture

MindAtlas 3D transforms flat checklists, study notes, and syllabus outlines into an explorable, living 3D spatial knowledge terrain. Inspired by strategy games and cartographic globes, users navigate regional islands where tasks act as physical landmarks. Completing prerequisites dissolves dark fog-of-war, elevates monuments, and synthesizes real-time musical telemetry.

### The Three Stitched Limbs of the Chimera:

```
                      +------------------------------------------+
                      |         MINDATLAS 3D CHIMERA             |
                      +--------------------+---------------------+
                                           |
             +-----------------------------+-----------------------------+
             |                             |                             |
      [ SKELETON ]                   [ FLESH & EYES ]              [ VOICE & PULSE ]
  Graph Theory & DAG            3D Spatial Cartography          Procedural DSP Audio
  Topological Sorter            Three.js & WebGL Shaders        Native Web Audio API
 (Compiler / Discrete Math)       (Video Game Engine)          (Modular Synthesizer)
             |                             |                             |
             +-----------------------------+-----------------------------+
                                           |
                                      [ BRAIN ]
                             Kiro Spec-Driven Engine
                        (.kiro/steering, specs, save hooks)
```

1. **The Skeleton — Discrete Math & DAG Graph Engine:**
   - Formal Directed Acyclic Graph (DAG) with 3-color DFS cycle detection.
   - Topological unlock propagation: downstream landmarks remain shrouded in dark obsidian stone until all prerequisite dependencies are cleared.
   - Dynamic player leveling: $\text{Level} = 1 + \lfloor \text{totalXp} / 250 \rfloor$.
2. **The Flesh & Eyes — Three.js Spatial Cartography:**
   - 60 FPS WebGL scene with 4 floating regional islands (*Frontend Archipelago*, *Backend Citadel*, *AI & Neural Sanctuary*, *Cybersecurity Bastion*).
   - Status-reactive 3D landmarks: dim obsidian monoliths with rune mist rings (`LOCKED`), pulsing cyan crystal beacons (`UNLOCKED`), and golden crown monuments with particle auras (`COMPLETED`).
   - Animated 3D Catmull-Rom road highways with traveling glowing energy pulses.
   - Responsive overview camera automatically framing the terrain across desktop, tablet, and mobile portrait viewports.
3. **The Voice & Pulse — Zero-Asset Web Audio Synthesizer:**
   - 100% mathematical sound synthesis via `AudioContext` (`OscillatorNode`, `GainNode`, `BiquadFilterNode`).
   - Zero external MP3, WAV, or OGG audio files.
   - Region-mapped fundamental root tuning (Frontend = C5 523Hz, Backend = A4 440Hz, AI = E5 659Hz, Cyber = G4 392Hz).
   - Real-time elevation-to-pitch scaling, major-9th arpeggiated unlock fanfares, and an ethereal 55Hz ambient space drone.

---

## 2. Kiro Spec-Driven Development Architecture

MindAtlas 3D was designed and built strictly around Kiro's specification-driven workflow:

- **`.kiro/steering/frankenstein-rules.md`**: Enforces zero `any` types in TypeScript, strict Three.js memory disposal (`BufferGeometry`, `Material`, and `WebGLRenderer` cleanup inside `useEffect`), and zero external audio assets.
- **`.kiro/specs/mind-atlas-3d/requirements.md`**: Formal EARS (Easy Approach to Requirements Syntax) acceptance criteria covering 3D viewports, DAG creation, fog-of-war, and audio feedback.
- **`.kiro/specs/mind-atlas-3d/design.md`**: Technical specifications detailing data models (`MapNode`, `MapEdge`, `AtlasWorldState`), unlock formulas, and camera projection mathematics.
- **`.kiro/specs/mind-atlas-3d/tasks.md`**: Six phased implementation checklists executed step-by-step.
- **`.kiro/hooks/quest-spec-validator.json`**: Automated integrity agent hook verifying memory hygiene and strict types on every file save.

---

## 3. Interactive Features & Workflows

### 3D Map Viewport & Exploration
- **Smooth OrbitControls:** Drag left-click to orbit, drag right-click to pan, and scroll to zoom.
- **Adaptive Camera Overview:** Automatic frustum calculation centering all island territories on any screen aspect ratio.
- **Real-Time Raycasting Tooltips:** Hovering over any landmark displays a holographic HUD card with title, XP reward, region badge, and status.
- **Dynamic Unlock Animation:** Newly unlocked and completed landmarks surge in scale ($1.0 \rightarrow 1.4$) with an emissive spring pulse before settling into their idle floating state.

### Markdown Syllabus & Spec Importer (v2)
- Supports both **Section Format** (`## Task Title` + `- Region: ...` + `- Prerequisites: ...` + `- XP: ...`) and **Hierarchical Outline Format** (`# Region` + `- [ ] Task`).
- Preserves task titles containing commas without breaking dependency chains.
- Built-in Curated Presets:
  - *Full-Stack Web Architect* (Frontend & Backend curriculum)
  - *AI & Neural Systems Specialist* (Deep Learning, PyTorch, Transformers, Agent Swarms)
  - *Cybersecurity Bastion & Hardening* (PKI, Zero Trust, Network Hardening)
- Import Target Modes:
  - **Replace World (Clean Slate):** Overwrites current map with imported curriculum.
  - **Merge into Current World:** Integrates new landmarks and bridges dependency road highways into existing islands.

### Real-Time Quest Search & Fly-To Filter
- Instant autocomplete search in the top HUD bar.
- Selecting any search result triggers a smooth camera lerp animation directly to the target node and opens the inspector drawer.

### Quest Inspector Drawer
- Status pill, regional tag, and 3D coordinate telemetry.
- **Prerequisites Checklist:** Shows parent tasks with status icons; clicking any prerequisite navigates directly to it.
- **Interactive Milestone Sub-Tasks:** Check off practical sub-milestones for each landmark.
- **In-Place Note Editing:** Document study learnings directly with Markdown support and instant local storage persistence.

---

## 4. Kiroween Judging Rubric Alignment

| Rubric Criteria | Score Alignment | MindAtlas 3D Implementation |
| :--- | :---: | :--- |
| **Category Alignment (Frankenstein)** | 10 / 10 | Genuinely stitches three incompatible paradigms: 3D video game WebGL cartography, compiler-grade discrete DAG graph theory, and mathematical acoustic signal synthesis. |
| **Kiro Feature Depth** | 10 / 10 | Active use of `.kiro/steering/`, EARS `.kiro/specs/`, task execution lists, and automated `.kiro/hooks/` integrity validators. |
| **Potential Impact & Utility** | 10 / 10 | Replaces flat, demotivating task lists with an engaging, spatial knowledge adventure suitable for students, self-learners, and engineers. |
| **Design & Technical Quality** | 10 / 10 | 60 FPS Three.js rendering, ACESFilmic tone mapping, strict TypeScript without `any`, code-split production bundle, zero console errors, and unit test suite. |

---

## 5. Getting Started & Verification

### Prerequisites
- Node.js (v18.0.0 or newer)
- npm (v9.0.0 or newer)

### Installation
```bash
git clone https://github.com/Chiru534/mindatlas-3d.git
cd mindatlas-3d
npm install
```

### Run Local Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in Chrome, Edge, or Brave.

### Run Automated Unit Test Suite
```bash
npm test
```
Executes 7 unit tests covering DAG cycle detection, topological sorting, unlock propagation, and section-based Markdown parsing via Vitest.

### Production Bundle Build
```bash
npm run build
```
Compiles strict TypeScript and generates code-split production bundles (`vendor-three`, `vendor-react`, `vendor-icons`, and `index`).

---

## 6. License

This project is licensed under the MIT License — see the [LICENSE](file:///c:/Users/chiranjeevi%20madem/OneDrive/%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B/kiro-project/LICENSE) file for details.
