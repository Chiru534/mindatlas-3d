import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { MapNode, MapEdge, NodeStatus, Position3D } from '../types/atlas';
import { REGIONS } from '../services/questGraphEngine';
import { playHoverBlip, playSelectTone } from '../services/spatialAudioEngine';
import {
  Compass,
  ZoomIn,
  ZoomOut,
  Lock,
  CheckCircle2,
  Sparkles,
  Layers,
  Box,
} from 'lucide-react';

export interface AtlasCanvas3DProps {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onHoverNode?: (nodeId: string | null) => void;
  onRequestResetCamera?: () => void;
  cameraResetTrigger?: number;
  audioMuted?: boolean;
  isDrawerOpen?: boolean;
  className?: string;
}

interface HoveredTooltipData {
  node: MapNode;
  screenX: number;
  screenY: number;
}

// 3D Ascending Helical Curve for Radiant Astral Sky Beam
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  private radius: number;
  private height: number;
  private turns: number;

  constructor(radius: number, height: number, turns: number) {
    super();
    this.radius = radius;
    this.height = height;
    this.turns = turns;
  }

  getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * this.turns * Math.PI * 2;
    const x = Math.cos(angle) * this.radius;
    const z = Math.sin(angle) * this.radius;
    const y = t * this.height;
    return optionalTarget.set(x, y, z);
  }
}

interface AnimatedLandmark {
  nodeId: string;
  status: NodeStatus;
  region: string;
  group: THREE.Group;
  artifactGroup: THREE.Group;
  crystalMesh?: THREE.Mesh;
  monolithMesh?: THREE.Mesh;
  stasisLasers: THREE.Mesh[];
  stasisBarrier?: THREE.Mesh;
  stasisScanline?: THREE.Mesh;
  mistDome?: THREE.Mesh;
  runicRing1?: THREE.Group | THREE.Mesh;
  runicRing2?: THREE.Group | THREE.Mesh;
  satellites: THREE.Mesh[];
  auraPoints?: THREE.Points;
  sparkBaseY?: Float32Array;
  sparkSpeeds?: Float32Array;
  sparkAngles?: Float32Array;
  crownSpire?: THREE.Mesh;
  crownJewel?: THREE.Mesh;
  skyLaserCore?: THREE.Mesh;
  skyHelicalRibbon?: THREE.Mesh;
  transmutationSealGroup?: THREE.Group;
  transmutationSealMat?: THREE.MeshBasicMaterial;
  decloakGroup?: THREE.Group;
  decloakBarrierMat?: THREE.MeshBasicMaterial;
  decloakNeedleMats?: THREE.MeshBasicMaterial[];
  baseY: number;
  phaseOffset: number;
  baseMaterials: THREE.Material[];
  currentHoverLift: number;
  ringSpeedMult: number;
}

interface PhotonicCometPart {
  mesh: THREE.Mesh;
  trailOffset: number;
}

interface AnimatedPhotonicComet {
  curve: THREE.CatmullRomCurve3;
  parts: PhotonicCometPart[];
  speed: number;
  offset: number;
  edgeId: string;
}

interface AnimatedFogRegion {
  points: THREE.Points;
  center: Position3D;
  speeds: Float32Array;
  angles: Float32Array;
  radii: Float32Array;
  yPositions: Float32Array;
}

interface IslandLevitationData {
  group: THREE.Group;
  phase: number;
  levitationCore: THREE.Mesh;
  orbitRing1: THREE.Mesh;
  orbitRing2: THREE.Mesh;
}

interface ActiveShockwave {
  mesh: THREE.Mesh;
  startTime: number;
  duration: number;
  initialScale: number;
  maxScale: number;
}

interface ActiveCompletionCascade {
  nodeId: string;
  startTime: number;
  duration: number;
}

interface ActiveLaserSurge {
  curve: THREE.CatmullRomCurve3;
  headMesh: THREE.Mesh;
  trailMeshes: THREE.Mesh[];
  startTime: number;
  duration: number;
  edgeId: string;
}

interface DecloakingNode {
  nodeId: string;
  startTime: number;
  duration: number;
}

