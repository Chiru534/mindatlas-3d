import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { MapNode, MapEdge, NodeStatus } from '../types/atlas';
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
  Globe2,
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

interface AnimatedRadarPod {
  group: THREE.Group;
  outerRing: THREE.Mesh;
  middleRing: THREE.Mesh;
  ticksRing: THREE.Mesh;
  baseBeam: THREE.Mesh;
}

interface AnimatedGearPair {
  gearA: THREE.Mesh;
  gearB: THREE.Mesh;
}

interface AnimatedSatelliteChip {
  mesh: THREE.Mesh;
  angle: number;
  speed: number;
  radius: number;
  line: THREE.Line;
  labelSprite?: THREE.Sprite;
}

interface AnimatedPolyhedralCrystal {
  nodeId: string;
  status: NodeStatus;
  region: string;
  group: THREE.Group;
  coreCrystal: THREE.Mesh;
  outerWireframe: THREE.Mesh;
  gimbalRingX?: THREE.Mesh;
  gimbalRingZ?: THREE.Mesh;
  accretionRing?: THREE.Mesh;
  stasisShieldMesh?: THREE.Mesh;
  stasisNeedles: THREE.Mesh[];
  beaconSpire?: THREE.Mesh;
  radarPod: AnimatedRadarPod;
  satelliteChips: AnimatedSatelliteChip[];
  sparkPoints?: THREE.Points;
  sparkAngles?: Float32Array;
  sparkHeights?: Float32Array;
  sparkSpeeds?: Float32Array;
  barChartGroup?: THREE.Group;
  gearsGroup?: AnimatedGearPair;
  formulaSprite?: THREE.Sprite;
  leaderLabel?: {
    sprite: THREE.Sprite;
    line: THREE.Line;
  };
  rotationSpeed: number;
  basePos: THREE.Vector3;
  baseMaterials: THREE.Material[];
}

interface WarpCometPart {
  mesh: THREE.Mesh;
  trailOffset: number;
}

interface AnimatedWarpConduit {
  curve: THREE.CatmullRomCurve3;
  parts: WarpCometPart[];
  speed: number;
  offset: number;
  edgeId: string;
}

interface ActiveShockwave {
  mesh: THREE.Mesh;
  startTime: number;
  duration: number;
  initialScale: number;
  maxScale: number;
}

interface ActiveLaserSurge {
  curve: THREE.CatmullRomCurve3;
  headMesh: THREE.Mesh;
  trailMeshes: THREE.Mesh[];
  startTime: number;
  duration: number;
  edgeId: string;
}