export const AtlasCanvas3D: React.FC<AtlasCanvas3DProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onHoverNode,
  onRequestResetCamera,
  cameraResetTrigger = 0,
  audioMuted = false,
  isDrawerOpen = false,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Scene Hierarchy Groups
  const islandsGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const fogGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const shockwavesGroupRef = useRef<THREE.Group | null>(null);

  // Animation & Dynamics State
  const interactiveHitboxesRef = useRef<THREE.Mesh[]>([]);
  const animatedLandmarksRef = useRef<AnimatedLandmark[]>([]);
  const animatedCometsRef = useRef<AnimatedPhotonicComet[]>([]);
  const animatedFogRegionsRef = useRef<AnimatedFogRegion[]>([]);
  const islandLevitationsRef = useRef<IslandLevitationData[]>([]);
  const activeShockwavesRef = useRef<ActiveShockwave[]>([]);
  const activeCascadesRef = useRef<ActiveCompletionCascade[]>([]);
  const activeLaserSurgesRef = useRef<ActiveLaserSurge[]>([]);
  const decloakingNodesRef = useRef<Map<string, DecloakingNode>>(new Map());
  const radarSweepMeshRef = useRef<THREE.Mesh | null>(null);

  // Tracking Completed Nodes for Shockwaves & Cascade
  const prevCompletedNodeIdsRef = useRef<Set<string>>(new Set());

  // Camera Lerp State
  const isTransitioningCameraRef = useRef<boolean>(false);
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetControlsLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Mouse & UI State
  const mousePosRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipData | null>(null);
  const [viewMode, setViewMode] = useState<'isometric' | 'perspective' | 'topdown'>('isometric');

  // Shared Raycaster
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Map for fast node lookups
  const nodesMap = useMemo(() => {
    const map = new Map<string, MapNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Active regions list for quick-jump toolbar
  const activeRegionsList = useMemo(() => {
    return Object.entries(REGIONS).filter(([regionName]) =>
      nodes.some((n) => n.region === regionName)
    );
  }, [nodes]);

  // Procedural Volumetric Radial Mist Texture (Smooth falloff, zero square blocks)
  const mistTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const getMistTexture = useCallback((): THREE.CanvasTexture => {
    if (mistTextureRef.current) return mistTextureRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(100, 116, 139, 0.65)');
      gradient.addColorStop(0.4, 'rgba(71, 85, 105, 0.35)');
      gradient.addColorStop(0.8, 'rgba(30, 41, 59, 0.12)');
      gradient.addColorStop(1, 'rgba(2, 4, 10, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    mistTextureRef.current = texture;
    return texture;
  }, []);

  // Procedural Astrolabe Ground Vector Canvas Texture (2048 x 2048)
  const astrolabeTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const getAstrolabeTexture = useCallback((): THREE.CanvasTexture => {
    if (astrolabeTextureRef.current) return astrolabeTextureRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 2048, 2048);
      const cx = 1024;
      const cy = 1024;

      // Concentric Astrolabe Rings
      const ringRadii = [240, 460, 680, 880, 980];
      ringRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(56, 189, 248, 0.45)' : 'rgba(30, 41, 59, 0.6)';
        ctx.lineWidth = idx === 3 ? 3 : 1.5;
        if (idx === 1 || idx === 3) {
          ctx.setLineDash([8, 8]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
      });

      // Azimuth Radial Spokes & Degree Notches every 5 deg & 30 deg
      ctx.setLineDash([]);
      for (let deg = 0; deg < 360; deg += 5) {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const isMajor = deg % 30 === 0;
        const isSemi = deg % 15 === 0 && !isMajor;

        const innerR = isMajor ? 820 : isSemi ? 850 : 865;
        const outerR = 880;

        ctx.beginPath();
        ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.strokeStyle = isMajor
          ? 'rgba(56, 189, 248, 0.85)'
          : isSemi
          ? 'rgba(56, 189, 248, 0.5)'
          : 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = isMajor ? 2.5 : 1;
        ctx.stroke();

        // Degree Labels on major 30 deg ticks
        if (isMajor) {
          const textR = 920;
          const tx = cx + cos * textR;
          const ty = cy + sin * textR;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(rad + Math.PI / 2);
          ctx.font = '600 22px monospace';
          ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${deg}°`, 0, 0);
          ctx.restore();

          // Full Radial Line through center for major axes
          if (deg < 180) {
            ctx.beginPath();
            ctx.moveTo(cx - cos * 880, cy - sin * 880);
            ctx.lineTo(cx + cos * 880, cy + sin * 880);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Sacred Celestial Geometry Arcs & Hexagram in Inner Astrolabe
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a1 = (i * 60 * Math.PI) / 180;
        const a2 = ((i + 2) * 60 * Math.PI) / 180;
        ctx.moveTo(cx + Math.cos(a1) * 460, cy + Math.sin(a1) * 460);
        ctx.lineTo(cx + Math.cos(a2) * 460, cy + Math.sin(a2) * 460);
      }
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cardinal Indicators (N, E, S, W)
      const cardinals = [
        { label: 'N // 000°', angle: -Math.PI / 2 },
        { label: 'E // 090°', angle: 0 },
        { label: 'S // 180°', angle: Math.PI / 2 },
        { label: 'W // 270°', angle: Math.PI },
      ];
      cardinals.forEach(({ label, angle }) => {
        const lx = cx + Math.cos(angle) * 760;
        const ly = cy + Math.sin(angle) * 760;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(angle + Math.PI / 2);
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    astrolabeTextureRef.current = texture;
    return texture;
  }, []);

  // Procedural Holographic Radar Sweep Texture (1024 x 1024)
  const radarSweepTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const getRadarSweepTexture = useCallback((): THREE.CanvasTexture => {
    if (radarSweepTextureRef.current) return radarSweepTextureRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 1024, 1024);
      const cx = 512;
      const cy = 512;
      const radius = 500;

      // Draw angular sweep gradient (60 degree fan)
      const sweepAngle = Math.PI / 3;
      const step = 0.01;
      for (let a = 0; a < sweepAngle; a += step) {
        const factor = a / sweepAngle;
        const alpha = Math.pow(factor, 2.5) * 0.38;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, a - sweepAngle, a - sweepAngle + step + 0.005);
        ctx.closePath();
        ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`;
        ctx.fill();
      }

      // Bright razor-sharp leading edge laser line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 12;
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    radarSweepTextureRef.current = texture;
    return texture;
  }, []);

  // Strict Three.js Memory Hygiene — Recursive Disposal
  const disposeObjectHierarchy = useCallback((obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.Line ||
        child instanceof THREE.LineSegments
      ) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          const disposeMat = (mat: THREE.Material) => {
            if ('map' in mat) {
              const stdMat = mat as THREE.MeshStandardMaterial;
              if (
                stdMat.map &&
                stdMat.map !== mistTextureRef.current &&
                stdMat.map !== astrolabeTextureRef.current &&
                stdMat.map !== radarSweepTextureRef.current
              ) {
                stdMat.map.dispose();
              }
            }
            mat.dispose();
          };

          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              if (mat instanceof THREE.Material) disposeMat(mat);
            });
          } else if (child.material instanceof THREE.Material) {
            disposeMat(child.material);
          }
        }
      } else if (child instanceof THREE.Sprite) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (
            child.material.map &&
            child.material.map !== mistTextureRef.current &&
            child.material.map !== astrolabeTextureRef.current &&
            child.material.map !== radarSweepTextureRef.current
          ) {
            child.material.map.dispose();
          }
          child.material.dispose();
        }
      }
    });
  }, []);

  // Smooth Camera Lerp Trigger with Asymmetric Viewport Offset when Drawer is Open
  const focusCameraOnPosition = useCallback(
    (x: number, y: number, z: number, immediate = false, drawerOpen = false) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      let camX = x + 20;
      let camY = y + 18;
      let camZ = z + 24;

      if (viewMode === 'topdown') {
        camX = x;
        camY = y + 70;
        camZ = z + 0.1;
      } else if (viewMode === 'isometric') {
        camX = x + 24;
        camY = y + 26;
        camZ = z + 24;
      }

      // Calculate horizontal camera right vector for asymmetric drawer framing
      const lookAtTarget = new THREE.Vector3(x, y, z);
      const camPos = new THREE.Vector3(camX, camY, camZ);
      const viewDir = new THREE.Vector3().subVectors(lookAtTarget, camPos).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(viewDir, up).normalize();

      // When drawer is open, add horizontal focal offset to camera target so active node is centered
      // in the unobstructed left 65% of the viewport (shifts target to the right in world space)
      if (drawerOpen) {
        const aspect = camera.aspect || 1.77;
        const horizontalOffset = Math.max(0, Math.min(7.5, (aspect - 0.75) * 6.5));
        lookAtTarget.addScaledVector(right, horizontalOffset);
        camPos.addScaledVector(right, horizontalOffset);
      }

      if (immediate) {
        camera.position.copy(camPos);
        controls.target.copy(lookAtTarget);
        controls.update();
        isTransitioningCameraRef.current = false;
      } else {
        targetCamPosRef.current.copy(camPos);
        targetControlsLookAtRef.current.copy(lookAtTarget);
        isTransitioningCameraRef.current = true;
      }
    },
    [viewMode]
  );

  // Reset Camera to 45-Degree Overview
  const resetCameraToOverview = useCallback(() => {
    targetCamPosRef.current.set(46, 52, 46);
    targetControlsLookAtRef.current.set(0, 0, 0);
    isTransitioningCameraRef.current = true;
    onRequestResetCamera?.();
  }, [onRequestResetCamera]);

  // Handle external camera reset trigger
  useEffect(() => {
    if (cameraResetTrigger > 0) {
      resetCameraToOverview();
    }
  }, [cameraResetTrigger, resetCameraToOverview]);

  // React to selectedNodeId and isDrawerOpen change by focusing camera with asymmetric framing
  useEffect(() => {
    if (!selectedNodeId) return;
    const targetNode = nodesMap.get(selectedNodeId);
    if (targetNode) {
      focusCameraOnPosition(
        targetNode.position.x,
        targetNode.position.y,
        targetNode.position.z,
        false,
        isDrawerOpen
      );
    }
  }, [selectedNodeId, isDrawerOpen, nodesMap, focusCameraOnPosition]);

  // -------------------------------------------------------------
  // 4-STAGE QUEST COMPLETION CASCADE
  // -------------------------------------------------------------
  const triggerQuestCompletionCascade = useCallback(
    (completedNode: MapNode) => {
      const shockwavesGroup = shockwavesGroupRef.current;
      if (!shockwavesGroup) return;

      const { x, y, z } = completedNode.position;
      const now = performance.now() / 1000;

      // Stage 1: Pop (1.45x) & Bloom Flash (4x)
      activeCascadesRef.current.push({
        nodeId: completedNode.id,
        startTime: now,
        duration: 1.4,
      });

      // Stage 2: Golden Shockwave Ring (scale 0.2 -> 24.0)
      const shockGeo = new THREE.RingGeometry(0.5, 1.4, 64);
      shockGeo.rotateX(-Math.PI / 2);
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shockMesh = new THREE.Mesh(shockGeo, shockMat);
      shockMesh.position.set(x, y + 0.38, z);
      shockMesh.scale.set(0.2, 0.2, 0.2);
      shockwavesGroup.add(shockMesh);

      activeShockwavesRef.current.push({
        mesh: shockMesh,
        startTime: now + 0.12,
        duration: 1.35,
        initialScale: 0.2,
        maxScale: 24.0,
      });

      // Stage 3: High-Velocity Conduit Laser Surge along outgoing edges
      const outgoingEdges = edges.filter((e) => e.fromNodeId === completedNode.id);
      outgoingEdges.forEach((edge) => {
        const targetNode = nodesMap.get(edge.toNodeId);
        if (!targetNode) return;

        const pFrom = new THREE.Vector3(x, y + 0.5, z);
        const pTo = new THREE.Vector3(targetNode.position.x, targetNode.position.y + 0.5, targetNode.position.z);
        const dist = pFrom.distanceTo(pTo);
        const pMid = new THREE.Vector3().addVectors(pFrom, pTo).multiplyScalar(0.5);
        pMid.y = Math.max(pFrom.y, pTo.y) + 1.4 + dist * 0.08;
        const surgeCurve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);

        // Laser surge head
        const surgeHeadGeo = new THREE.SphereGeometry(0.42, 12, 12);
        const surgeHeadMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
        });
        const surgeHeadMesh = new THREE.Mesh(surgeHeadGeo, surgeHeadMat);
        surgeHeadMesh.position.copy(pFrom);
        shockwavesGroup.add(surgeHeadMesh);

        // Trailing surge packets
        const trailMeshes: THREE.Mesh[] = [];
        for (let t = 0; t < 3; t++) {
          const trailGeo = new THREE.SphereGeometry(0.32 - t * 0.08, 8, 8);
          const trailMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.8 - t * 0.25,
          });
          const trailMesh = new THREE.Mesh(trailGeo, trailMat);
          shockwavesGroup.add(trailMesh);
          trailMeshes.push(trailMesh);
        }

        activeLaserSurgesRef.current.push({
          curve: surgeCurve,
          headMesh: surgeHeadMesh,
          trailMeshes,
          startTime: now + 0.25,
          duration: 0.85,
          edgeId: edge.id,
        });

        // Stage 4: Trigger child node stasis de-cloak once surge arrives
        decloakingNodesRef.current.set(targetNode.id, {
          nodeId: targetNode.id,
          startTime: now + 0.8,
          duration: 1.5,
        });
      });
    },
    [edges, nodesMap]
  );

  // Monitor nodes to detect new completions and trigger 4-stage cascade
  useEffect(() => {
    const currentCompleted = new Set<string>();
    nodes.forEach((n) => {
      if (n.status === 'COMPLETED') {
        currentCompleted.add(n.id);
        if (
          !prevCompletedNodeIdsRef.current.has(n.id) &&
          prevCompletedNodeIdsRef.current.size > 0
        ) {
          triggerQuestCompletionCascade(n);
        }
      }
    });
    prevCompletedNodeIdsRef.current = currentCompleted;
  }, [nodes, triggerQuestCompletionCascade]);

  // -------------------------------------------------------------
  // 1. Initial Scene Setup: Post-Processing, Lighting & Ground Platform
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene with Deep Obsidian Background and Atmospheric Fog
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x02040a);
    scene.fog = new THREE.FogExp2(0x02040a, 0.0055);

    // 2. Perspective Camera (Cinematic 45-Degree Overview)
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 1000);
    camera.position.set(46, 52, 46);
    cameraRef.current = camera;

    // 3. WebGLRenderer with ACES Filmic Tone Mapping
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 3.5 Calibrated UnrealBloomPass Pipeline (Threshold: 0.78, Strength: 1.35)
    // Ensures dark basalt slate (#070d18) stays razor-sharp and deep black,
    // while true emissives (laser filaments, crystal cores, shockwaves, spires) bloom into radiant brilliance
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.35, // strength: glowing optical radiance
      0.40, // radius: tight, crisp glow halo
      0.78  // threshold: triggers glow only on true high emissives
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 10;
    controls.maxDistance = 220;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const onControlsStart = () => {
      isTransitioningCameraRef.current = false;
    };
    controls.addEventListener('start', onControlsStart);

    // 5. Dual-Tone Cinematic Lighting
    const ambientLight = new THREE.AmbientLight(0x071126, 1.25);
    scene.add(ambientLight);

    // Electric-Cyan Key Directional Light
    const keyDirectionalLight = new THREE.DirectionalLight(0x38bdf8, 2.8);
    keyDirectionalLight.position.set(50, 75, 45);
    scene.add(keyDirectionalLight);

    // Warm Magenta/Rose Rim Backlight (Opposite key light for metallic edge highlights)
    const rimBacklight = new THREE.DirectionalLight(0xf43f5e, 1.8);
    rimBacklight.position.set(-35, -30, -35);
    scene.add(rimBacklight);

    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x02040a, 0.65);
    scene.add(hemiLight);

    // 6. Void & Celestial Astrolabe Ground Platform at Y = -14
    // Polished Obsidian Ground Disc catching specular highlights
    const groundDiscGeo = new THREE.CircleGeometry(160, 64);
    groundDiscGeo.rotateX(-Math.PI / 2);
    const groundDiscMat = new THREE.MeshStandardMaterial({
      color: 0x030712,
      roughness: 0.16,
      metalness: 0.94,
    });
    const groundDisc = new THREE.Mesh(groundDiscGeo, groundDiscMat);
    groundDisc.position.y = -14.0;
    scene.add(groundDisc);

    // Concentric Vector Astrolabe Rings Etched with Degree Ticks and Azimuth Arcs
    const astrolabePlaneGeo = new THREE.PlaneGeometry(320, 320);
    astrolabePlaneGeo.rotateX(-Math.PI / 2);
    const astrolabeMat = new THREE.MeshBasicMaterial({
      map: getAstrolabeTexture(),
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const astrolabePlane = new THREE.Mesh(astrolabePlaneGeo, astrolabeMat);
    astrolabePlane.position.y = -13.92;
    scene.add(astrolabePlane);

    // Rotating 360-Degree Holographic Radar Plane Sweep
    const radarGeo = new THREE.CircleGeometry(150, 64);
    radarGeo.rotateX(-Math.PI / 2);
    const radarMat = new THREE.MeshBasicMaterial({
      map: getRadarSweepTexture(),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const radarMesh = new THREE.Mesh(radarGeo, radarMat);
    radarMesh.position.y = -13.85;
    scene.add(radarMesh);
    radarSweepMeshRef.current = radarMesh;

    // 7. Two-Tier Starfield: Twinkling Matrix (750 particles) + Cosmic Nebula Dust Motes
    // Tier 1: Twinkling Star Matrix
    const starCount = 750;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starPalette = [
      new THREE.Color(0x38bdf8),
      new THREE.Color(0x818cf8),
      new THREE.Color(0xfbbf24),
      new THREE.Color(0xec4899),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < starCount; i++) {
      const radius = 75 + Math.random() * 155;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.max(2, radius * Math.sin(phi) * Math.sin(theta));
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      const color = starPalette[Math.floor(Math.random() * starPalette.length)];
      starColors[i * 3] = color.r;
      starColors[i * 3 + 1] = color.g;
      starColors[i * 3 + 2] = color.b;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);

    // Tier 2: Ethereal Cosmic Nebula Dust Motes with Circular Gaussian Alpha Texture (Zero square pixels)
    const dustCount = 500;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const radius = 30 + Math.random() * 105;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      dustPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      dustPositions[i * 3 + 1] = Math.max(-8, radius * Math.sin(phi) * Math.sin(theta));
      dustPositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      map: getMistTexture(),
      color: 0x22d3ee,
      size: 3.2,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // 8. Container Sub-Groups
    const islandsGroup = new THREE.Group();
    islandsGroupRef.current = islandsGroup;
    scene.add(islandsGroup);

    const roadsGroup = new THREE.Group();
    roadsGroupRef.current = roadsGroup;
    scene.add(roadsGroup);

    const fogGroup = new THREE.Group();
    fogGroupRef.current = fogGroup;
    scene.add(fogGroup);

    const selectionGroup = new THREE.Group();
    selectionGroupRef.current = selectionGroup;
    scene.add(selectionGroup);

    const shockwavesGroup = new THREE.Group();
    shockwavesGroupRef.current = shockwavesGroup;
    scene.add(shockwavesGroup);

    // 9. Resize Listener
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      if (composerRef.current) {
        composerRef.current.setSize(newWidth, newHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    // 10. Animation Loop
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const delta = clock.getDelta();
      const nowSec = performance.now() / 1000;

      // Controls damping update
      controls.update();

      // Smooth Camera Lerp
      if (isTransitioningCameraRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.08);
        controls.target.lerp(targetControlsLookAtRef.current, 0.08);

        if (
          camera.position.distanceTo(targetCamPosRef.current) < 0.08 &&
          controls.target.distanceTo(targetControlsLookAtRef.current) < 0.08
        ) {
          camera.position.copy(targetCamPosRef.current);
          controls.target.copy(targetControlsLookAtRef.current);
          isTransitioningCameraRef.current = false;
        }
      }

      // Rotate cosmic starfield and holographic radar sweep
      starPoints.rotation.y = elapsedTime * 0.012;
      dustPoints.rotation.y = -elapsedTime * 0.018;
      if (radarSweepMeshRef.current) {
        radarSweepMeshRef.current.rotation.y = -elapsedTime * 0.38;
      }

      // Synchronized Motion Hierarchy: Levitating Basalt Sanctuaries, Keels & Plinths
      const levitationY = Math.sin(elapsedTime * 0.65) * 0.32;
      islandLevitationsRef.current.forEach(({ group, levitationCore, orbitRing1, orbitRing2 }) => {
        // Identical levitation phase clock: synchronizes all islands, plinths, and landmarks
        group.position.y = levitationY;

        // Anti-gravity spinning singularity crystal
        levitationCore.rotation.y = elapsedTime * 1.5;
        levitationCore.rotation.x = Math.sin(elapsedTime * 0.9) * 0.25;

        // Dual counter-rotating orbit gimbal rings
        orbitRing1.rotation.z = elapsedTime * 0.55;
        orbitRing2.rotation.z = -elapsedTime * 0.45;
      });

      // Synchronize roads (conduits), selection reticle, and shockwaves to identical levitation phase
      if (roadsGroupRef.current) {
        roadsGroupRef.current.position.y = levitationY;
      }
      if (selectionGroupRef.current) {
        selectionGroupRef.current.position.y = levitationY;
      }
      if (shockwavesGroupRef.current) {
        shockwavesGroupRef.current.position.y = levitationY;
      }

      // Animate Landmark Meshes & Status Interactions
      const hoveredId = hoveredNodeIdRef.current;
      animatedLandmarksRef.current.forEach((landmark) => {
        const {
          nodeId,
          status,
          artifactGroup,
          crystalMesh,
          monolithMesh,
          stasisLasers,
          stasisBarrier,
          stasisScanline,
          mistDome,
          runicRing1,
          runicRing2,
          satellites,
          auraPoints,
          sparkBaseY,
          sparkSpeeds,
          sparkAngles,
          crownSpire,
          crownJewel,
          skyLaserCore,
          skyHelicalRibbon,
          transmutationSealGroup,
          transmutationSealMat,
          decloakGroup,
          decloakBarrierMat,
          decloakNeedleMats,
          phaseOffset,
          baseMaterials,
        } = landmark;

        const isHovered = nodeId === hoveredId;

        // Check 4-Stage Completion Cascade Pop & Bloom Flash (Stage 1)
        let springScale = 1.0;
        let emissiveMultiplier = 1.0;
        const cascadeIdx = activeCascadesRef.current.findIndex((c) => c.nodeId === nodeId);

        if (cascadeIdx >= 0) {
          const cascade = activeCascadesRef.current[cascadeIdx];
          const elapsedCascade = nowSec - cascade.startTime;
          const p = elapsedCascade / cascade.duration;

          if (p >= 1.0) {
            activeCascadesRef.current.splice(cascadeIdx, 1);
          } else {
            // Stage 1: Elastic pop (1.0 -> 1.45x) + 4x bloom flash
            if (p < 0.25) {
              springScale = 1.0 + (p / 0.25) * 0.45;
            } else {
              springScale = 1.0 + 0.45 * Math.exp(-p * 4.5) * Math.cos((p - 0.25) * 14);
            }
            emissiveMultiplier = 1.0 + 3.0 * Math.exp(-p * 3.5);
          }
        }

        // Apply scale & bloom flash
        artifactGroup.scale.set(springScale, springScale, springScale);

        if (emissiveMultiplier > 1.0) {
          baseMaterials.forEach((mat) => {
            if ('emissiveIntensity' in mat) {
              const standardMat = mat as THREE.MeshStandardMaterial;
              standardMat.emissiveIntensity = 1.25 * emissiveMultiplier;
            }
          });
        }

        // UNLOCKED: Resonant Astrolabe & Quantum Prismatic Core
        if (status === 'UNLOCKED') {
          // Check Stage 4 Child Node Stasis De-Cloak
          const decloak = decloakingNodesRef.current.get(nodeId);
          if (decloak) {
            const elapsedDecloak = nowSec - decloak.startTime;
            if (elapsedDecloak < 0) {
              // Laser surge still en route: keep stasis active, hide core
              if (decloakGroup) decloakGroup.visible = true;
              if (crystalMesh) crystalMesh.visible = false;
              if (runicRing1) runicRing1.visible = false;
              if (runicRing2) runicRing2.visible = false;
              satellites.forEach((sat) => (sat.visible = false));
            } else {
              const p = elapsedDecloak / decloak.duration;
              if (p >= 1.0) {
                decloakingNodesRef.current.delete(nodeId);
                if (decloakGroup) decloakGroup.visible = false;
                if (crystalMesh) {
                  crystalMesh.visible = true;
                  crystalMesh.scale.set(1, 1, 1);
                }
                if (runicRing1) runicRing1.visible = true;
                if (runicRing2) runicRing2.visible = true;
                satellites.forEach((sat) => (sat.visible = true));
              } else {
                // Shattering & dissolving ruby stasis barrier
                if (decloakGroup) {
                  decloakGroup.visible = true;
                  const dissolveScale = 1.0 + p * 0.35;
                  decloakGroup.scale.set(dissolveScale, dissolveScale, dissolveScale);
                  if (decloakBarrierMat) {
                    decloakBarrierMat.opacity = 0.85 * (1.0 - p);
                  }
                  decloakNeedleMats?.forEach((mat) => {
                    mat.opacity = 0.9 * (1.0 - p);
                  });
                }
                // Crystal core materializes with bloom flash
                if (crystalMesh) {
                  crystalMesh.visible = true;
                  const crystalScale = Math.min(1.0, 0.2 + p * 0.85);
                  crystalMesh.scale.set(crystalScale, crystalScale, crystalScale);
                  const mat = crystalMesh.material as THREE.MeshPhysicalMaterial;
                  if (mat && 'emissiveIntensity' in mat) {
                    mat.emissiveIntensity = 1.35 + (1.0 - p) * 3.5;
                  }
                }
                if (runicRing1) runicRing1.visible = true;
                if (runicRing2) runicRing2.visible = true;
                satellites.forEach((sat) => (sat.visible = p > 0.4));
              }
            }
          } else {
            // Normal unlocked visibility
            if (decloakGroup) decloakGroup.visible = false;
            if (crystalMesh) crystalMesh.visible = true;
            if (runicRing1) runicRing1.visible = true;
            if (runicRing2) runicRing2.visible = true;
            satellites.forEach((sat) => (sat.visible = true));
          }

          // On hover: +0.6 Y magnetic lift, 2.5x ring acceleration
          const targetLift = isHovered ? 0.6 : 0.0;
          landmark.currentHoverLift += (targetLift - landmark.currentHoverLift) * 0.14;
          artifactGroup.position.y = landmark.currentHoverLift;

          const targetRingMult = isHovered ? 2.5 : 1.0;
          landmark.ringSpeedMult += (targetRingMult - landmark.ringSpeedMult) * 0.12;
          const currentRingSpeed = landmark.ringSpeedMult;

          // Levitating optical crystal prism with breathing heartbeat
          if (crystalMesh && (!decloak || nowSec - decloak.startTime >= decloak.duration)) {
            const heartbeat = 1.0 + Math.pow(Math.sin(elapsedTime * 3.0 + phaseOffset), 3) * 0.08;
            crystalMesh.scale.set(heartbeat, heartbeat, heartbeat);
            crystalMesh.rotation.y = elapsedTime * 1.5;
            crystalMesh.rotation.x = Math.sin(elapsedTime * 1.2) * 0.18;

            const mat = crystalMesh.material as THREE.MeshPhysicalMaterial;
            if (mat && 'emissiveIntensity' in mat) {
              mat.emissiveIntensity =
                (1.35 + Math.sin(elapsedTime * 3.5 + phaseOffset) * 0.45) * emissiveMultiplier;
            }
          }

          // Dual gyroscopic astrolabe gimbal rings with degree notches
          if (runicRing1) {
            runicRing1.rotation.y = elapsedTime * 1.4 * currentRingSpeed;
            runicRing1.rotation.x = (22 * Math.PI) / 180 + Math.sin(elapsedTime * 0.8) * 0.2;
          }
          if (runicRing2) {
            runicRing2.rotation.y = -elapsedTime * 1.1 * currentRingSpeed;
            runicRing2.rotation.z = (15 * Math.PI) / 180 + Math.cos(elapsedTime * 0.9) * 0.2;
          }

          // 4 Keplerian diamond satellites orbiting on tilted planes
          satellites.forEach((sat, sIdx) => {
            const angle = elapsedTime * 1.4 * currentRingSpeed + (sIdx * Math.PI) / 2;
            const r = 2.45;
            const tilt = sIdx % 2 === 0 ? 0.38 : -0.38;
            sat.position.set(
              Math.cos(angle) * r,
              2.2 + Math.sin(angle) * r * tilt,
              Math.sin(angle) * r
            );
            sat.rotation.y = elapsedTime * 3.5;
            sat.rotation.x = elapsedTime * 2.0;
          });
        }

        // COMPLETED: Radiant Celestial Spire & Astral Light Column
        if (status === 'COMPLETED') {
          if (crownSpire) {
            crownSpire.rotation.y = -elapsedTime * 0.75;
          }

          if (crownJewel) {
            crownJewel.rotation.y = elapsedTime * 1.6;
            crownJewel.rotation.x = Math.sin(elapsedTime * 1.4) * 0.25;
          }

          // Animate etched transmutation seal on plinth stone
          if (transmutationSealGroup) {
            transmutationSealGroup.rotation.y = elapsedTime * 0.22;
          }
          if (transmutationSealMat) {
            transmutationSealMat.opacity = 0.75 + Math.sin(elapsedTime * 2.5) * 0.2;
          }

          // 48 Ascending Golden Ember Sparks along helical funnel
          if (auraPoints && sparkBaseY && sparkSpeeds && sparkAngles) {
            const positions = auraPoints.geometry.attributes.position as THREE.BufferAttribute;
            const count = sparkBaseY.length;

            for (let p = 0; p < count; p++) {
              sparkBaseY[p] = (sparkBaseY[p] + delta * sparkSpeeds[p]) % 12.0;
              sparkAngles[p] += delta * 1.8;
              const y = 0.5 + sparkBaseY[p];
              const r = 1.35 * Math.max(0.2, 1.0 - y / 14.0);
              const x = Math.cos(sparkAngles[p]) * r;
              const z = Math.sin(sparkAngles[p]) * r;
              positions.setXYZ(p, x, y, z);
            }
            positions.needsUpdate = true;
          }

          // Dual-layer ascending sky beam
          if (skyLaserCore) {
            const mat = skyLaserCore.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.82 + Math.sin(elapsedTime * 4.0) * 0.12;
          }

          // 3D Outer Helical Ribbon visually streams upward into the cosmos
          if (skyHelicalRibbon) {
            skyHelicalRibbon.rotation.y = elapsedTime * 1.25;
            const mat = skyHelicalRibbon.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.55 + Math.sin(elapsedTime * 3.0) * 0.15;
          }
        }

        // LOCKED: Cryo-Stasis Sarcophagus with Ruby Stasis Beams & Scanline
        if (status === 'LOCKED') {
          // Crimson warning pulse on hover
          const warningPulseSpeed = isHovered ? 8.0 : 1.8;
          const warningIntensity = isHovered
            ? 0.75 + Math.sin(elapsedTime * warningPulseSpeed) * 0.25
            : 0.25 + Math.sin(elapsedTime * warningPulseSpeed) * 0.12;

          if (monolithMesh) {
            const mat = monolithMesh.material as THREE.MeshStandardMaterial;
            if (isHovered) {
              mat.emissive.setHex(0xef4444);
              mat.emissiveIntensity = warningIntensity * 1.5;
            } else {
              mat.emissive.setHex(0x03050a);
              mat.emissiveIntensity = 0.2;
            }
          }

          // 6 Vertical Laser Needles
          stasisLasers.forEach((laser) => {
            const mat = laser.material as THREE.MeshBasicMaterial;
            mat.opacity = isHovered ? 0.95 : 0.65;
            if (isHovered) {
              mat.color.setHex(0xff0033);
            } else {
              mat.color.setHex(0xff1e42);
            }
          });

          // Ascending Scanline Stasis Barrier
          if (stasisBarrier) {
            const mat = stasisBarrier.material as THREE.MeshBasicMaterial;
            mat.opacity = warningIntensity * 0.85;
          }

          if (stasisScanline) {
            stasisScanline.position.y = 0.35 + ((elapsedTime * 2.2 + phaseOffset) % 3.4);
            const mat = stasisScanline.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.65 + Math.sin(elapsedTime * 6.0) * 0.25;
          }

          if (mistDome) {
            mistDome.rotation.y = elapsedTime * 0.2;
            mistDome.position.y = 0.2 + Math.sin(elapsedTime * 1.5) * 0.06;
          }
        }
      });

      // Animate Living Optical Waveguide Highways & Photonic Comets with Light Trails
      animatedCometsRef.current.forEach((comet) => {
        const tHead = (elapsedTime * comet.speed + comet.offset) % 1.0;

        comet.parts.forEach((part) => {
          const rawT = tHead - part.trailOffset;
          // Clamp tail: avoid circular modulo wrap across disjoint curve ends
          if (rawT < 0 || rawT > 1.0) {
            part.mesh.visible = false;
          } else {
            part.mesh.visible = true;
            const pt = comet.curve.getPointAt(rawT);
            part.mesh.position.copy(pt);
          }
        });
      });

      // Animate High-Velocity Conduit Laser Surges (Stage 3 of cascade)
      const survivingSurges: ActiveLaserSurge[] = [];
      activeLaserSurgesRef.current.forEach((surge) => {
        const elapsed = nowSec - surge.startTime;
        const p = elapsed / surge.duration;

        if (p < 0) {
          survivingSurges.push(surge);
        } else if (p < 1.0) {
          const pt = surge.curve.getPointAt(p);
          surge.headMesh.position.copy(pt);

          surge.trailMeshes.forEach((trail, tIdx) => {
            const tTrail = Math.max(0, p - (tIdx + 1) * 0.04);
            trail.position.copy(surge.curve.getPointAt(tTrail));
          });
          survivingSurges.push(surge);
        } else {
          // Dispose surge meshes
          if (shockwavesGroupRef.current) {
            shockwavesGroupRef.current.remove(surge.headMesh);
            surge.trailMeshes.forEach((tm) => shockwavesGroupRef.current?.remove(tm));
          }
          surge.headMesh.geometry.dispose();
          if (surge.headMesh.material instanceof THREE.Material) surge.headMesh.material.dispose();
          surge.trailMeshes.forEach((tm) => {
            tm.geometry.dispose();
            if (tm.material instanceof THREE.Material) tm.material.dispose();
          });
        }
      });
      activeLaserSurgesRef.current = survivingSurges;

      // Animate Active Shockwaves (Scale 0.2 -> 24.0, opacity 0.95 -> 0.0)
      const survivingShockwaves: ActiveShockwave[] = [];
      activeShockwavesRef.current.forEach((sw) => {
        const elapsed = nowSec - sw.startTime;
        const p = elapsed / sw.duration;

        if (p < 0) {
          survivingShockwaves.push(sw);
        } else if (p < 1.0) {
          const currentScale = sw.initialScale + p * (sw.maxScale - sw.initialScale);
          sw.mesh.scale.set(currentScale, currentScale, currentScale);
          const mat = sw.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.95 * (1.0 - Math.pow(p, 1.8));
          survivingShockwaves.push(sw);
        } else {
          if (shockwavesGroupRef.current) {
            shockwavesGroupRef.current.remove(sw.mesh);
          }
          sw.mesh.geometry.dispose();
          if (sw.mesh.material instanceof THREE.Material) {
            sw.mesh.material.dispose();
          }
        }
      });
      activeShockwavesRef.current = survivingShockwaves;

      // Animate Fog-of-War Particles over Locked Territories
      animatedFogRegionsRef.current.forEach((fog) => {
        const positions = fog.points.geometry.attributes.position as THREE.BufferAttribute;
        const count = fog.speeds.length;

        for (let i = 0; i < count; i++) {
          fog.angles[i] += fog.speeds[i];
          const x = fog.center.x + Math.cos(fog.angles[i]) * fog.radii[i];
          const z = fog.center.z + Math.sin(fog.angles[i]) * fog.radii[i];
          const y = fog.yPositions[i] + Math.sin(elapsedTime * 1.2 + i) * 0.35;

          positions.setXYZ(i, x, y, z);
        }
        positions.needsUpdate = true;
      });

      // Animate Active Selection Reticle
      if (selectionGroupRef.current && selectionGroupRef.current.children.length > 0) {
        selectionGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.name === 'ring1') child.rotation.z = elapsedTime * 1.8;
            if (child.name === 'ring2') child.rotation.z = -elapsedTime * 1.4;
            if (child.name === 'beam') {
              const mat = child.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.35 + Math.sin(elapsedTime * 4.5) * 0.15;
            }
          }
        });
      }

      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // 11. Cleanup Lifecycle on Unmount
    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();

      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
      }

      if (mistTextureRef.current) {
        mistTextureRef.current.dispose();
        mistTextureRef.current = null;
      }
      if (astrolabeTextureRef.current) {
        astrolabeTextureRef.current.dispose();
        astrolabeTextureRef.current = null;
      }
      if (radarSweepTextureRef.current) {
        radarSweepTextureRef.current.dispose();
        radarSweepTextureRef.current = null;
      }

      disposeObjectHierarchy(scene);
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [disposeObjectHierarchy, getMistTexture, getAstrolabeTexture, getRadarSweepTexture]);

  // -------------------------------------------------------------
  // 2. Build Stepped Hexagonal Basalt Sanctuaries & Node Plinths
  // -------------------------------------------------------------
  useEffect(() => {
    const islandsGroup = islandsGroupRef.current;
    if (!islandsGroup) return;

    disposeObjectHierarchy(islandsGroup);
    while (islandsGroup.children.length > 0) {
      islandsGroup.remove(islandsGroup.children[0]);
    }
    islandLevitationsRef.current = [];
    interactiveHitboxesRef.current = [];
    animatedLandmarksRef.current = [];

    const mistTexture = getMistTexture();

    const regionNamesSet = new Set<string>();
    nodes.forEach((n) => regionNamesSet.add(n.region));
    Object.keys(REGIONS).forEach((reg) => regionNamesSet.add(reg));

    let regionIndex = 0;
    regionNamesSet.forEach((regionName) => {
      const theme = REGIONS[regionName] || {
        name: regionName,
        color: '#06b6d4',
        emissiveColor: '#22d3ee',
        center: {
          x: Math.cos((regionIndex * Math.PI) / 2) * 35,
          y: 0,
          z: Math.sin((regionIndex * Math.PI) / 2) * 35,
        },
        description: 'Custom Study Region',
        islandRadius: 20,
      };

      const islandGroup = new THREE.Group();
      islandGroup.position.set(theme.center.x, theme.center.y, theme.center.z);

      const radius = theme.islandRadius;
      const themeColor = new THREE.Color(theme.color);
      const basaltColor = 0x070d18;

      // Dark obsidian slate basalt material (#070d18, roughness 0.35, metalness 0.85)
      const basaltMat = new THREE.MeshStandardMaterial({
        color: basaltColor,
        roughness: 0.35,
        metalness: 0.85,
      });

      // 1. Central Stepped Hexagonal Basalt Column
      const centerColGeo = new THREE.CylinderGeometry(radius * 0.52, radius * 0.56, 3.8, 6);
      const centerColMesh = new THREE.Mesh(centerColGeo, basaltMat);
      centerColMesh.position.y = 0;
      islandGroup.add(centerColMesh);

      // Glowing top rim of center column in region color
      const centerRimGeo = new THREE.RingGeometry(radius * 0.48, radius * 0.52, 6);
      centerRimGeo.rotateX(-Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 1.8,
        side: THREE.DoubleSide,
      });
      const centerRimMesh = new THREE.Mesh(centerRimGeo, rimMat);
      centerRimMesh.position.y = 1.91;
      islandGroup.add(centerRimMesh);

      // 2. Tier 1: 6 Surrounding Hexagonal Basalt Columns with Stepped Heights
      const tier1Dist = radius * 0.54;
      const tier1Heights = [3.4, 4.2, 3.6, 4.0, 3.2, 3.8];
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + Math.PI / 6;
        const colH = tier1Heights[i];
        const colR = radius * 0.32;
        const colGeo = new THREE.CylinderGeometry(colR * 0.95, colR, colH, 6);
        const colMesh = new THREE.Mesh(colGeo, basaltMat);
        const cx = Math.cos(angle) * tier1Dist;
        const cz = Math.sin(angle) * tier1Dist;
        colMesh.position.set(cx, (colH - 3.8) / 2, cz);
        islandGroup.add(colMesh);

        // Stepped column glowing rim
        const colRimGeo = new THREE.RingGeometry(colR * 0.88, colR * 0.95, 6);
        colRimGeo.rotateX(-Math.PI / 2);
        const colRimMesh = new THREE.Mesh(colRimGeo, rimMat);
        colRimMesh.position.set(cx, colMesh.position.y + colH / 2 + 0.01, cz);
        islandGroup.add(colRimMesh);
      }

      // 3. Tier 2: 6 Outer Lower Hexagonal Terraces
      const tier2Dist = radius * 0.86;
      const tier2Heights = [2.2, 2.7, 2.1, 2.8, 2.3, 2.5];
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const colH = tier2Heights[i];
        const colR = radius * 0.28;
        const colGeo = new THREE.CylinderGeometry(colR * 0.92, colR, colH, 6);
        const colMesh = new THREE.Mesh(colGeo, basaltMat);
        const cx = Math.cos(angle) * tier2Dist;
        const cz = Math.sin(angle) * tier2Dist;
        colMesh.position.set(cx, (colH - 3.8) / 2 - 0.5, cz);
        islandGroup.add(colMesh);
      }

      // 4. Inverted Hexagonal Keel beneath the sanctuary
      const upperKeelGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.35, 4.0, 6);
      upperKeelGeo.rotateX(Math.PI);
      const keelMat = new THREE.MeshStandardMaterial({
        color: 0x050811,
        roughness: 0.75,
        metalness: 0.3,
      });
      const upperKeelMesh = new THREE.Mesh(upperKeelGeo, keelMat);
      upperKeelMesh.position.y = -3.8;
      islandGroup.add(upperKeelMesh);

      const lowerKeelGeo = new THREE.ConeGeometry(radius * 0.35, 4.5, 6);
      lowerKeelGeo.rotateX(Math.PI);
      const lowerKeelMesh = new THREE.Mesh(lowerKeelGeo, keelMat);
      lowerKeelMesh.position.y = -6.8;
      islandGroup.add(lowerKeelMesh);

      // 5. Anti-Gravity Spinning Singularity Crystal at Y = -7.8
      const singularityGeo = new THREE.OctahedronGeometry(2.2, 0);
      const singularityMat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 3.2,
        metalness: 0.4,
        roughness: 0.15,
      });
      const singularityMesh = new THREE.Mesh(singularityGeo, singularityMat);
      singularityMesh.position.y = -7.8;
      islandGroup.add(singularityMesh);

      // 6. Dual Counter-Rotating Keel Gimbal Rings
      const orbit1Geo = new THREE.TorusGeometry(radius * 1.1, 0.08, 16, 48);
      orbit1Geo.rotateX((15 * Math.PI) / 180);
      const orbit1Mat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.6,
      });
      const orbitRing1 = new THREE.Mesh(orbit1Geo, orbit1Mat);
      orbitRing1.position.y = 0.4;
      islandGroup.add(orbitRing1);

      const orbit2Geo = new THREE.TorusGeometry(radius * 1.22, 0.06, 16, 48);
      orbit2Geo.rotateZ((-15 * Math.PI) / 180);
      const orbit2Mat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.5,
      });
      const orbitRing2 = new THREE.Mesh(orbit2Geo, orbit2Mat);
      orbitRing2.position.y = 0.2;
      islandGroup.add(orbitRing2);

      // 7. Deep Colored Regional Under-Lighting PointLight
      const underPointLight = new THREE.PointLight(themeColor, 85, 60, 2);
      underPointLight.position.set(0, -6.5, 0);
      islandGroup.add(underPointLight);

      // Upper Surface PointLight
      const upperPointLight = new THREE.PointLight(themeColor, 38, 45, 2);
      upperPointLight.position.set(0, 5.0, 0);
      islandGroup.add(upperPointLight);

      // 8. Regional 3D Floating Title Label Sprite
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = 'rgba(2, 4, 10, 0.85)';
        ctx.strokeStyle = theme.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(16, 16, 480, 96, 20);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = theme.color;
        ctx.shadowBlur = 14;
        ctx.fillText(theme.name.toUpperCase(), 256, 64);
      }

      const spriteTexture = new THREE.CanvasTexture(canvas);
      spriteTexture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({
        map: spriteTexture,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(15, 3.75, 1);
      sprite.position.set(0, 8.5, 0);
      islandGroup.add(sprite);

      // 9. Node Plinths & Reimagined Status Landmarks for nodes in this region
      const regionNodes = nodes.filter((n) => n.region === regionName);
      regionNodes.forEach((node, nodeIdx) => {
        const localX = node.position.x - theme.center.x;
        const localY = node.position.y - theme.center.y;
        const localZ = node.position.z - theme.center.z;

        // Grounded Hexagonal Plinth Column extending into the bedrock
        // Permanently eliminates floating/clipping disjoints
        const plinthHeight = Math.max(3.2, localY + 2.2);
        const plinthGeo = new THREE.CylinderGeometry(1.65, 1.85, plinthHeight, 6);
        const plinthMesh = new THREE.Mesh(plinthGeo, basaltMat);
        plinthMesh.position.set(localX, localY - plinthHeight / 2 + 0.18, localZ);
        islandGroup.add(plinthMesh);

        // Plinth Altar Capital Disc
        const capitalGeo = new THREE.CylinderGeometry(1.75, 1.65, 0.35, 6);
        const capitalMesh = new THREE.Mesh(capitalGeo, basaltMat);
        capitalMesh.position.set(localX, localY + 0.18, localZ);
        islandGroup.add(capitalMesh);

        // Etched Hexagonal Neon Rim on Plinth Surface
        const plinthRimGeo = new THREE.RingGeometry(1.35, 1.55, 6);
        plinthRimGeo.rotateX(-Math.PI / 2);
        const plinthRimMat = new THREE.MeshStandardMaterial({
          color: node.status === 'COMPLETED' ? 0xfbbf24 : node.status === 'UNLOCKED' ? 0x00f5ff : 0xf43f5e,
          emissive: node.status === 'COMPLETED' ? 0xf59e0b : node.status === 'UNLOCKED' ? 0x06b6d4 : 0xef4444,
          emissiveIntensity: 1.8,
          side: THREE.DoubleSide,
        });
        const plinthRimMesh = new THREE.Mesh(plinthRimGeo, plinthRimMat);
        plinthRimMesh.position.set(localX, localY + 0.36, localZ);
        islandGroup.add(plinthRimMesh);

        // Landmark Group anchored at plinth top
        const landmarkGroup = new THREE.Group();
        landmarkGroup.position.set(localX, localY + 0.36, localZ);
        landmarkGroup.name = `landmark-${node.id}`;
        islandGroup.add(landmarkGroup);

        // Invisible Raycast Hitbox
        const hitboxGeo = new THREE.BoxGeometry(3.4, 5.8, 3.4);
        const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
        hitbox.position.y = 2.2;
        hitbox.userData = { nodeId: node.id };
        landmarkGroup.add(hitbox);
        interactiveHitboxesRef.current.push(hitbox);

        // Artifact Group (Handles hover magnetic lift +0.6 Y)
        const artifactGroup = new THREE.Group();
        landmarkGroup.add(artifactGroup);

        const baseMaterials: THREE.Material[] = [plinthRimMat];
        let crystalMesh: THREE.Mesh | undefined;
        let monolithMesh: THREE.Mesh | undefined;
        const stasisLasers: THREE.Mesh[] = [];
        let stasisBarrier: THREE.Mesh | undefined;
        let stasisScanline: THREE.Mesh | undefined;
        let mistDome: THREE.Mesh | undefined;
        let runicRing1: THREE.Group | THREE.Mesh | undefined;
        let runicRing2: THREE.Group | THREE.Mesh | undefined;
        const satellites: THREE.Mesh[] = [];
        let auraPoints: THREE.Points | undefined;
        let sparkBaseY: Float32Array | undefined;
        let sparkSpeeds: Float32Array | undefined;
        let sparkAngles: Float32Array | undefined;
        let crownSpire: THREE.Mesh | undefined;
        let crownJewel: THREE.Mesh | undefined;
        let skyLaserCore: THREE.Mesh | undefined;
        let skyHelicalRibbon: THREE.Mesh | undefined;
        let transmutationSealGroup: THREE.Group | undefined;
        let transmutationSealMat: THREE.MeshBasicMaterial | undefined;
        let decloakGroup: THREE.Group | undefined;
        let decloakBarrierMat: THREE.MeshBasicMaterial | undefined;
        let decloakNeedleMats: THREE.MeshBasicMaterial[] | undefined;

        // ============================================================
        // STATUS 1: LOCKED — "Cryo-Stasis Sarcophagus"
        // ============================================================
        if (node.status === 'LOCKED') {
          // Tapered hexagonal obsidian monolith (#050811, metalness 0.95, roughness 0.12)
          const monolithGeo = new THREE.CylinderGeometry(0.72, 1.02, 3.4, 6);
          const monolithMat = new THREE.MeshStandardMaterial({
            color: 0x050811,
            metalness: 0.95,
            roughness: 0.12,
            emissive: 0x03050a,
          });
          monolithMesh = new THREE.Mesh(monolithGeo, monolithMat);
          monolithMesh.position.y = 1.7;
          artifactGroup.add(monolithMesh);
          baseMaterials.push(monolithMat);

          // 6 Vertical Laser Needles precisely at plinth vertices with ruby stasis laser beams
          const laserRadius = 1.65;
          for (let k = 0; k < 6; k++) {
            const angle = (k * Math.PI) / 3 + Math.PI / 6;
            const lx = Math.cos(angle) * laserRadius;
            const lz = Math.sin(angle) * laserRadius;

            // Needle emitter base
            const needleGeo = new THREE.CylinderGeometry(0.06, 0.12, 0.35, 6);
            const needleMesh = new THREE.Mesh(needleGeo, basaltMat);
            needleMesh.position.set(lx, 0.18, lz);
            artifactGroup.add(needleMesh);

            // Ruby stasis laser beam
            const beamGeo = new THREE.CylinderGeometry(0.024, 0.024, 3.5, 8);
            const beamMat = new THREE.MeshBasicMaterial({
              color: 0xff1e42,
              transparent: true,
              opacity: 0.85,
            });
            const beamMesh = new THREE.Mesh(beamGeo, beamMat);
            beamMesh.position.set(lx, 1.95, lz);
            artifactGroup.add(beamMesh);
            stasisLasers.push(beamMesh);
          }

          // Ascending scanline stasis barrier sleeve (smooth 32-segment cylinder encased within needles)
          const barrierGeo = new THREE.CylinderGeometry(1.40, 1.40, 3.5, 32, 1, true);
          const barrierMat = new THREE.MeshBasicMaterial({
            color: 0xf43f5e,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          stasisBarrier = new THREE.Mesh(barrierGeo, barrierMat);
          stasisBarrier.position.y = 1.75;
          artifactGroup.add(stasisBarrier);

          // Scanline ring that travels upwards continuously
          const scanlineGeo = new THREE.RingGeometry(1.22, 1.44, 32);
          scanlineGeo.rotateX(-Math.PI / 2);
          const scanlineMat = new THREE.MeshBasicMaterial({
            color: 0xff4d6d,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          stasisScanline = new THREE.Mesh(scanlineGeo, scanlineMat);
          stasisScanline.position.y = 0.5;
          artifactGroup.add(stasisScanline);

          // Soft Volumetric Mist Dome (Radial Gaussian alpha texture)
          const domeGeo = new THREE.SphereGeometry(2.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
          const domeMat = new THREE.MeshBasicMaterial({
            map: mistTexture,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          mistDome = new THREE.Mesh(domeGeo, domeMat);
          mistDome.position.y = 0.2;
          artifactGroup.add(mistDome);
        }

        // ============================================================
        // STATUS 2: UNLOCKED — "Resonant Astrolabe & Quantum Prismatic Core"
        // ============================================================
        if (node.status === 'UNLOCKED') {
          // Levitating optical crystal prism with high specular clearcoat
          const crystalGeo = new THREE.OctahedronGeometry(1.15, 0);
          const crystalMat = new THREE.MeshPhysicalMaterial({
            color: 0x00f5ff,
            emissive: 0x0284c7,
            emissiveIntensity: 1.35,
            roughness: 0.05,
            metalness: 0.25,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06,
            transmission: 0.45,
            transparent: true,
            opacity: 0.95,
          });
          crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
          crystalMesh.position.y = 2.2;
          artifactGroup.add(crystalMesh);
          baseMaterials.push(crystalMat);

          // Dual gyroscopic astrolabe gimbal rings with 12 degree notches firmly attached
          // Ring 1 (Outer ring, radius 1.95)
          const ring1Group = new THREE.Group();
          ring1Group.position.y = 2.2;

          const ring1Geo = new THREE.TorusGeometry(1.95, 0.065, 16, 48);
          ring1Geo.rotateX(Math.PI / 2); // Put torus in horizontal XZ plane
          const ringMat1 = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x00f5ff,
            emissiveIntensity: 1.8,
            metalness: 0.85,
            roughness: 0.15,
          });
          const ring1Mesh = new THREE.Mesh(ring1Geo, ringMat1);
          ring1Group.add(ring1Mesh);

          // 12 Degree Notch Teeth firmly mounted on Ring 1 rim
          for (let m = 0; m < 12; m++) {
            const notchAngle = (m * Math.PI) / 6;
            const notchGeo = new THREE.BoxGeometry(0.06, 0.12, 0.16);
            const notchMesh = new THREE.Mesh(notchGeo, ringMat1);
            const nx = Math.cos(notchAngle) * 1.95;
            const nz = Math.sin(notchAngle) * 1.95;
            notchMesh.position.set(nx, 0, nz);
            notchMesh.rotation.y = -notchAngle;
            ring1Group.add(notchMesh);
          }
          ring1Group.rotation.x = (22 * Math.PI) / 180;
          artifactGroup.add(ring1Group);
          runicRing1 = ring1Group;

          // Ring 2 (Inner ring, radius 1.55)
          const ring2Group = new THREE.Group();
          ring2Group.position.y = 2.2;

          const ring2Geo = new THREE.TorusGeometry(1.55, 0.055, 16, 48);
          ring2Geo.rotateX(Math.PI / 2); // Put torus in horizontal XZ plane
          const ringMat2 = new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            emissive: 0x22d3ee,
            emissiveIntensity: 1.6,
            metalness: 0.85,
            roughness: 0.15,
          });
          const ring2Mesh = new THREE.Mesh(ring2Geo, ringMat2);
          ring2Group.add(ring2Mesh);

          // 12 Degree Notch Teeth firmly mounted on Ring 2 rim
          for (let m = 0; m < 12; m++) {
            const notchAngle = (m * Math.PI) / 6;
            const notchGeo = new THREE.BoxGeometry(0.05, 0.1, 0.14);
            const notchMesh = new THREE.Mesh(notchGeo, ringMat2);
            const nx = Math.cos(notchAngle) * 1.55;
            const nz = Math.sin(notchAngle) * 1.55;
            notchMesh.position.set(nx, 0, nz);
            notchMesh.rotation.y = -notchAngle;
            ring2Group.add(notchMesh);
          }
          ring2Group.rotation.x = (-22 * Math.PI) / 180;
          ring2Group.rotation.z = (15 * Math.PI) / 180;
          artifactGroup.add(ring2Group);
          runicRing2 = ring2Group;

          // 4 Keplerian Diamond Satellites orbiting on tilted planes
          for (let s = 0; s < 4; s++) {
            const satGeo = new THREE.OctahedronGeometry(0.24, 0);
            const satMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
            const satMesh = new THREE.Mesh(satGeo, satMat);
            satMesh.position.set(2.45, 2.2, 0);
            artifactGroup.add(satMesh);
            satellites.push(satMesh);
          }

          // Stage 4 Stasis De-cloak Group (Ruby barrier & needles that dissolve if node is de-cloaking)
          const isCurrentlyDecloaking = decloakingNodesRef.current.has(node.id);
          decloakGroup = new THREE.Group();
          decloakGroup.visible = isCurrentlyDecloaking;
          artifactGroup.add(decloakGroup);

          const decloakBarrierGeo = new THREE.CylinderGeometry(1.42, 1.42, 3.5, 32, 1, true);
          decloakBarrierMat = new THREE.MeshBasicMaterial({
            color: 0xf43f5e,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const decloakBarrierMesh = new THREE.Mesh(decloakBarrierGeo, decloakBarrierMat);
          decloakBarrierMesh.position.y = 1.75;
          decloakGroup.add(decloakBarrierMesh);

          decloakNeedleMats = [];
          for (let k = 0; k < 6; k++) {
            const angle = (k * Math.PI) / 3 + Math.PI / 6;
            const lx = Math.cos(angle) * 1.65;
            const lz = Math.sin(angle) * 1.65;

            const needleBeamGeo = new THREE.CylinderGeometry(0.024, 0.024, 3.5, 8);
            const needleBeamMat = new THREE.MeshBasicMaterial({
              color: 0xff1e42,
              transparent: true,
              opacity: 0.85,
            });
            const needleBeamMesh = new THREE.Mesh(needleBeamGeo, needleBeamMat);
            needleBeamMesh.position.set(lx, 1.95, lz);
            decloakGroup.add(needleBeamMesh);
            decloakNeedleMats.push(needleBeamMat);
          }
        }

        // ============================================================
        // STATUS 3: COMPLETED — "Radiant Celestial Spire & Astral Light Column"
        // ============================================================
        if (node.status === 'COMPLETED') {
          // Monumental celestial gold obelisk (#f59e0b, metalness 0.95, roughness 0.08)
          const goldMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 1.15,
            metalness: 0.95,
            roughness: 0.08,
          });

          // Tapered hexagonal pillar (base radius 1.05)
          const pillarGeo = new THREE.CylinderGeometry(0.65, 1.05, 3.8, 6);
          const pillarMesh = new THREE.Mesh(pillarGeo, goldMat);
          pillarMesh.position.y = 1.9;
          artifactGroup.add(pillarMesh);
          baseMaterials.push(goldMat);

          // Pyramidal apex capstone
          const capGeo = new THREE.ConeGeometry(0.65, 1.1, 6);
          crownSpire = new THREE.Mesh(capGeo, goldMat);
          crownSpire.position.y = 4.35;
          artifactGroup.add(crownSpire);

          // Floating celestial star jewel
          const jewelGeo = new THREE.OctahedronGeometry(0.48, 0);
          const jewelMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
          crownJewel = new THREE.Mesh(jewelGeo, jewelMat);
          crownJewel.position.y = 5.45;
          artifactGroup.add(crownJewel);

          // Glowing Alchemical Transmutation Seal etched onto plinth stone surrounding the obelisk base
          const sealGroup = new THREE.Group();
          sealGroup.position.y = 0.02;

          transmutationSealMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
          });

          // Outer concentric ring (radius 1.48 to 1.62)
          const sealOuterGeo = new THREE.RingGeometry(1.48, 1.62, 48);
          sealOuterGeo.rotateX(-Math.PI / 2);
          const sealOuterRing = new THREE.Mesh(sealOuterGeo, transmutationSealMat);
          sealGroup.add(sealOuterRing);

          // Inner concentric ring (radius 1.14 to 1.24)
          const sealInnerGeo = new THREE.RingGeometry(1.14, 1.24, 48);
          sealInnerGeo.rotateX(-Math.PI / 2);
          const sealInnerRing = new THREE.Mesh(sealInnerGeo, transmutationSealMat);
          sealGroup.add(sealInnerRing);

          // 6-pointed transmutation star runes / hexagram etched between 1.26 and 1.42
          const starRuneGeo = new THREE.RingGeometry(1.26, 1.42, 6);
          starRuneGeo.rotateX(-Math.PI / 2);
          starRuneGeo.rotateY(Math.PI / 6);
          const starRune = new THREE.Mesh(starRuneGeo, transmutationSealMat);
          sealGroup.add(starRune);

          artifactGroup.add(sealGroup);
          transmutationSealGroup = sealGroup;

          // 48 Ascending Golden Ember Sparks along helical funnel
          const emberCount = 48;
          const emberPositions = new Float32Array(emberCount * 3);
          sparkBaseY = new Float32Array(emberCount);
          sparkSpeeds = new Float32Array(emberCount);
          sparkAngles = new Float32Array(emberCount);

          for (let p = 0; p < emberCount; p++) {
            sparkBaseY[p] = (p / emberCount) * 12.0;
            sparkSpeeds[p] = 2.4 + (p % 4) * 0.4;
            sparkAngles[p] = (p * Math.PI) / 6;

            const y = 0.5 + sparkBaseY[p];
            const r = 1.35 * Math.max(0.2, 1.0 - y / 14.0);
            emberPositions[p * 3] = Math.cos(sparkAngles[p]) * r;
            emberPositions[p * 3 + 1] = y;
            emberPositions[p * 3 + 2] = Math.sin(sparkAngles[p]) * r;
          }

          const auraGeo = new THREE.BufferGeometry();
          auraGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
          const auraMat = new THREE.PointsMaterial({
            color: 0xfcd34d,
            size: 0.38,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          auraPoints = new THREE.Points(auraGeo, auraMat);
          artifactGroup.add(auraPoints);

          // Dual-Layer Ascending Sky Beam
          // Layer 1: Inner Razor-Thin Laser Core (Radius 0.06)
          const coreGeo = new THREE.CylinderGeometry(0.06, 0.06, 65, 16, 1, true);
          const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          skyLaserCore = new THREE.Mesh(coreGeo, coreMat);
          skyLaserCore.position.y = 35;
          artifactGroup.add(skyLaserCore);

          // Layer 2: Outer 3D Helical Light Ribbon (Golden amber ascending spiral)
          const helixCurve = new HelixCurve(0.65, 65, 5.5);
          const ribbonGeo = new THREE.TubeGeometry(helixCurve, 128, 0.08, 8, false);
          const ribbonMat = new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          skyHelicalRibbon = new THREE.Mesh(ribbonGeo, ribbonMat);
          skyHelicalRibbon.position.y = 3;
          artifactGroup.add(skyHelicalRibbon);
        }

        animatedLandmarksRef.current.push({
          nodeId: node.id,
          status: node.status,
          region: node.region,
          group: landmarkGroup,
          artifactGroup,
          crystalMesh,
          monolithMesh,
          stasisLasers,
          stasisBarrier,
          stasisScanline,
          mistDome,
          runicRing1,
          runicRing2,
          satellites,
          auraPoints,
          sparkBaseY,
          sparkSpeeds,
          sparkAngles,
          crownSpire,
          crownJewel,
          skyLaserCore,
          skyHelicalRibbon,
          transmutationSealGroup,
          transmutationSealMat,
          decloakGroup,
          decloakBarrierMat,
          decloakNeedleMats,
          baseY: node.position.y,
          phaseOffset: nodeIdx * 0.65,
          baseMaterials,
          currentHoverLift: 0,
          ringSpeedMult: 1.0,
        });
      });

      islandsGroup.add(islandGroup);

      islandLevitationsRef.current.push({
        group: islandGroup,
        phase: 0, // Identical levitation phase clock across all sanctuaries
        levitationCore: singularityMesh,
        orbitRing1,
        orbitRing2,
      });

      regionIndex++;
    });
  }, [nodes, disposeObjectHierarchy, getMistTexture]);

  // -------------------------------------------------------------
  // 3. Build Living Optical Waveguide Highways & Photonic Comets
  // -------------------------------------------------------------
  useEffect(() => {
    const roadsGroup = roadsGroupRef.current;
    if (!roadsGroup) return;

    disposeObjectHierarchy(roadsGroup);
    while (roadsGroup.children.length > 0) {
      roadsGroup.remove(roadsGroup.children[0]);
    }
    animatedCometsRef.current = [];

    edges.forEach((edge, index) => {
      const fromNode = nodesMap.get(edge.fromNodeId);
      const toNode = nodesMap.get(edge.toNodeId);
      if (!fromNode || !toNode) return;

      const pFrom = new THREE.Vector3(fromNode.position.x, fromNode.position.y + 0.5, fromNode.position.z);
      const pTo = new THREE.Vector3(toNode.position.x, toNode.position.y + 0.5, toNode.position.z);

      const dist = pFrom.distanceTo(pTo);
      const pMid = new THREE.Vector3().addVectors(pFrom, pTo).multiplyScalar(0.5);
      pMid.y = Math.max(pFrom.y, pTo.y) + 1.4 + dist * 0.08;

      const curve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);

      // 1. Translucent Dark Glass Outer Sheath (Radius: 0.12, Opacity: 0.35)
      const sheathGeo = new THREE.TubeGeometry(curve, 48, 0.12, 8, false);
      const sheathMat = new THREE.MeshPhysicalMaterial({
        color: 0x050a14,
        roughness: 0.15,
        metalness: 0.85,
        transmission: 0.6,
        transparent: true,
        opacity: 0.35,
        clearcoat: 1.0,
      });
      const sheathMesh = new THREE.Mesh(sheathGeo, sheathMat);
      roadsGroup.add(sheathMesh);

      // 2. Radiant Razor-Thin Inner Laser Core (Radius: 0.04) glowing in cyan/emerald/gold
      const isBothCompleted = fromNode.status === 'COMPLETED' && toNode.status === 'COMPLETED';
      const isUnlockedHighway = fromNode.status === 'COMPLETED' && toNode.status === 'UNLOCKED';

      const laserCoreGeo = new THREE.TubeGeometry(curve, 48, 0.04, 6, false);
      let laserCoreMat: THREE.MeshStandardMaterial;

      const regionTheme = REGIONS[fromNode.region];
      const regionalColor = regionTheme ? new THREE.Color(regionTheme.color) : new THREE.Color(0x06b6d4);
      const regionalEmissive = regionTheme ? new THREE.Color(regionTheme.emissiveColor) : new THREE.Color(0x38bdf8);

      if (isBothCompleted) {
        laserCoreMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xfbbf24,
          emissiveIntensity: 2.5,
          roughness: 0.2,
          metalness: 0.9,
        });
      } else if (isUnlockedHighway) {
        laserCoreMat = new THREE.MeshStandardMaterial({
          color: regionalColor,
          emissive: regionalEmissive,
          emissiveIntensity: 2.2,
          roughness: 0.25,
          metalness: 0.8,
        });
      } else {
        laserCoreMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0x0f172a,
          emissiveIntensity: 0.2,
          roughness: 0.85,
          transparent: true,
          opacity: 0.35,
        });
      }

      const laserCoreMesh = new THREE.Mesh(laserCoreGeo, laserCoreMat);
      roadsGroup.add(laserCoreMesh);

      // 3. Elongated Photonic Comets with Light Trails (2 per active highway at staggered offsets)
      if (isBothCompleted || isUnlockedHighway) {
        const cometColor = isBothCompleted ? 0xfef08a : regionalEmissive.getHex();
        const trailColor = isBothCompleted ? 0xf59e0b : regionalColor.getHex();
        const offsets = [0.0, 0.5];

        offsets.forEach((stagger) => {
          const parts: PhotonicCometPart[] = [];

          // Comet Head (Radius 0.22, High Emissive Radiance)
          const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
          const headMat = new THREE.MeshBasicMaterial({ color: cometColor });
          const headMesh = new THREE.Mesh(headGeo, headMat);
          roadsGroup.add(headMesh);
          parts.push({ mesh: headMesh, trailOffset: 0.0 });

          // 3 Trailing Light Packets with Decreasing Scale & Opacity
          const tailConfigs = [
            { radius: 0.16, opacity: 0.75, offset: 0.016 },
            { radius: 0.11, opacity: 0.48, offset: 0.032 },
            { radius: 0.06, opacity: 0.22, offset: 0.048 },
          ];

          tailConfigs.forEach(({ radius: tr, opacity: to, offset: tOff }) => {
            const tailGeo = new THREE.SphereGeometry(tr, 8, 8);
            const tailMat = new THREE.MeshBasicMaterial({
              color: trailColor,
              transparent: true,
              opacity: to,
            });
            const tailMesh = new THREE.Mesh(tailGeo, tailMat);
            roadsGroup.add(tailMesh);
            parts.push({ mesh: tailMesh, trailOffset: tOff });
          });

          animatedCometsRef.current.push({
            curve,
            parts,
            speed: 0.24 + (index % 3) * 0.05,
            offset: (stagger + index * 0.2) % 1.0,
            edgeId: edge.id,
          });
        });
      }
    });
  }, [edges, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 4. Build Fog-of-War Shroud over Locked Territories
  // -------------------------------------------------------------
  useEffect(() => {
    const fogGroup = fogGroupRef.current;
    if (!fogGroup) return;

    disposeObjectHierarchy(fogGroup);
    while (fogGroup.children.length > 0) {
      fogGroup.remove(fogGroup.children[0]);
    }
    animatedFogRegionsRef.current = [];

    const lockedNodesByRegion = new Map<string, MapNode[]>();
    nodes.forEach((n) => {
      if (n.status === 'LOCKED') {
        const list = lockedNodesByRegion.get(n.region) || [];
        list.push(n);
        lockedNodesByRegion.set(n.region, list);
      }
    });

    lockedNodesByRegion.forEach((lockedList, regionName) => {
      const theme = REGIONS[regionName];
      const center = theme
        ? theme.center
        : {
            x: lockedList.reduce((acc, curr) => acc + curr.position.x, 0) / lockedList.length,
            y: 0,
            z: lockedList.reduce((acc, curr) => acc + curr.position.z, 0) / lockedList.length,
          };

      const particleCount = 130;
      const positions = new Float32Array(particleCount * 3);
      const speeds = new Float32Array(particleCount);
      const angles = new Float32Array(particleCount);
      const radii = new Float32Array(particleCount);
      const yPositions = new Float32Array(particleCount);

      const baseRadius = theme ? theme.islandRadius * 0.95 : 18;

      for (let i = 0; i < particleCount; i++) {
        angles[i] = Math.random() * Math.PI * 2;
        radii[i] = 4 + Math.random() * baseRadius;
        speeds[i] = 0.0016 + Math.random() * 0.0028;
        yPositions[i] = 1.5 + Math.random() * 7.5;

        positions[i * 3] = center.x + Math.cos(angles[i]) * radii[i];
        positions[i * 3 + 1] = yPositions[i];
        positions[i * 3 + 2] = center.z + Math.sin(angles[i]) * radii[i];
      }

      const fogGeo = new THREE.BufferGeometry();
      fogGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const fogMat = new THREE.PointsMaterial({
        color: 0x475569,
        size: 4.8,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      const fogPoints = new THREE.Points(fogGeo, fogMat);
      fogGroup.add(fogPoints);

      animatedFogRegionsRef.current.push({
        points: fogPoints,
        center,
        speeds,
        angles,
        radii,
        yPositions,
      });
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 5. Build Selection Reticle & Sky Light Beacon
  // -------------------------------------------------------------
  useEffect(() => {
    const selectionGroup = selectionGroupRef.current;
    if (!selectionGroup) return;

    disposeObjectHierarchy(selectionGroup);
    while (selectionGroup.children.length > 0) {
      selectionGroup.remove(selectionGroup.children[0]);
    }

    if (!selectedNodeId) return;
    const selectedNode = nodesMap.get(selectedNodeId);
    if (!selectedNode) return;

    const { x, y, z } = selectedNode.position;

    // Dual concentric holographic target rings
    const ring1Geo = new THREE.TorusGeometry(2.1, 0.08, 16, 48);
    ring1Geo.rotateX(Math.PI / 2);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.name = 'ring1';
    ring1.position.set(x, y + 0.38, z);
    selectionGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.65, 0.05, 16, 48);
    ring2Geo.rotateX(Math.PI / 2);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.name = 'ring2';
    ring2.position.set(x, y + 0.38, z);
    selectionGroup.add(ring2);

    // Glowing Sky Beacon Beam
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.85, 48, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'beam';
    beam.position.set(x, y + 24, z);
    selectionGroup.add(beam);
  }, [selectedNodeId, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 6. Raycasting, Pointer Events & Audio Telemetry
  // -------------------------------------------------------------
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const container = mountRef.current;
      const camera = cameraRef.current;
      if (!container || !camera) return;

      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mousePosRef.current.set(mouseX, mouseY);

      raycasterRef.current.setFromCamera(mousePosRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(interactiveHitboxesRef.current, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const hitNodeId = hitMesh.userData.nodeId as string;
        const node = nodesMap.get(hitNodeId);

        if (node) {
          container.style.cursor = 'pointer';

          if (hoveredNodeIdRef.current !== hitNodeId) {
            hoveredNodeIdRef.current = hitNodeId;
            onHoverNode?.(hitNodeId);
            if (!audioMuted) {
              playHoverBlip(node.position.y, node.region);
            }
          }

          // Compute screen projection using real-time world position
          const worldPos = new THREE.Vector3();
          hitMesh.getWorldPosition(worldPos);
          worldPos.y += 3.2;
          worldPos.project(camera);
          const screenX = ((worldPos.x + 1) * rect.width) / 2;
          const screenY = ((-worldPos.y + 1) * rect.height) / 2;

          setHoveredTooltip({
            node,
            screenX,
            screenY,
          });
          return;
        }
      }

      // No hit
      if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        onHoverNode?.(null);
      }
      container.style.cursor = 'default';
      setHoveredTooltip(null);
    },
    [nodesMap, onHoverNode, audioMuted]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const container = mountRef.current;
      const camera = cameraRef.current;
      if (!container || !camera) return;

      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mousePosRef.current.set(mouseX, mouseY);

      raycasterRef.current.setFromCamera(mousePosRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(interactiveHitboxesRef.current, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const hitNodeId = hitMesh.userData.nodeId as string;
        onSelectNode(hitNodeId);
        if (!audioMuted) {
          playSelectTone();
        }
      }
    },
    [onSelectNode, audioMuted]
  );

  const handlePointerLeave = useCallback(() => {
    hoveredNodeIdRef.current = null;
    onHoverNode?.(null);
    setHoveredTooltip(null);
    if (mountRef.current) {
      mountRef.current.style.cursor = 'default';
    }
  }, [onHoverNode]);

  // Viewport Control Button Helpers
  const handleZoomIn = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
    camera.position.addScaledVector(dir, 9);
    controls.update();
  };

  const handleZoomOut = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    camera.position.addScaledVector(dir, 9);
    controls.update();
  };

  const toggleViewMode = () => {
    if (viewMode === 'isometric') {
      setViewMode('perspective');
      targetCamPosRef.current.set(0, 52, 62);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    } else if (viewMode === 'perspective') {
      setViewMode('topdown');
      targetCamPosRef.current.set(0, 85, 0.1);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    } else {
      setViewMode('isometric');
      targetCamPosRef.current.set(46, 52, 46);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    }
  };

  const jumpToRegion = (regionName: string) => {
    const theme = REGIONS[regionName];
    if (theme) {
      focusCameraOnPosition(theme.center.x, theme.center.y, theme.center.z, false, isDrawerOpen);
      if (!audioMuted) {
        playSelectTone();
      }
    }
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none bg-[#02040a] ${className}`}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
    >
      {/* Three.js Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating 3D Hover Tooltip */}
      {hoveredTooltip && (
        <div
          className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 transition-opacity duration-150 ease-out"
          style={{
            left: `${hoveredTooltip.screenX}px`,
            top: `${hoveredTooltip.screenY}px`,
          }}
        >
          <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/80 max-w-xs backdrop-blur-md bg-slate-950/90 text-slate-100">
            {/* Header: Status Badge & Region */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-semibold truncate">
                {hoveredTooltip.node.region}
              </span>

              {hoveredTooltip.node.status === 'COMPLETED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  Completed
                </span>
              )}
              {hoveredTooltip.node.status === 'UNLOCKED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Unlocked
                </span>
              )}
              {hoveredTooltip.node.status === 'LOCKED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  <Lock className="w-3 h-3 text-slate-500" />
                  Locked
                </span>
              )}
            </div>

            {/* Title */}
            <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
              {hoveredTooltip.node.title}
            </h4>

            {/* Reward & Prerequisites */}
            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="font-mono text-amber-400 font-semibold">
                +{hoveredTooltip.node.xpReward} XP
              </span>
              <span className="text-[11px] text-slate-400">
                {hoveredTooltip.node.prerequisites.length === 0
                  ? 'No prerequisites'
                  : `${hoveredTooltip.node.prerequisites.length} prerequisite${
                      hoveredTooltip.node.prerequisites.length > 1 ? 's' : ''
                    }`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Viewport Floating Quick Controls */}
      <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
          className="p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg shadow-black/60 bg-slate-900/85 border border-slate-800"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
          className="p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg shadow-black/60 bg-slate-900/85 border border-slate-800"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={toggleViewMode}
          title={`Vantage: ${viewMode.toUpperCase()} (Click to toggle)`}
          aria-label="Toggle Camera Mode"
          className={`p-2.5 rounded-xl glass-panel transition-colors shadow-lg shadow-black/60 border ${
            viewMode === 'isometric'
              ? 'text-cyan-400 border-cyan-500/50 bg-cyan-950/60'
              : 'text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 bg-slate-900/85 border-slate-800'
          }`}
        >
          {viewMode === 'isometric' && <Box className="w-4 h-4" />}
          {viewMode === 'perspective' && <Compass className="w-4 h-4" />}
          {viewMode === 'topdown' && <Layers className="w-4 h-4" />}
        </button>

        <button
          onClick={resetCameraToOverview}
          title="Reset Camera Overview"
          aria-label="Reset Camera"
          className="p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg shadow-black/60 bg-slate-900/85 border border-slate-800"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Region Quick Jump Bar (Centered horizontally at bottom-6 left-1/2 -translate-x-1/2) */}
      {activeRegionsList.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 hidden sm:flex items-center gap-2 pointer-events-auto bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl shadow-black/80">
          {activeRegionsList.map(([regionName, theme]) => (
            <button
              key={regionName}
              onClick={() => jumpToRegion(regionName)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all border border-transparent hover:border-slate-700"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: theme.color, boxShadow: `0 0 10px ${theme.color}` }}
              />
              <span>
                {regionName
                  .replace(' Archipelago', '')
                  .replace(' Sanctuary', '')
                  .replace(' Citadel', '')
                  .replace(' Bastion', '')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AtlasCanvas3D;