// Science and math formulas to project near specific nodes
const MATHEMATICAL_FORMULAS: Record<string, string[]> = {
  'AI & Neural Sanctuary': [
    '∇L = ∂L/∂w',
    'σ(z) = 1/(1+e⁻ᶻ)',
    'ŷ = softmax(W·x + b)',
    'mₜ = β₁mₜ₋₁ + (1-β₁)gₜ',
  ],
  'Frontend Archipelago': [
    'gl_FragColor = vec4(rgb, 1.0)',
    'M_proj · M_view · v_pos',
    'O(1) Virtual DOM Reconciliation',
    'f(t) = cubic-bezier(0.16, 1, 0.3, 1)',
  ],
  'Backend Citadel': [
    'ACID: [Tx_begin → Commit]',
    'RPS: 120,000 req/sec (p99 < 8ms)',
    'SELECT * FROM dag_cte RECURSIVE',
    'Redis::cluster.pipe_sync()',
  ],
  'Cybersecurity Bastion': [
    'Ed25519: S = r + H(R,A,M)·x',
    'SHA-256 HMAC::digest(nonce)',
    'mTLS Handshake: Verified',
    'STRIDE: [Spoofing, Tampering] = 0',
  ],
};

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
  const tableMatrixGroupRef = useRef<THREE.Group | null>(null);
  const polyhedraGroupRef = useRef<THREE.Group | null>(null);
  const warpRoadsGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const shockwavesGroupRef = useRef<THREE.Group | null>(null);

  // Dynamic Scene Animations
  const interactiveHitboxesRef = useRef<THREE.Mesh[]>([]);
  const animatedCrystalsRef = useRef<AnimatedPolyhedralCrystal[]>([]);
  const animatedConduitsRef = useRef<AnimatedWarpConduit[]>([]);
  const activeShockwavesRef = useRef<ActiveShockwave[]>([]);
  const activeLaserSurgesRef = useRef<ActiveLaserSurge[]>([]);
  const radarSweepMeshRef = useRef<THREE.Mesh | null>(null);

  // Camera Lerp State
  const isTransitioningCameraRef = useRef<boolean>(false);
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetControlsLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Mouse & UI State
  const mousePosRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipData | null>(null);
  const [viewMode, setViewMode] = useState<'isometric' | 'perspective' | 'topdown'>('perspective');

  // Shared Raycaster
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Tracking Completed Nodes for Shockwaves & Cascade
  const prevCompletedNodeIdsRef = useRef<Set<string>>(new Set());

  // Node Map for fast lookup
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

  // Texture Singletons & Generators
  const cachedTexturesRef = useRef<Map<string, THREE.CanvasTexture>>(new Map());

  // 1. Procedural Tactical Cyber-Table Grid Texture (2048 x 2048)
  const getTacticalTableGridTexture = useCallback((): THREE.CanvasTexture => {
    const key = 'tactical-table-grid';
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Midnight obsidian specular table base
      ctx.fillStyle = '#020409';
      ctx.fillRect(0, 0, 2048, 2048);

      const cx = 1024;
      const cy = 1024;

      // Fine coordinate grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1;
      const step = 64;
      for (let x = 0; x <= 2048; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 2048);
        ctx.stroke();
      }
      for (let y = 0; y <= 2048; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(2048, y);
        ctx.stroke();
      }

      // Major coordinate division lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= 2048; x += 256) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 2048);
        ctx.stroke();
      }
      for (let y = 0; y <= 2048; y += 256) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(2048, y);
        ctx.stroke();
      }

      // Intersection Crosshairs (+)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 1.5;
      for (let x = 128; x < 2048; x += 256) {
        for (let y = 128; y < 2048; y += 256) {
          ctx.beginPath();
          ctx.moveTo(x - 8, y);
          ctx.lineTo(x + 8, y);
          ctx.moveTo(x, y - 8);
          ctx.lineTo(x, y + 8);
          ctx.stroke();
        }
      }

      // Concentric Tactical Command Rings
      const ringRadii = [240, 520, 800, 960];
      ringRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(56, 189, 248, 0.45)' : 'rgba(168, 85, 247, 0.35)';
        ctx.lineWidth = idx === 3 ? 3 : 1.5;
        if (idx === 1 || idx === 3) {
          ctx.setLineDash([12, 12]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
      });

      // Azimuth radial notches & degree readouts
      ctx.setLineDash([]);
      for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const isMajor = deg % 45 === 0;

        const innerR = isMajor ? 900 : 930;
        const outerR = 960;

        ctx.beginPath();
        ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = isMajor ? 2.5 : 1.2;
        ctx.stroke();

        if (isMajor) {
          const tx = cx + cos * 995;
          const ty = cy + sin * 995;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(rad + Math.PI / 2);
          ctx.font = 'bold 20px monospace';
          ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${deg}°`, 0, 0);
          ctx.restore();
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 2. Procedural Holographic Radar Sweep Texture (1024 x 1024)
  const getRadarSweepTexture = useCallback((): THREE.CanvasTexture => {
    const key = 'radar-sweep-cyan';
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 1024, 1024);
      const cx = 512;
      const cy = 512;
      const radius = 500;

      const sweepAngle = Math.PI / 2.8;
      const step = 0.012;
      for (let a = 0; a < sweepAngle; a += step) {
        const factor = a / sweepAngle;
        const alpha = Math.pow(factor, 2.2) * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, a - sweepAngle, a - sweepAngle + step + 0.005);
        ctx.closePath();
        ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 14;
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 3. Procedural Radar Anchor Reticle Texture (512 x 512) for Node Table Base
  const getRadarAnchorTexture = useCallback((themeColor: string): THREE.CanvasTexture => {
    const key = `anchor-radar-${themeColor}`;
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);
      const cx = 256;
      const cy = 256;

      // Outer targeting bracket ring
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, 220, 0, Math.PI * 2);
      ctx.stroke();

      // Dashed telemetry ring
      ctx.beginPath();
      ctx.arc(cx, cy, 180, 0, Math.PI * 2);
      ctx.setLineDash([16, 12]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner solid glow circle
      ctx.beginPath();
      ctx.arc(cx, cy, 130, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center glowing core dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();

      // 4 Precision Corner Crosshairs
      for (let a = 0; a < 4; a++) {
        const angle = (a * Math.PI) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx + cos * 150, cy + sin * 150);
        ctx.lineTo(cx + cos * 240, cy + sin * 240);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 4. Procedural 3D Typography Leader Billboard (512 x 140)
  const getLeaderLabelTexture = useCallback(
    (node: MapNode, stepNum: string, themeColor: string): THREE.CanvasTexture => {
      const key = `leader-${node.id}-${node.status}`;
      if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 140;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 140);

        // Dark glass background with rounded pill corners
        ctx.fillStyle = 'rgba(2, 6, 18, 0.92)';
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.roundRect(12, 12, 488, 116, 20);
        ctx.fill();
        ctx.stroke();

        // Step number pill badge
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.roundRect(28, 28, 70, 32, 10);
        ctx.fill();

        ctx.font = 'bold 18px monospace';
        ctx.fillStyle = '#020617';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stepNum, 63, 44);

        // Status pill
        const statusText =
          node.status === 'COMPLETED'
            ? '85% COMPLETE'
            : node.status === 'UNLOCKED'
            ? 'HIGH PRIORITY'
            : 'IN STASIS';
        const statusColor =
          node.status === 'COMPLETED'
            ? '#10b981'
            : node.status === 'UNLOCKED'
            ? '#38bdf8'
            : '#f43f5e';

        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = statusColor;
        ctx.textAlign = 'right';
        ctx.fillText(statusText, 470, 44);

        // Node Title
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        const displayTitle =
          node.title.length > 28 ? `${node.title.slice(0, 26)}...` : node.title;
        ctx.fillText(displayTitle, 30, 94);

        // XP tag
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'right';
        ctx.fillText(`+${node.xpReward} XP`, 470, 94);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      cachedTexturesRef.current.set(key, texture);
      return texture;
    },
    []
  );

  // 5. Procedural Science & Math Formula Billboard (512 x 128)
  const getFormulaTexture = useCallback((formulaText: string, color: string): THREE.CanvasTexture => {
    const key = `formula-${formulaText}-${color}`;
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 128);

      // Holographic glowing frame
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(8, 8, 496, 112);
      ctx.setLineDash([]);

      // Formula typography with outer glow
      ctx.font = 'bold 30px "Fira Code", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillText(formulaText, 256, 64);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 6. Procedural Subtask Chip Text Pill (256 x 64)
  const getSubtaskLabelTexture = useCallback((title: string, completed: boolean): THREE.CanvasTexture => {
    const key = `subtask-${title}-${completed}`;
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(2, 6, 18, 0.88)';
      ctx.strokeStyle = completed ? '#10b981' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 14);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = completed ? '#34d399' : '#e0f2fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const clean = title.length > 20 ? `${title.slice(0, 18)}...` : title;
      ctx.fillText(clean, 128, 32);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
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
                !Array.from(cachedTexturesRef.current.values()).includes(
                  stdMat.map as THREE.CanvasTexture
                )
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
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    });
  }, []);

  // Smooth Camera Lerp Trigger
  const focusCameraOnPosition = useCallback(
    (x: number, y: number, z: number, immediate = false, drawerOpen = false) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      let camX = x + 16;
      let camY = y + 14;
      let camZ = z + 18;

      if (viewMode === 'topdown') {
        camX = x;
        camY = y + 70;
        camZ = z + 0.1;
      } else if (viewMode === 'isometric') {
        camX = x + 24;
        camY = y + 26;
        camZ = z + 24;
      }

      const lookAtTarget = new THREE.Vector3(x, y, z);
      const camPos = new THREE.Vector3(camX, camY, camZ);
      const viewDir = new THREE.Vector3().subVectors(lookAtTarget, camPos).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(viewDir, up).normalize();

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

  // Reset Camera to Cinematic Command Overview
  const resetCameraToOverview = useCallback(() => {
    targetCamPosRef.current.set(38, 36, 42);
    targetControlsLookAtRef.current.set(0, 2, 0);
    isTransitioningCameraRef.current = true;
    onRequestResetCamera?.();
  }, [onRequestResetCamera]);

  useEffect(() => {
    if (cameraResetTrigger > 0) {
      resetCameraToOverview();
    }
  }, [cameraResetTrigger, resetCameraToOverview]);

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

  // 4-Stage Quest Completion Celebration Cascade
  const triggerQuestCompletionCascade = useCallback(
    (completedNode: MapNode) => {
      const shockwavesGroup = shockwavesGroupRef.current;
      if (!shockwavesGroup) return;

      const { x, y, z } = completedNode.position;
      const now = performance.now() / 1000;

      // Stage 1: Golden Table Shockwave Ring
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
      shockMesh.position.set(x, 0.08, z);
      shockMesh.scale.set(0.2, 0.2, 0.2);
      shockwavesGroup.add(shockMesh);

      activeShockwavesRef.current.push({
        mesh: shockMesh,
        startTime: now + 0.1,
        duration: 1.4,
        initialScale: 0.2,
        maxScale: 28.0,
      });

      // Stage 2: High-Velocity Laser Surge along outgoing conduits
      const outgoingEdges = edges.filter((e) => e.fromNodeId === completedNode.id);
      outgoingEdges.forEach((edge) => {
        const targetNode = nodesMap.get(edge.toNodeId);
        if (!targetNode) return;

        const pFrom = new THREE.Vector3(x, y, z);
        const pTo = new THREE.Vector3(
          targetNode.position.x,
          targetNode.position.y,
          targetNode.position.z
        );
        const dist = pFrom.distanceTo(pTo);
        const pMid = new THREE.Vector3().addVectors(pFrom, pTo).multiplyScalar(0.5);
        pMid.y = Math.max(pFrom.y, pTo.y) + 2.5 + dist * 0.08;
        const surgeCurve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);

        const surgeHeadGeo = new THREE.SphereGeometry(0.45, 16, 16);
        const surgeHeadMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const surgeHeadMesh = new THREE.Mesh(surgeHeadGeo, surgeHeadMat);
        surgeHeadMesh.position.copy(pFrom);
        shockwavesGroup.add(surgeHeadMesh);

        const trailMeshes: THREE.Mesh[] = [];
        for (let t = 0; t < 3; t++) {
          const trailGeo = new THREE.SphereGeometry(0.32 - t * 0.07, 12, 12);
          const trailMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.85 - t * 0.25,
          });
          const trailMesh = new THREE.Mesh(trailGeo, trailMat);
          shockwavesGroup.add(trailMesh);
          trailMeshes.push(trailMesh);
        }

        activeLaserSurgesRef.current.push({
          curve: surgeCurve,
          headMesh: surgeHeadMesh,
          trailMeshes,
          startTime: now + 0.2,
          duration: 0.9,
          edgeId: edge.id,
        });
      });
    },
    [edges, nodesMap]
  );

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
  // 1. Scene Core Setup: WebGLRenderer, Camera, Controls, Lights
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Deep Obsidian Tactical Table Room
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x020409);
    scene.fog = new THREE.FogExp2(0x020409, 0.0055);

    // Perspective Camera matching the tactile video vantage
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.5, 1000);
    camera.position.set(38, 36, 42);
    cameraRef.current = camera;

    // WebGLRenderer with ACES Filmic Tone Mapping & High Specularity
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // UnrealBloomPass Pipeline (Threshold: 0.72, Strength: 1.45, Radius: 0.45)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.45, // strength: high-end glowing polyhedral crystals & laser pulses
      0.45, // radius: tight, crisp edge halo
      0.72  // threshold: triggers glow on true emissives
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent camera dipping below table
    controls.minDistance = 6;
    controls.maxDistance = 220;
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;

    const onControlsStart = () => {
      isTransitioningCameraRef.current = false;
    };
    controls.addEventListener('start', onControlsStart);

    // Scene Hierarchy Groups
    const tableMatrixGroup = new THREE.Group();
    tableMatrixGroup.name = 'table-matrix-group';
    scene.add(tableMatrixGroup);
    tableMatrixGroupRef.current = tableMatrixGroup;

    const polyhedraGroup = new THREE.Group();
    polyhedraGroup.name = 'polyhedra-group';
    scene.add(polyhedraGroup);
    polyhedraGroupRef.current = polyhedraGroup;

    const warpRoadsGroup = new THREE.Group();
    warpRoadsGroup.name = 'warp-roads-group';
    scene.add(warpRoadsGroup);
    warpRoadsGroupRef.current = warpRoadsGroup;

    const selectionGroup = new THREE.Group();
    selectionGroup.name = 'selection-group';
    scene.add(selectionGroup);
    selectionGroupRef.current = selectionGroup;

    const shockwavesGroup = new THREE.Group();
    shockwavesGroup.name = 'shockwaves-group';
    scene.add(shockwavesGroup);
    shockwavesGroupRef.current = shockwavesGroup;

    // Cinematic Tactical Command Lighting
    const ambientLight = new THREE.AmbientLight(0x0a1128, 1.6);
    scene.add(ambientLight);

    const keyLight1 = new THREE.DirectionalLight(0x38bdf8, 2.8);
    keyLight1.position.set(45, 60, 45);
    scene.add(keyLight1);

    const rimLight2 = new THREE.DirectionalLight(0xd946ef, 2.2);
    rimLight2.position.set(-45, 30, -45);
    scene.add(rimLight2);

    // Dark Obsidian Tactical Glass Tabletop Surface at Y = 0
    const tableGeo = new THREE.CircleGeometry(120, 64);
    tableGeo.rotateX(-Math.PI / 2);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x02050c,
      roughness: 0.12,
      metalness: 0.92,
    });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = 0;
    tableMatrixGroup.add(tableMesh);

    // Table Grid Overlay with Crosshairs and Ticks
    const gridOverlayGeo = new THREE.PlaneGeometry(240, 240);
    gridOverlayGeo.rotateX(-Math.PI / 2);
    const gridOverlayMat = new THREE.MeshBasicMaterial({
      map: getTacticalTableGridTexture(),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const gridOverlay = new THREE.Mesh(gridOverlayGeo, gridOverlayMat);
    gridOverlay.position.y = 0.02;
    tableMatrixGroup.add(gridOverlay);

    // Rotating 360-Degree Holographic Radar Sweep
    const radarGeo = new THREE.CircleGeometry(110, 64);
    radarGeo.rotateX(-Math.PI / 2);
    const radarMat = new THREE.MeshBasicMaterial({
      map: getRadarSweepTexture(),
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const radarMesh = new THREE.Mesh(radarGeo, radarMat);
    radarMesh.position.y = 0.04;
    tableMatrixGroup.add(radarMesh);
    radarSweepMeshRef.current = radarMesh;

    // Ambient floating sparkling dust motes
    const dustCount = 600;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    const dustPalette = [
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xd946ef),
      new THREE.Color(0xfbbf24),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < dustCount; i++) {
      const radius = 10 + Math.random() * 85;
      const angle = Math.random() * Math.PI * 2;
      dustPositions[i * 3] = Math.cos(angle) * radius;
      dustPositions[i * 3 + 1] = 0.5 + Math.random() * 16;
      dustPositions[i * 3 + 2] = Math.sin(angle) * radius;

      const col = dustPalette[Math.floor(Math.random() * dustPalette.length)];
      dustColors[i * 3] = col.r;
      dustColors[i * 3 + 1] = col.g;
      dustColors[i * 3 + 2] = col.b;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // Handle Window Resize
    const handleResize = () => {
      if (!container || !camera || !renderer || !composer) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 60 FPS Animation & Render Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();
      const nowSec = performance.now() / 1000;

      // Camera Lerp
      if (isTransitioningCameraRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.065);
        controls.target.lerp(targetControlsLookAtRef.current, 0.065);
        controls.update();

        if (
          camera.position.distanceTo(targetCamPosRef.current) < 0.25 &&
          controls.target.distanceTo(targetControlsLookAtRef.current) < 0.25
        ) {
          isTransitioningCameraRef.current = false;
        }
      } else {
        controls.update();
      }

      // Rotate Main Holographic Radar Sweep on Table
      if (radarSweepMeshRef.current) {
        radarSweepMeshRef.current.rotation.z = -elapsedTime * 0.45;
      }

      // Animate Polyhedral Crystals, Wireframes, Gimbals & Infographics
      animatedCrystalsRef.current.forEach((crystal) => {
        // Core crystal rotation
        crystal.coreCrystal.rotation.y = elapsedTime * crystal.rotationSpeed;
        crystal.coreCrystal.rotation.x = Math.sin(elapsedTime * 0.5) * 0.15;

        // Outer wireframe counter-rotation
        crystal.outerWireframe.rotation.y = -elapsedTime * (crystal.rotationSpeed * 0.75);
        crystal.outerWireframe.rotation.z = elapsedTime * 0.4;

        // Gyroscopic gimbal rings
        if (crystal.gimbalRingX) {
          crystal.gimbalRingX.rotation.x = elapsedTime * 0.85;
          crystal.gimbalRingX.rotation.y = elapsedTime * 0.35;
        }
        if (crystal.gimbalRingZ) {
          crystal.gimbalRingZ.rotation.z = -elapsedTime * 0.75;
          crystal.gimbalRingZ.rotation.y = -elapsedTime * 0.25;
        }

        // Accretion ring for completed nodes
        if (crystal.accretionRing) {
          crystal.accretionRing.rotation.z = elapsedTime * 0.25;
        }

        // Radar base on table
        crystal.radarPod.ticksRing.rotation.z = -elapsedTime * 0.65;
        crystal.radarPod.middleRing.rotation.z = elapsedTime * 0.35;

        // Stasis shield pulse for locked nodes
        if (crystal.stasisShieldMesh) {
          const shieldPulse = 1.0 + Math.sin(elapsedTime * 3.2) * 0.08;
          crystal.stasisShieldMesh.scale.set(shieldPulse, shieldPulse, shieldPulse);
          crystal.stasisShieldMesh.rotation.y = elapsedTime * 0.25;
        }

        // Subtask Satellite Diamond Chips
        crystal.satelliteChips.forEach((chip) => {
          chip.angle += chip.speed * delta;
          const cx = Math.cos(chip.angle) * chip.radius;
          const cz = Math.sin(chip.angle) * chip.radius;
          const cy = Math.sin(chip.angle * 2) * 0.35;
          chip.mesh.position.set(cx, cy, cz);
          chip.mesh.rotation.y += delta * 2.0;

          // Update radial filament line
          const positions = chip.line.geometry.attributes.position as THREE.BufferAttribute;
          positions.setXYZ(0, 0, 0, 0);
          positions.setXYZ(1, cx, cy, cz);
          positions.needsUpdate = true;
        });

        // Golden Stardust Particles
        if (
          crystal.sparkPoints &&
          crystal.sparkAngles &&
          crystal.sparkHeights &&
          crystal.sparkSpeeds
        ) {
          const posAttr = crystal.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
          const posArray = posAttr.array as Float32Array;

          for (let s = 0; s < crystal.sparkAngles.length; s++) {
            crystal.sparkAngles[s] += delta * crystal.sparkSpeeds[s] * 0.5;
            crystal.sparkHeights[s] += delta * 1.2;
            if (crystal.sparkHeights[s] > 6.0) {
              crystal.sparkHeights[s] = 0.0;
            }

            posArray[s * 3] = Math.cos(crystal.sparkAngles[s]) * 2.2;
            posArray[s * 3 + 1] = crystal.sparkHeights[s] - 1.2;
            posArray[s * 3 + 2] = Math.sin(crystal.sparkAngles[s]) * 2.2;
          }
          posAttr.needsUpdate = true;
        }

        // Animate 3D Holographic Gears
        if (crystal.gearsGroup) {
          crystal.gearsGroup.gearA.rotation.z = elapsedTime * 1.2;
          crystal.gearsGroup.gearB.rotation.z = -elapsedTime * 1.2;
        }

        // Floating science formula undulation
        if (crystal.formulaSprite) {
          crystal.formulaSprite.position.y = 2.8 + Math.sin(elapsedTime * 1.8) * 0.25;
        }

        // Leader label line update
        if (crystal.leaderLabel) {
          const leaderLine = crystal.leaderLabel.line;
          const leaderPos = leaderLine.geometry.attributes.position as THREE.BufferAttribute;
          leaderPos.setXYZ(0, 0, 1.6, 0); // apex of crystal
          leaderPos.setXYZ(1, 2.2, 3.4, 0); // elbow
          leaderPos.setXYZ(2, 3.8, 3.4, 0); // label anchor
          leaderPos.needsUpdate = true;
        }
      });

      // Animate Warp Conduits with Traveling Photons
      animatedConduitsRef.current.forEach((conduit) => {
        conduit.offset = (conduit.offset + conduit.speed * delta) % 1.0;
        conduit.parts.forEach((part) => {
          let t = conduit.offset - part.trailOffset;
          if (t < 0) t += 1.0;
          const point = conduit.curve.getPoint(t);
          part.mesh.position.copy(point);
        });
      });

      // Animate Celebration Shockwaves
      const remainingShockwaves: ActiveShockwave[] = [];
      activeShockwavesRef.current.forEach((sw) => {
        const progress = (nowSec - sw.startTime) / sw.duration;
        if (progress >= 0 && progress <= 1.0) {
          const currentScale = THREE.MathUtils.lerp(sw.initialScale, sw.maxScale, progress);
          sw.mesh.scale.set(currentScale, currentScale, currentScale);
          const mat = sw.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = (1.0 - progress) * 0.95;
          remainingShockwaves.push(sw);
        } else if (progress > 1.0) {
          sw.mesh.parent?.remove(sw.mesh);
          sw.mesh.geometry.dispose();
          (sw.mesh.material as THREE.Material).dispose();
        } else {
          remainingShockwaves.push(sw);
        }
      });
      activeShockwavesRef.current = remainingShockwaves;

      // Animate Laser Surges along conduits
      const remainingSurges: ActiveLaserSurge[] = [];
      activeLaserSurgesRef.current.forEach((surge) => {
        const progress = (nowSec - surge.startTime) / surge.duration;
        if (progress >= 0 && progress <= 1.0) {
          const headPos = surge.curve.getPoint(progress);
          surge.headMesh.position.copy(headPos);

          surge.trailMeshes.forEach((tm, idx) => {
            const trailProgress = Math.max(0, progress - (idx + 1) * 0.04);
            const trailPos = surge.curve.getPoint(trailProgress);
            tm.position.copy(trailPos);
          });
          remainingSurges.push(surge);
        } else if (progress > 1.0) {
          surge.headMesh.parent?.remove(surge.headMesh);
          surge.headMesh.geometry.dispose();
          (surge.headMesh.material as THREE.Material).dispose();
          surge.trailMeshes.forEach((tm) => {
            tm.parent?.remove(tm);
            tm.geometry.dispose();
            (tm.material as THREE.Material).dispose();
          });
        } else {
          remainingSurges.push(surge);
        }
      });
      activeLaserSurgesRef.current = remainingSurges;

      // Render Scene through UnrealBloomPass Composer
      composer.render();
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      composer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    getTacticalTableGridTexture,
    getRadarSweepTexture,
  ]);

  // -------------------------------------------------------------
  // 2. Build 3D Polyhedral Crystals & Holographic Infographics
  // -------------------------------------------------------------
  useEffect(() => {
    const polyhedraGroup = polyhedraGroupRef.current;
    if (!polyhedraGroup) return;

    disposeObjectHierarchy(polyhedraGroup);
    while (polyhedraGroup.children.length > 0) {
      polyhedraGroup.remove(polyhedraGroup.children[0]);
    }
    interactiveHitboxesRef.current = [];
    animatedCrystalsRef.current = [];

    // Distinct Region Names
    const regionNamesSet = new Set<string>();
    nodes.forEach((n) => regionNamesSet.add(n.region));
    Object.keys(REGIONS).forEach((reg) => regionNamesSet.add(reg));

    // Helper to generate a 3D gear mesh
    const createGearMesh = (teeth = 8, radius = 0.7, color = 0x38bdf8): THREE.Mesh => {
      const shape = new THREE.Shape();
      const toothDepth = 0.18;
      const stepAngle = (Math.PI * 2) / teeth;

      for (let i = 0; i < teeth; i++) {
        const a1 = i * stepAngle;
        const a2 = a1 + stepAngle * 0.35;
        const a3 = a1 + stepAngle * 0.65;
        const a4 = (i + 1) * stepAngle;

        const rIn = radius - toothDepth;
        const rOut = radius + toothDepth;

        if (i === 0) {
          shape.moveTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
        } else {
          shape.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
        }
        shape.lineTo(Math.cos(a2) * rOut, Math.sin(a2) * rOut);
        shape.lineTo(Math.cos(a3) * rOut, Math.sin(a3) * rOut);
        shape.lineTo(Math.cos(a4) * rIn, Math.sin(a4) * rIn);
      }

      // Center hole
      const holePath = new THREE.Path();
      holePath.absarc(0, 0, radius * 0.35, 0, Math.PI * 2, true);
      shape.holes.push(holePath);

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: 0.12,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.03,
        bevelThickness: 0.03,
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.8,
      });
      return new THREE.Mesh(geo, mat);
    };

    nodes.forEach((node, nodeIdx) => {
      const theme = REGIONS[node.region] || {
        name: node.region,
        color: '#06b6d4',
        emissiveColor: '#22d3ee',
        center: { x: 0, y: 0, z: 0 },
        description: 'Command Hub',
        islandRadius: 20,
      };

      const { x, y, z } = node.position;
      const crystalGroup = new THREE.Group();
      crystalGroup.position.set(x, y, z);
      crystalGroup.name = `crystal-${node.id}`;
      polyhedraGroup.add(crystalGroup);

      // A. Tactical Table Radar Pod (Anchored at Y = 0 on table surface)
      const radarPodGroup = new THREE.Group();
      radarPodGroup.position.set(0, -y + 0.05, 0); // table ground plane
      crystalGroup.add(radarPodGroup);

      const anchorTexture = getRadarAnchorTexture(
        node.status === 'COMPLETED' ? '#fbbf24' : theme.color
      );

      const outerRingGeo = new THREE.CircleGeometry(2.6, 32);
      outerRingGeo.rotateX(-Math.PI / 2);
      const outerRingMat = new THREE.MeshBasicMaterial({
        map: anchorTexture,
        transparent: true,
        opacity: node.status === 'COMPLETED' ? 0.9 : 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
      radarPodGroup.add(outerRingMesh);

      const middleRingGeo = new THREE.RingGeometry(1.6, 1.8, 32);
      middleRingGeo.rotateX(-Math.PI / 2);
      const middleRingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.color),
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const middleRingMesh = new THREE.Mesh(middleRingGeo, middleRingMat);
      radarPodGroup.add(middleRingMesh);

      const ticksRingGeo = new THREE.RingGeometry(2.8, 3.0, 32);
      ticksRingGeo.rotateX(-Math.PI / 2);
      const ticksRingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.emissiveColor),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ticksRingMesh = new THREE.Mesh(ticksRingGeo, ticksRingMat);
      radarPodGroup.add(ticksRingMesh);

      // Vertical Holographic Light Pillar Beam connecting table pod to floating crystal
      const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, y, 8);
      const beamMat = new THREE.MeshBasicMaterial({
        color: node.status === 'COMPLETED' ? 0xfbbf24 : new THREE.Color(theme.emissiveColor),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const baseBeam = new THREE.Mesh(beamGeo, beamMat);
      baseBeam.position.y = -y / 2;
      crystalGroup.add(baseBeam);

      const radarPod: AnimatedRadarPod = {
        group: radarPodGroup,
        outerRing: outerRingMesh,
        middleRing: middleRingMesh,
        ticksRing: ticksRingMesh,
        baseBeam,
      };

      // B. Core Polyhedral Crystal Geometry & Specular Faceted Material
      let coreGeo: THREE.BufferGeometry;
      let outerWireGeo: THREE.BufferGeometry;
      let coreMat: THREE.Material;
      let outerWireMat: THREE.Material;

      let gimbalRingX: THREE.Mesh | undefined;
      let gimbalRingZ: THREE.Mesh | undefined;
      let accretionRing: THREE.Mesh | undefined;
      let stasisShieldMesh: THREE.Mesh | undefined;
      const stasisNeedles: THREE.Mesh[] = [];
      let beaconSpire: THREE.Mesh | undefined;
      let sparkPoints: THREE.Points | undefined;
      let sparkAngles: Float32Array | undefined;
      let sparkHeights: Float32Array | undefined;
      let sparkSpeeds: Float32Array | undefined;

      if (node.status === 'COMPLETED') {
        // Radiant Golden Geodesic Icosahedron
        coreGeo = new THREE.IcosahedronGeometry(1.5, 1);
        outerWireGeo = new THREE.IcosahedronGeometry(1.9, 1);

        coreMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xfbbf24,
          emissiveIntensity: 1.4,
          roughness: 0.12,
          metalness: 0.88,
          flatShading: true,
        });

        outerWireMat = new THREE.MeshBasicMaterial({
          color: 0xfde047,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
        });

        // Saturn-like Accretion Ring around completed crystal
        const ringGeo = new THREE.RingGeometry(2.1, 3.4, 48);
        ringGeo.rotateX(-Math.PI / 2 + 0.35);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        accretionRing = new THREE.Mesh(ringGeo, ringMat);
        crystalGroup.add(accretionRing);

        // Ascended Sky Laser Spire
        const spireGeo = new THREE.CylinderGeometry(0.06, 0.06, 40, 12, 1, true);
        const spireMat = new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        beaconSpire = new THREE.Mesh(spireGeo, spireMat);
        beaconSpire.position.y = 20;
        crystalGroup.add(beaconSpire);

        // 36 Golden Stardust Particles
        const sparkCount = 36;
        const posArr = new Float32Array(sparkCount * 3);
        sparkAngles = new Float32Array(sparkCount);
        sparkHeights = new Float32Array(sparkCount);
        sparkSpeeds = new Float32Array(sparkCount);

        for (let s = 0; s < sparkCount; s++) {
          sparkAngles[s] = Math.random() * Math.PI * 2;
          sparkHeights[s] = Math.random() * 6.0;
          sparkSpeeds[s] = 1.0 + Math.random() * 2.2;
          posArr[s * 3] = Math.cos(sparkAngles[s]) * 2.5;
          posArr[s * 3 + 1] = sparkHeights[s] - 1.2;
          posArr[s * 3 + 2] = Math.sin(sparkAngles[s]) * 2.5;
        }

        const sparkGeo = new THREE.BufferGeometry();
        sparkGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        const sparkMat = new THREE.PointsMaterial({
          color: 0xfde047,
          size: 1.8,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        sparkPoints = new THREE.Points(sparkGeo, sparkMat);
        crystalGroup.add(sparkPoints);
      } else if (node.status === 'UNLOCKED') {
        // High-Energy Vibrant Octahedron Crystal (Fuchsia/Magenta or Cyan)
        coreGeo = new THREE.OctahedronGeometry(1.6, 0);
        outerWireGeo = new THREE.OctahedronGeometry(1.95, 0);

        const isMagenta = nodeIdx % 2 === 0;
        const nodeColor = isMagenta ? 0xd946ef : new THREE.Color(theme.color);
        const glowColor = isMagenta ? 0xf43f5e : new THREE.Color(theme.emissiveColor);

        coreMat = new THREE.MeshStandardMaterial({
          color: nodeColor,
          emissive: glowColor,
          emissiveIntensity: 1.35,
          roughness: 0.15,
          metalness: 0.85,
          flatShading: true,
        });

        outerWireMat = new THREE.MeshBasicMaterial({
          color: glowColor,
          wireframe: true,
          transparent: true,
          opacity: 0.8,
        });

        // Dual Orthogonal Gyroscopic Gimbal Rings
        const ringXGeo = new THREE.RingGeometry(2.1, 2.25, 48);
        const ringXMat = new THREE.MeshBasicMaterial({
          color: glowColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
        });
        gimbalRingX = new THREE.Mesh(ringXGeo, ringXMat);
        crystalGroup.add(gimbalRingX);

        const ringZGeo = new THREE.RingGeometry(2.35, 2.5, 48);
        ringZGeo.rotateX(Math.PI / 2);
        const ringZMat = new THREE.MeshBasicMaterial({
          color: glowColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
        });
        gimbalRingZ = new THREE.Mesh(ringZGeo, ringZMat);
        crystalGroup.add(gimbalRingZ);
      } else {
        // Locked Stasis Octahedron with Crimson Shield
        coreGeo = new THREE.OctahedronGeometry(1.5, 0);
        outerWireGeo = new THREE.OctahedronGeometry(1.8, 0);

        coreMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0xf43f5e,
          emissiveIntensity: 0.35,
          roughness: 0.75,
          metalness: 0.45,
          flatShading: true,
        });

        outerWireMat = new THREE.MeshBasicMaterial({
          color: 0x475569,
          wireframe: true,
          transparent: true,
          opacity: 0.45,
        });

        // Crimson Geodesic Wireframe Shield Cage
        const shieldGeo = new THREE.IcosahedronGeometry(2.2, 2);
        const shieldMat = new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        });
        stasisShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        crystalGroup.add(stasisShieldMesh);

        // 4 Crimson Laser Containment Needles
        for (let l = 0; l < 4; l++) {
          const angle = (l * Math.PI) / 2;
          const needleGeo = new THREE.CylinderGeometry(0.04, 0.04, 4.4, 8);
          const needleMat = new THREE.MeshBasicMaterial({
            color: 0xff1e42,
            transparent: true,
            opacity: 0.85,
          });
          const needle = new THREE.Mesh(needleGeo, needleMat);
          needle.position.set(Math.cos(angle) * 2.3, 0, Math.sin(angle) * 2.3);
          crystalGroup.add(needle);
          stasisNeedles.push(needle);
        }
      }

      const coreCrystal = new THREE.Mesh(coreGeo, coreMat);
      crystalGroup.add(coreCrystal);

      const outerWireframe = new THREE.Mesh(outerWireGeo, outerWireMat);
      crystalGroup.add(outerWireframe);

      // Core point light casting vibrant illumination onto conduits and table
      const pointLight = new THREE.PointLight(
        node.status === 'COMPLETED' ? 0xfbbf24 : new THREE.Color(theme.color),
        25,
        35
      );
      pointLight.position.set(0, 0, 0);
      crystalGroup.add(pointLight);

      // Invisible Raycast Hitbox
      const hitboxGeo = new THREE.SphereGeometry(2.8, 16, 16);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.userData = { nodeId: node.id };
      crystalGroup.add(hitbox);
      interactiveHitboxesRef.current.push(hitbox);

      // C. 3D Holographic Mini Bar Chart (Matching Reference Frames 5, 7, 9)
      let barChartGroup: THREE.Group | undefined;
      if (nodeIdx % 3 === 0 || node.id === 'ai-neural-nets' || node.id === 'fe-typescript-strict') {
        barChartGroup = new THREE.Group();
        barChartGroup.position.set(2.4, 1.4, -1.2);
        crystalGroup.add(barChartGroup);

        const barHeights = [0.6, 1.1, 1.8, 1.4, 2.2];
        const barPoints: THREE.Vector3[] = [];

        barHeights.forEach((bh, bIdx) => {
          const bx = (bIdx - 2) * 0.45;
          const barGeo = new THREE.BoxGeometry(0.25, bh, 0.25);
          const barMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            emissive: 0x22d3ee,
            emissiveIntensity: 1.5,
            roughness: 0.15,
            metalness: 0.85,
          });
          const barMesh = new THREE.Mesh(barGeo, barMat);
          barMesh.position.set(bx, bh / 2, 0);
          barChartGroup!.add(barMesh);

          barPoints.push(new THREE.Vector3(bx, bh + 0.1, 0));
        });

        // Top Trendline Spline over bars
        const trendCurve = new THREE.CatmullRomCurve3(barPoints);
        const trendGeo = new THREE.TubeGeometry(trendCurve, 32, 0.04, 8, false);
        const trendMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.95,
        });
        const trendMesh = new THREE.Mesh(trendGeo, trendMat);
        barChartGroup.add(trendMesh);
      }

      // D. 3D Holographic Interlocking Gears (Matching Optimization Nodes)
      let gearsGroup: AnimatedGearPair | undefined;
      if (
        node.id === 'ai-neural-nets' ||
        node.id === 'be-node-runtime' ||
        node.title.toLowerCase().includes('optimi')
      ) {
        const gearA = createGearMesh(8, 0.65, 0x38bdf8);
        gearA.position.set(-2.0, 1.6, 1.2);
        crystalGroup.add(gearA);

        const gearB = createGearMesh(8, 0.65, 0xa855f7);
        gearB.position.set(-1.0, 2.2, 1.2);
        crystalGroup.add(gearB);

        gearsGroup = { gearA, gearB };
      }

      // E. Science & Math Formula Billboard (Frames 7, 9)
      let formulaSprite: THREE.Sprite | undefined;
      const formulas = MATHEMATICAL_FORMULAS[node.region] || [];
      if (formulas.length > 0) {
        const formulaText = formulas[nodeIdx % formulas.length];
        const formTexture = getFormulaTexture(formulaText, theme.emissiveColor);
        const formMat = new THREE.SpriteMaterial({
          map: formTexture,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        formulaSprite = new THREE.Sprite(formMat);
        formulaSprite.scale.set(7.5, 1.85, 1);
        formulaSprite.position.set(0, 2.8, 1.4);
        crystalGroup.add(formulaSprite);
      }

      // F. 3D Typography Leader Badge (Frames 1, 5, 9)
      const stepNumber = `#${String(nodeIdx + 1).padStart(2, '0')}`;
      const leaderTexture = getLeaderLabelTexture(node, stepNumber, theme.color);
      const leaderMat = new THREE.SpriteMaterial({
        map: leaderTexture,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const leaderSprite = new THREE.Sprite(leaderMat);
      leaderSprite.scale.set(8.5, 2.3, 1);
      leaderSprite.position.set(3.8, 3.4, 0);
      crystalGroup.add(leaderSprite);

      // Angled leader line connecting crystal to label
      const lineGeo = new THREE.BufferGeometry();
      const linePoints = new Float32Array([
        0, 1.6, 0, // Apex of crystal
        2.2, 3.4, 0, // Elbow
        3.8, 3.4, 0, // Sprite anchor
      ]);
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePoints, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(theme.color),
        transparent: true,
        opacity: 0.85,
        linewidth: 2,
      });
      const leaderLine = new THREE.Line(lineGeo, lineMat);
      crystalGroup.add(leaderLine);

      // G. Subtask Radial Concept Diamond Chips
      const satelliteChips: AnimatedSatelliteChip[] = [];
      const subTasks = node.subTasks || [];
      subTasks.forEach((st, stIdx) => {
        const chipRadius = 3.2 + stIdx * 0.7;
        const chipGeo = new THREE.OctahedronGeometry(0.36, 0);
        const chipMat = new THREE.MeshStandardMaterial({
          color: st.completed ? 0x10b981 : 0x38bdf8,
          emissive: st.completed ? 0x34d399 : 0x0284c7,
          emissiveIntensity: st.completed ? 1.6 : 1.0,
          roughness: 0.2,
          metalness: 0.85,
          flatShading: true,
        });
        const chipMesh = new THREE.Mesh(chipGeo, chipMat);
        crystalGroup.add(chipMesh);

        // Radial filament line from center to chip
        const filamentGeo = new THREE.BufferGeometry();
        const filamentPts = new Float32Array([0, 0, 0, 0, 0, 0]);
        filamentGeo.setAttribute('position', new THREE.BufferAttribute(filamentPts, 3));
        const filamentMat = new THREE.LineBasicMaterial({
          color: st.completed ? 0x34d399 : 0x38bdf8,
          transparent: true,
          opacity: 0.75,
        });
        const filamentLine = new THREE.Line(filamentGeo, filamentMat);
        crystalGroup.add(filamentLine);

        // Subtask floating mini label pill
        const subLabelTex = getSubtaskLabelTexture(st.title, st.completed);
        const subLabelMat = new THREE.SpriteMaterial({
          map: subLabelTex,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
        });
        const subLabelSprite = new THREE.Sprite(subLabelMat);
        subLabelSprite.scale.set(3.2, 0.8, 1);
        chipMesh.add(subLabelSprite);
        subLabelSprite.position.set(0, 0.65, 0);

        satelliteChips.push({
          mesh: chipMesh,
          angle: (stIdx * Math.PI) / 2 + nodeIdx * 0.5,
          speed: 0.8 + stIdx * 0.3,
          radius: chipRadius,
          line: filamentLine,
          labelSprite: subLabelSprite,
        });
      });

      animatedCrystalsRef.current.push({
        nodeId: node.id,
        status: node.status,
        region: node.region,
        group: crystalGroup,
        coreCrystal,
        outerWireframe,
        gimbalRingX,
        gimbalRingZ,
        accretionRing,
        stasisShieldMesh,
        stasisNeedles,
        beaconSpire,
        radarPod,
        satelliteChips,
        sparkPoints,
        sparkAngles,
        sparkHeights,
        sparkSpeeds,
        barChartGroup,
        gearsGroup,
        formulaSprite,
        leaderLabel: {
          sprite: leaderSprite,
          line: leaderLine,
        },
        rotationSpeed: 0.45 + (nodeIdx % 3) * 0.15,
        basePos: new THREE.Vector3(node.position.x, node.position.y, node.position.z),
        baseMaterials: [coreMat],
      });
    });
  }, [
    nodes,
    disposeObjectHierarchy,
    getRadarAnchorTexture,
    getLeaderLabelTexture,
    getFormulaTexture,
    getSubtaskLabelTexture,
  ]);

  // -------------------------------------------------------------
  // 3. Build Interstellar Warp Conduits & Traveling Photons
  // -------------------------------------------------------------
  useEffect(() => {
    const warpRoadsGroup = warpRoadsGroupRef.current;
    if (!warpRoadsGroup) return;

    disposeObjectHierarchy(warpRoadsGroup);
    while (warpRoadsGroup.children.length > 0) {
      warpRoadsGroup.remove(warpRoadsGroup.children[0]);
    }
    animatedConduitsRef.current = [];

    edges.forEach((edge, edgeIdx) => {
      const fromNode = nodesMap.get(edge.fromNodeId);
      const toNode = nodesMap.get(edge.toNodeId);
      if (!fromNode || !toNode) return;

      const pFrom = new THREE.Vector3(fromNode.position.x, fromNode.position.y, fromNode.position.z);
      const pTo = new THREE.Vector3(toNode.position.x, toNode.position.y, toNode.position.z);
      const dist = pFrom.distanceTo(pTo);

      // Elevated Space Warp Curve
      const pMid = new THREE.Vector3().addVectors(pFrom, pTo).multiplyScalar(0.5);
      pMid.y = Math.max(pFrom.y, pTo.y) + 2.5 + dist * 0.08;
      const warpCurve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);

      const isCompleted = fromNode.status === 'COMPLETED';
      const isUnlocked = fromNode.status === 'UNLOCKED';

      // Outer Translucent Glass Tube
      const tubeGeo = new THREE.TubeGeometry(warpCurve, 64, 0.12, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: isCompleted ? 0xfbbf24 : isUnlocked ? 0x06b6d4 : 0x334155,
        transparent: true,
        opacity: isCompleted ? 0.45 : isUnlocked ? 0.35 : 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      warpRoadsGroup.add(tubeMesh);

      // Inner Laser Core
      const laserGeo = new THREE.TubeGeometry(warpCurve, 64, 0.035, 6, false);
      const laserMat = new THREE.MeshBasicMaterial({
        color: isCompleted ? 0xffffff : isUnlocked ? 0x38bdf8 : 0x1e293b,
        transparent: true,
        opacity: isCompleted ? 0.95 : isUnlocked ? 0.75 : 0.3,
        depthWrite: false,
      });
      const laserMesh = new THREE.Mesh(laserGeo, laserMat);
      warpRoadsGroup.add(laserMesh);

      // Traveling Photonic Pulses with Comet Tails
      const parts: WarpCometPart[] = [];
      const trailCount = isCompleted ? 4 : 2;

      for (let t = 0; t < trailCount; t++) {
        const cometGeo = new THREE.SphereGeometry(0.3 - t * 0.06, 12, 12);
        const cometMat = new THREE.MeshBasicMaterial({
          color: isCompleted ? (t === 0 ? 0xffffff : 0xf59e0b) : 0x38bdf8,
          transparent: true,
          opacity: 0.95 - t * 0.22,
          depthWrite: false,
        });
        const cometMesh = new THREE.Mesh(cometGeo, cometMat);
        warpRoadsGroup.add(cometMesh);
        parts.push({
          mesh: cometMesh,
          trailOffset: t * 0.032,
        });
      }

      animatedConduitsRef.current.push({
        curve: warpCurve,
        parts,
        speed: isCompleted ? 0.16 : 0.09,
        offset: (edgeIdx * 0.25) % 1.0,
        edgeId: edge.id,
      });
    });
  }, [edges, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 4. Active Node Selection Reticle
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

    // Dual Targeting Hologram Rings
    const ring1Geo = new THREE.RingGeometry(2.8, 3.1, 48);
    ring1Geo.rotateX(-Math.PI / 2);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.position.set(x, y, z);
    selectionGroup.add(ring1);

    const ring2Geo = new THREE.RingGeometry(3.3, 3.5, 48);
    ring2Geo.rotateX(-Math.PI / 2);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.position.set(x, y, z);
    selectionGroup.add(ring2);
  }, [selectedNodeId, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 5. Raycasting Pointer Events
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
      const intersects = raycasterRef.current.intersectObjects(
        interactiveHitboxesRef.current,
        false
      );

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

          // Screen space projection
          const worldPos = new THREE.Vector3();
          hitMesh.getWorldPosition(worldPos);
          worldPos.y += 2.8;
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
      const intersects = raycasterRef.current.intersectObjects(
        interactiveHitboxesRef.current,
        false
      );

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

  // Zoom & View Mode Controls
  const handleZoomIn = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
    camera.position.addScaledVector(dir, 10);
    controls.update();
  };

  const handleZoomOut = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    camera.position.addScaledVector(dir, 10);
    controls.update();
  };

  const toggleViewMode = () => {
    if (viewMode === 'perspective') {
      setViewMode('isometric');
      targetCamPosRef.current.set(42, 46, 42);
      targetControlsLookAtRef.current.set(0, 2, 0);
      isTransitioningCameraRef.current = true;
    } else if (viewMode === 'isometric') {
      setViewMode('topdown');
      targetCamPosRef.current.set(0, 85, 0.1);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    } else {
      setViewMode('perspective');
      targetCamPosRef.current.set(38, 36, 42);
      targetControlsLookAtRef.current.set(0, 2, 0);
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
      className={`relative w-full h-full overflow-hidden select-none bg-[#020409] ${className}`}
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
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-semibold truncate flex items-center gap-1">
                <Globe2 className="w-3 h-3 text-cyan-400" />
                {hoveredTooltip.node.region}
              </span>

              {hoveredTooltip.node.status === 'COMPLETED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Completed
                </span>
              )}
              {hoveredTooltip.node.status === 'UNLOCKED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Active Matrix
                </span>
              )}
              {hoveredTooltip.node.status === 'LOCKED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  <Lock className="w-3 h-3 text-slate-500" />
                  In Stasis
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
              {hoveredTooltip.node.title}
            </h4>

            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="font-mono text-amber-400 font-semibold">
                +{hoveredTooltip.node.xpReward} XP
              </span>
              <span className="text-[11px] text-slate-400">
                {hoveredTooltip.node.prerequisites.length === 0
                  ? 'Foundational Hub'
                  : `${hoveredTooltip.node.prerequisites.length} prerequisite conduit${
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
            viewMode === 'perspective'
              ? 'text-cyan-400 border-cyan-500/50 bg-cyan-950/60'
              : 'text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 bg-slate-900/85 border-slate-800'
          }`}
        >
          {viewMode === 'perspective' && <Compass className="w-4 h-4" />}
          {viewMode === 'isometric' && <Box className="w-4 h-4" />}
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

      {/* Floating Region Quick Jump Bar */}
      {activeRegionsList.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 hidden sm:flex items-center gap-2 pointer-events-auto bg-slate-950/85 p-1.5 rounded-2xl border border-cyan-500/30 backdrop-blur-md shadow-2xl shadow-cyan-950/60">
          {activeRegionsList.map(([regionName, theme]) => (
            <button
              key={regionName}
              onClick={() => jumpToRegion(regionName)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all border border-transparent hover:border-cyan-500/40 cursor-pointer"
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
