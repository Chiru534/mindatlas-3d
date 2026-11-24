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

interface AnimatedSatelliteMoon {
  mesh: THREE.Mesh;
  angle: number;
  speed: number;
  radius: number;
  inclination: number;
}

interface AnimatedPlanet {
  nodeId: string;
  status: NodeStatus;
  region: string;
  group: THREE.Group;
  planetMesh: THREE.Mesh;
  ringsMesh?: THREE.Mesh;
  stasisShieldMesh?: THREE.Mesh;
  stasisNeedles: THREE.Mesh[];
  beaconSpire?: THREE.Mesh;
  satelliteMoons: AnimatedSatelliteMoon[];
  orbitRingMesh?: THREE.Mesh;
  sparkPoints?: THREE.Points;
  sparkAngles?: Float32Array;
  sparkHeights?: Float32Array;
  sparkSpeeds?: Float32Array;
  rotationSpeed: number;
  basePos: THREE.Vector3;
  baseMaterials: THREE.Material[];
}

interface AnimatedGalacticCore {
  group: THREE.Group;
  sunCore: THREE.Mesh;
  coronaMesh: THREE.Mesh;
  accretionDisk: THREE.Mesh;
  pointLight: THREE.PointLight;
  regionName: string;
}

interface WarpCometPart {
  mesh: THREE.Mesh;
  trailOffset: number;
}

interface AnimatedWarpComet {
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
  const galaxiesGroupRef = useRef<THREE.Group | null>(null);
  const warpRoadsGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const shockwavesGroupRef = useRef<THREE.Group | null>(null);

  // Dynamic Scene Animations
  const interactiveHitboxesRef = useRef<THREE.Mesh[]>([]);
  const animatedPlanetsRef = useRef<AnimatedPlanet[]>([]);
  const animatedGalaxiesRef = useRef<AnimatedGalacticCore[]>([]);
  const animatedCometsRef = useRef<AnimatedWarpComet[]>([]);
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
  const [viewMode, setViewMode] = useState<'isometric' | 'perspective' | 'topdown'>('isometric');

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

  // 1. Procedural Terraformed Planet Canvas Texture (512 x 256)
  const getTerraformedPlanetTexture = useCallback((themeColor: string): THREE.CanvasTexture => {
    const key = `terraformed-${themeColor}`;
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Ocean Base Gradient
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, 256);
      oceanGrad.addColorStop(0, '#02182b');
      oceanGrad.addColorStop(0.5, '#053852');
      oceanGrad.addColorStop(1, '#02182b');
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, 512, 256);

      // Continent Landmasses
      ctx.fillStyle = themeColor;
      for (let i = 0; i < 18; i++) {
        const cx = (i * 73 + 45) % 512;
        const cy = 60 + ((i * 37) % 136);
        const radius = 25 + (i % 5) * 8;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Sub-islands
        ctx.beginPath();
        ctx.arc((cx + 25) % 512, cy + 15, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Golden Continental Accents
      ctx.fillStyle = '#f59e0b';
      for (let j = 0; j < 8; j++) {
        const cx = (j * 110 + 20) % 512;
        const cy = 80 + ((j * 40) % 100);
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Atmospheric Cloud Swirls
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let c = 0; c < 12; c++) {
        const y = 30 + c * 18;
        ctx.fillRect(0, y, 512, 3 + (c % 4));
      }

      // Polar Ice Caps
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(0, 0, 512, 16);
      ctx.fillRect(0, 240, 512, 16);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 2. Procedural Active Bioluminescent Planet Texture (512 x 256)
  const getActivePlanetTexture = useCallback((themeColor: string): THREE.CanvasTexture => {
    const key = `active-${themeColor}`;
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Midnight Tech Base
      ctx.fillStyle = '#060d1a';
      ctx.fillRect(0, 0, 512, 256);

      // Bioluminescent Tectonic Grid Lines
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 8;

      // Latitude lines
      for (let y = 32; y < 256; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }

      // Longitude lines
      for (let x = 32; x < 512; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }

      // Energy Nexus Nodes
      ctx.fillStyle = '#38bdf8';
      for (let n = 0; n < 24; n++) {
        const nx = (n * 64 + 16) % 512;
        const ny = (n * 32 + 16) % 256;
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 3. Procedural Cryo-Stasis Planet Texture (512 x 256)
  const getCryoStasisPlanetTexture = useCallback((): THREE.CanvasTexture => {
    const key = 'cryo-stasis';
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dark Volcanic Obsidian Base
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, 512, 256);

      // Frozen Ice Cracks
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        let curX = (i * 35) % 512;
        let curY = 30 + (i * 15) % 200;
        ctx.moveTo(curX, curY);
        for (let s = 0; s < 5; s++) {
          curX = (curX + 25) % 512;
          curY = Math.max(10, Math.min(240, curY + (s % 2 === 0 ? 15 : -12)));
          ctx.lineTo(curX, curY);
        }
        ctx.stroke();
      }

      // Crimson Stasis Latitude Warning Bands
      ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
      ctx.fillRect(0, 64, 512, 6);
      ctx.fillRect(0, 128, 512, 8);
      ctx.fillRect(0, 192, 512, 6);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 4. Procedural Accretion Disk Ring Texture (1024 x 128)
  const getAccretionRingTexture = useCallback((themeColor: string): THREE.CanvasTexture => {
    const key = `accretion-${themeColor}`;
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 1024, 128);
      const grad = ctx.createLinearGradient(0, 0, 1024, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.2, themeColor);
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(0.8, themeColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 128);

      // Fine concentric division lines
      ctx.fillStyle = 'rgba(2, 4, 10, 0.7)';
      for (let x = 120; x < 900; x += 40) {
        ctx.fillRect(x, 0, 8, 128);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexturesRef.current.set(key, texture);
    return texture;
  }, []);

  // 5. Procedural Astrolabe Ground Vector Canvas Texture (2048 x 2048)
  const getAstrolabeTexture = useCallback((): THREE.CanvasTexture => {
    const key = 'astrolabe-grid';
    if (cachedTexturesRef.current.has(key)) return cachedTexturesRef.current.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 2048, 2048);
      const cx = 1024;
      const cy = 1024;

      // Concentric Celestial Astrolabe Rings
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

      // Azimuth Radial Spokes & Degree Notches
      ctx.setLineDash([]);
      for (let deg = 0; deg < 360; deg += 10) {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const isMajor = deg % 30 === 0;

        const innerR = isMajor ? 820 : 860;
        const outerR = 880;

        ctx.beginPath();
        ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.3)';
        ctx.lineWidth = isMajor ? 2.5 : 1;
        ctx.stroke();

        if (isMajor) {
          const tx = cx + cos * 920;
          const ty = cy + sin * 920;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(rad + Math.PI / 2);
          ctx.font = 'bold 20px monospace';
          ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
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

  // 6. Procedural Holographic Radar Sweep Texture (1024 x 1024)
  const getRadarSweepTexture = useCallback((): THREE.CanvasTexture => {
    const key = 'radar-sweep';
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
              if (stdMat.map && !Array.from(cachedTexturesRef.current.values()).includes(stdMat.map as THREE.CanvasTexture)) {
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

  // Smooth Camera Lerp Trigger with Asymmetric Viewport Framing when Drawer is Open
  const focusCameraOnPosition = useCallback(
    (x: number, y: number, z: number, immediate = false, drawerOpen = false) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      let camX = x + 18;
      let camY = y + 15;
      let camZ = z + 20;

      if (viewMode === 'topdown') {
        camX = x;
        camY = y + 75;
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

  // Reset Camera to 45-Degree Overview
  const resetCameraToOverview = useCallback(() => {
    targetCamPosRef.current.set(48, 56, 48);
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

  // React to selectedNodeId and isDrawerOpen change
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

      // Stage 1: Golden Planetary Shockwave Ring
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
      shockMesh.position.set(x, y, z);
      shockMesh.scale.set(0.2, 0.2, 0.2);
      shockwavesGroup.add(shockMesh);

      activeShockwavesRef.current.push({
        mesh: shockMesh,
        startTime: now + 0.1,
        duration: 1.4,
        initialScale: 0.2,
        maxScale: 28.0,
      });

      // Stage 2: High-Velocity Warp Conduit Laser Surges along outgoing edges
      const outgoingEdges = edges.filter((e) => e.fromNodeId === completedNode.id);
      outgoingEdges.forEach((edge) => {
        const targetNode = nodesMap.get(edge.toNodeId);
        if (!targetNode) return;

        const pFrom = new THREE.Vector3(x, y, z);
        const pTo = new THREE.Vector3(targetNode.position.x, targetNode.position.y, targetNode.position.z);
        const dist = pFrom.distanceTo(pTo);
        const pMid = new THREE.Vector3().addVectors(pFrom, pTo).multiplyScalar(0.5);
        pMid.y = Math.max(pFrom.y, pTo.y) + 3.0 + dist * 0.1;
        const surgeCurve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);

        // Laser surge head
        const surgeHeadGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const surgeHeadMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const surgeHeadMesh = new THREE.Mesh(surgeHeadGeo, surgeHeadMat);
        surgeHeadMesh.position.copy(pFrom);
        shockwavesGroup.add(surgeHeadMesh);

        // Trailing surge packets
        const trailMeshes: THREE.Mesh[] = [];
        for (let t = 0; t < 3; t++) {
          const trailGeo = new THREE.SphereGeometry(0.35 - t * 0.08, 12, 12);
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

  // Monitor nodes to detect new completions
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

    // 1. Deep Obsidian Space Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x02040a);
    scene.fog = new THREE.FogExp2(0x02040a, 0.0042);

    // 2. Perspective Camera
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 1200);
    camera.position.set(48, 56, 48);
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

    // 4. UnrealBloomPass Pipeline (Threshold: 0.78, Strength: 1.35)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.35, // strength: glowing planetary atmospheres & stellar coronas
      0.42, // radius: tight, crisp glow halo
      0.78  // threshold: triggers glow on true high emissives
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // 5. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 8;
    controls.maxDistance = 250;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const onControlsStart = () => {
      isTransitioningCameraRef.current = false;
    };
    controls.addEventListener('start', onControlsStart);

    // 6. Scene Hierarchy Groups
    const galaxiesGroup = new THREE.Group();
    galaxiesGroup.name = 'galaxies-group';
    scene.add(galaxiesGroup);
    galaxiesGroupRef.current = galaxiesGroup;

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

    // 7. Cinematic Ambient & Celestial Lights
    const ambientLight = new THREE.AmbientLight(0x0b172a, 1.4);
    scene.add(ambientLight);

    const starClusterLight1 = new THREE.DirectionalLight(0x38bdf8, 2.5);
    starClusterLight1.position.set(60, 80, 50);
    scene.add(starClusterLight1);

    const starClusterLight2 = new THREE.DirectionalLight(0xa855f7, 1.8);
    starClusterLight2.position.set(-50, -30, -50);
    scene.add(starClusterLight2);

    // 8. Celestial Astrolabe Ground Plane at Y = -18
    const groundDiscGeo = new THREE.CircleGeometry(180, 64);
    groundDiscGeo.rotateX(-Math.PI / 2);
    const groundDiscMat = new THREE.MeshStandardMaterial({
      color: 0x020409,
      roughness: 0.15,
      metalness: 0.95,
    });
    const groundDisc = new THREE.Mesh(groundDiscGeo, groundDiscMat);
    groundDisc.position.y = -18.0;
    scene.add(groundDisc);

    // Astrolabe Grid Vector Overlay
    const astrolabePlaneGeo = new THREE.PlaneGeometry(360, 360);
    astrolabePlaneGeo.rotateX(-Math.PI / 2);
    const astrolabeMat = new THREE.MeshBasicMaterial({
      map: getAstrolabeTexture(),
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const astrolabePlane = new THREE.Mesh(astrolabePlaneGeo, astrolabeMat);
    astrolabePlane.position.y = -17.92;
    scene.add(astrolabePlane);

    // Rotating 360-Degree Holographic Radar Plane Sweep
    const radarGeo = new THREE.CircleGeometry(160, 64);
    radarGeo.rotateX(-Math.PI / 2);
    const radarMat = new THREE.MeshBasicMaterial({
      map: getRadarSweepTexture(),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const radarMesh = new THREE.Mesh(radarGeo, radarMat);
    radarMesh.position.y = -17.85;
    scene.add(radarMesh);
    radarSweepMeshRef.current = radarMesh;

    // 9. Two-Tier Cosmic Starfield: 1,200 Stars + 400 Nebula Dust Clouds
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starPalette = [
      new THREE.Color(0x38bdf8),
      new THREE.Color(0x818cf8),
      new THREE.Color(0xfbbf24),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < starCount; i++) {
      const radius = 90 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.max(-5, radius * Math.sin(phi) * Math.sin(theta));
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
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);

    // 10. Handle Window Resize
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

    // 11. 60 FPS Render & Physics Animation Loop
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

      // Rotate Radar Sweep
      if (radarSweepMeshRef.current) {
        radarSweepMeshRef.current.rotation.z = -elapsedTime * 0.45;
      }

      // Rotate Galactic Core Suns & Coronas
      animatedGalaxiesRef.current.forEach((galaxy) => {
        galaxy.sunCore.rotation.y = elapsedTime * 0.35;
        galaxy.coronaMesh.rotation.y = -elapsedTime * 0.2;
        const pulse = 1.0 + Math.sin(elapsedTime * 2.5) * 0.06;
        galaxy.coronaMesh.scale.set(pulse, pulse, pulse);
        galaxy.accretionDisk.rotation.z = elapsedTime * 0.18;
      });

      // Animate Planets, Rings, Satellites, and Spires
      animatedPlanetsRef.current.forEach((p) => {
        // Planetary axial spin
        p.planetMesh.rotation.y = elapsedTime * p.rotationSpeed;

        if (p.ringsMesh) {
          p.ringsMesh.rotation.z = elapsedTime * 0.12;
        }

        // Subtask Moonlet Satellites
        p.satelliteMoons.forEach((moon) => {
          moon.angle += moon.speed * delta;
          const mx = Math.cos(moon.angle) * moon.radius;
          const mz = Math.sin(moon.angle) * moon.radius;
          const my = Math.sin(moon.angle + moon.inclination) * 0.4;
          moon.mesh.position.set(mx, my, mz);
          moon.mesh.rotation.y += delta * 1.5;
        });

        // Stasis Shield & Needles for LOCKED planets
        if (p.status === 'LOCKED' && p.stasisShieldMesh) {
          p.stasisShieldMesh.rotation.y = elapsedTime * 0.4;
          p.stasisShieldMesh.rotation.x = Math.sin(elapsedTime * 0.5) * 0.2;
          const shieldMat = p.stasisShieldMesh.material as THREE.MeshBasicMaterial;
          shieldMat.opacity = 0.35 + Math.sin(elapsedTime * 3.5) * 0.15;

          p.stasisNeedles.forEach((needle, idx) => {
            const needleMat = needle.material as THREE.MeshBasicMaterial;
            needleMat.opacity = 0.65 + Math.sin(elapsedTime * 4.0 + idx) * 0.25;
          });
        }

        // Ascended Golden Corona & Stardust for COMPLETED planets
        if (p.status === 'COMPLETED') {
          if (p.sparkPoints && p.sparkAngles && p.sparkHeights && p.sparkSpeeds) {
            const posAttr = p.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
            for (let s = 0; s < p.sparkAngles.length; s++) {
              p.sparkHeights[s] = (p.sparkHeights[s] + delta * p.sparkSpeeds[s]) % 6.0;
              p.sparkAngles[s] += delta * 1.6;
              const sy = p.sparkHeights[s] - 1.0;
              const sr = 2.4 * Math.max(0.3, 1.0 - sy / 8.0);
              const sx = Math.cos(p.sparkAngles[s]) * sr;
              const sz = Math.sin(p.sparkAngles[s]) * sr;
              posAttr.setXYZ(s, sx, sy, sz);
            }
            posAttr.needsUpdate = true;
          }

          if (p.beaconSpire) {
            const spireMat = p.beaconSpire.material as THREE.MeshBasicMaterial;
            spireMat.opacity = 0.75 + Math.sin(elapsedTime * 4.0) * 0.2;
          }
        }
      });

      // Animate Warp Conduits Photonic Comets
      animatedCometsRef.current.forEach((comet) => {
        const tHead = (elapsedTime * comet.speed + comet.offset) % 1.0;

        comet.parts.forEach((part) => {
          const rawT = tHead - part.trailOffset;
          if (rawT < 0 || rawT > 1.0) {
            part.mesh.visible = false;
          } else {
            part.mesh.visible = true;
            const pt = comet.curve.getPointAt(rawT);
            part.mesh.position.copy(pt);
          }
        });
      });

      // Animate Laser Surges along Conduits
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
          shockwavesGroupRef.current?.remove(surge.headMesh);
          surge.trailMeshes.forEach((tm) => shockwavesGroupRef.current?.remove(tm));
          surge.headMesh.geometry.dispose();
          if (surge.headMesh.material instanceof THREE.Material) surge.headMesh.material.dispose();
          surge.trailMeshes.forEach((tm) => {
            tm.geometry.dispose();
            if (tm.material instanceof THREE.Material) tm.material.dispose();
          });
        }
      });
      activeLaserSurgesRef.current = survivingSurges;

      // Animate Active Shockwaves
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
          shockwavesGroupRef.current?.remove(sw.mesh);
          sw.mesh.geometry.dispose();
          if (sw.mesh.material instanceof THREE.Material) sw.mesh.material.dispose();
        }
      });
      activeShockwavesRef.current = survivingShockwaves;

      // Render with UnrealBloomPass
      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // Cleanup Lifecycle
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

      cachedTexturesRef.current.forEach((tex) => tex.dispose());
      cachedTexturesRef.current.clear();

      disposeObjectHierarchy(scene);
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [disposeObjectHierarchy, getAstrolabeTexture, getRadarSweepTexture]);

  // -------------------------------------------------------------
  // 2. Build Galactic Subject Star Systems & 3D Planets
  // -------------------------------------------------------------
  useEffect(() => {
    const galaxiesGroup = galaxiesGroupRef.current;
    if (!galaxiesGroup) return;

    disposeObjectHierarchy(galaxiesGroup);
    while (galaxiesGroup.children.length > 0) {
      galaxiesGroup.remove(galaxiesGroup.children[0]);
    }
    interactiveHitboxesRef.current = [];
    animatedPlanetsRef.current = [];
    animatedGalaxiesRef.current = [];

    // Distinct Region Names
    const regionNamesSet = new Set<string>();
    nodes.forEach((n) => regionNamesSet.add(n.region));
    Object.keys(REGIONS).forEach((reg) => regionNamesSet.add(reg));

    regionNamesSet.forEach((regionName) => {
      const theme = REGIONS[regionName] || {
        name: regionName,
        color: '#06b6d4',
        emissiveColor: '#22d3ee',
        center: { x: 0, y: 0, z: 0 },
        description: 'Deep Space Subject Galaxy',
        islandRadius: 24,
      };

      const regionNodes = nodes.filter((n) => n.region === regionName);
      const completedCount = regionNodes.filter((n) => n.status === 'COMPLETED').length;

      // Subject Galaxy Container Group
      const galaxyGroup = new THREE.Group();
      galaxyGroup.position.set(theme.center.x, theme.center.y, theme.center.z);
      galaxiesGroup.add(galaxyGroup);

      // A. Central Galactic Core Sun
      const sunGeo = new THREE.SphereGeometry(2.8, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.color),
      });
      const sunCore = new THREE.Mesh(sunGeo, sunMat);
      sunCore.position.y = 2.0;
      galaxyGroup.add(sunCore);

      // B. Radiant Coronal Glow Shell
      const coronaGeo = new THREE.SphereGeometry(4.0, 32, 32);
      const coronaMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.emissiveColor),
        transparent: true,
        opacity: 0.38,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
      coronaMesh.position.y = 2.0;
      galaxyGroup.add(coronaMesh);

      // C. Rotating Stellar Accretion Disk Ring
      const accretionGeo = new THREE.RingGeometry(4.2, 8.8, 64);
      accretionGeo.rotateX(-Math.PI / 2 + 0.35); // Tilted accretion plane
      const accretionMat = new THREE.MeshBasicMaterial({
        map: getAccretionRingTexture(theme.color),
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const accretionDisk = new THREE.Mesh(accretionGeo, accretionMat);
      accretionDisk.position.y = 2.0;
      galaxyGroup.add(accretionDisk);

      // D. PointLight illuminating nearby planetary orbits
      const sunPointLight = new THREE.PointLight(new THREE.Color(theme.color), 35, 60);
      sunPointLight.position.y = 2.0;
      galaxyGroup.add(sunPointLight);

      // E. Floating Galactic Title Sprite
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = 'rgba(2, 6, 18, 0.88)';
        ctx.strokeStyle = theme.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(16, 16, 480, 96, 18);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = theme.color;
        ctx.shadowBlur = 12;
        ctx.fillText(theme.name.toUpperCase(), 256, 48);

        ctx.font = '600 16px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`SECTOR • ${completedCount}/${regionNodes.length} TERRAFORMED`, 256, 80);
      }

      const spriteTexture = new THREE.CanvasTexture(canvas);
      spriteTexture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({
        map: spriteTexture,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(16, 4, 1);
      sprite.position.set(0, 10.5, 0);
      galaxyGroup.add(sprite);

      animatedGalaxiesRef.current.push({
        group: galaxyGroup,
        sunCore,
        coronaMesh,
        accretionDisk,
        pointLight: sunPointLight,
        regionName,
      });

      // F. Construct 3D Celestial Planets for nodes in this galaxy
      regionNodes.forEach((node, nodeIdx) => {
        const localX = node.position.x - theme.center.x;
        const localY = node.position.y - theme.center.y;
        const localZ = node.position.z - theme.center.z;
        const orbitRadius = Math.sqrt(localX * localX + localZ * localZ);

        const planetGroup = new THREE.Group();
        planetGroup.position.set(localX, localY, localZ);
        planetGroup.name = `planet-${node.id}`;
        galaxyGroup.add(planetGroup);

        // Keplerian Orbit Ring around central star
        if (orbitRadius > 3.0) {
          const orbitGeo = new THREE.RingGeometry(orbitRadius - 0.06, orbitRadius + 0.06, 64);
          orbitGeo.rotateX(-Math.PI / 2);
          const orbitMat = new THREE.MeshBasicMaterial({
            color: node.status === 'COMPLETED' ? 0xfbbf24 : node.status === 'UNLOCKED' ? 0x06b6d4 : 0x1e293b,
            transparent: true,
            opacity: node.status === 'LOCKED' ? 0.25 : 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
          orbitMesh.position.y = 0.1;
          galaxyGroup.add(orbitMesh);
        }

        // Planetary Body (SphereGeometry 1.65 radius)
        const planetGeo = new THREE.SphereGeometry(1.65, 32, 32);
        let planetMat: THREE.Material;

        if (node.status === 'COMPLETED') {
          planetMat = new THREE.MeshStandardMaterial({
            map: getTerraformedPlanetTexture(theme.color),
            roughness: 0.25,
            metalness: 0.75,
            emissive: new THREE.Color(0xf59e0b),
            emissiveIntensity: 0.45,
          });
        } else if (node.status === 'UNLOCKED') {
          planetMat = new THREE.MeshStandardMaterial({
            map: getActivePlanetTexture(theme.color),
            roughness: 0.35,
            metalness: 0.85,
            emissive: new THREE.Color(theme.emissiveColor),
            emissiveIntensity: 0.65,
          });
        } else {
          planetMat = new THREE.MeshStandardMaterial({
            map: getCryoStasisPlanetTexture(),
            roughness: 0.75,
            metalness: 0.55,
            emissive: new THREE.Color(0xf43f5e),
            emissiveIntensity: 0.25,
          });
        }

        const planetMesh = new THREE.Mesh(planetGeo, planetMat);
        planetMesh.rotation.z = (23.5 * Math.PI) / 180; // Earth-like axial tilt
        planetGroup.add(planetMesh);

        // Invisible Raycast Hitbox
        const hitboxGeo = new THREE.SphereGeometry(2.8, 16, 16);
        const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
        hitbox.userData = { nodeId: node.id };
        planetGroup.add(hitbox);
        interactiveHitboxesRef.current.push(hitbox);

        let ringsMesh: THREE.Mesh | undefined;
        let stasisShieldMesh: THREE.Mesh | undefined;
        const stasisNeedles: THREE.Mesh[] = [];
        let beaconSpire: THREE.Mesh | undefined;
        let sparkPoints: THREE.Points | undefined;
        let sparkAngles: Float32Array | undefined;
        let sparkHeights: Float32Array | undefined;
        let sparkSpeeds: Float32Array | undefined;

        // COMPLETED PLANET: Saturn-like Planetary Rings + Ascended Orbital Spire + Stardust
        if (node.status === 'COMPLETED') {
          const ringGeo = new THREE.RingGeometry(2.2, 3.4, 64);
          ringGeo.rotateX(-Math.PI / 2 + 0.38);
          const ringMat = new THREE.MeshBasicMaterial({
            map: getAccretionRingTexture('#fbbf24'),
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          ringsMesh = new THREE.Mesh(ringGeo, ringMat);
          planetGroup.add(ringsMesh);

          // Ascended Sky Laser Spire
          const spireGeo = new THREE.CylinderGeometry(0.08, 0.08, 36, 12, 1, true);
          const spireMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          beaconSpire = new THREE.Mesh(spireGeo, spireMat);
          beaconSpire.position.y = 18;
          planetGroup.add(beaconSpire);

          // 32 Golden Stardust Particles
          const sparkCount = 32;
          const posArr = new Float32Array(sparkCount * 3);
          sparkAngles = new Float32Array(sparkCount);
          sparkHeights = new Float32Array(sparkCount);
          sparkSpeeds = new Float32Array(sparkCount);

          for (let s = 0; s < sparkCount; s++) {
            sparkAngles[s] = Math.random() * Math.PI * 2;
            sparkHeights[s] = Math.random() * 6.0;
            sparkSpeeds[s] = 1.0 + Math.random() * 2.2;
            posArr[s * 3] = Math.cos(sparkAngles[s]) * 2.5;
            posArr[s * 3 + 1] = sparkHeights[s] - 1.0;
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
          planetGroup.add(sparkPoints);
        }

        // UNLOCKED PLANET: Active Equator Telemetry Ring + Pulse Halo
        if (node.status === 'UNLOCKED') {
          const haloGeo = new THREE.RingGeometry(1.75, 1.95, 48);
          haloGeo.rotateX(-Math.PI / 2);
          const haloMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          ringsMesh = new THREE.Mesh(haloGeo, haloMat);
          planetGroup.add(ringsMesh);
        }

        // LOCKED PLANET: Pulsating Geodesic Hex-Stasis Shield & Crimson Needles
        if (node.status === 'LOCKED') {
          const shieldGeo = new THREE.IcosahedronGeometry(2.1, 2);
          const shieldMat = new THREE.MeshBasicMaterial({
            color: 0xf43f5e,
            wireframe: true,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          });
          stasisShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
          planetGroup.add(stasisShieldMesh);

          // 4 Crimson Laser Needles
          for (let l = 0; l < 4; l++) {
            const angle = (l * Math.PI) / 2;
            const needleGeo = new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8);
            const needleMat = new THREE.MeshBasicMaterial({
              color: 0xff1e42,
              transparent: true,
              opacity: 0.8,
            });
            const needle = new THREE.Mesh(needleGeo, needleMat);
            needle.position.set(Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2);
            planetGroup.add(needle);
            stasisNeedles.push(needle);
          }
        }

        // Subtask Moonlet Satellites
        const satelliteMoons: AnimatedSatelliteMoon[] = [];
        const subTasks = node.subTasks || [];
        subTasks.forEach((st, stIdx) => {
          const moonRadius = 2.4 + stIdx * 0.55;
          const moonGeo = new THREE.SphereGeometry(0.24, 16, 16);
          const moonMat = new THREE.MeshStandardMaterial({
            color: st.completed ? 0x10b981 : 0x38bdf8,
            emissive: st.completed ? 0x34d399 : 0x0284c7,
            emissiveIntensity: st.completed ? 1.8 : 0.9,
            roughness: 0.2,
            metalness: 0.8,
          });
          const moonMesh = new THREE.Mesh(moonGeo, moonMat);
          planetGroup.add(moonMesh);

          satelliteMoons.push({
            mesh: moonMesh,
            angle: (stIdx * Math.PI) / 2 + nodeIdx,
            speed: 1.2 + stIdx * 0.4,
            radius: moonRadius,
            inclination: (stIdx * 0.35),
          });
        });

        animatedPlanetsRef.current.push({
          nodeId: node.id,
          status: node.status,
          region: node.region,
          group: planetGroup,
          planetMesh,
          ringsMesh,
          stasisShieldMesh,
          stasisNeedles,
          beaconSpire,
          satelliteMoons,
          sparkPoints,
          sparkAngles,
          sparkHeights,
          sparkSpeeds,
          rotationSpeed: 0.35 + (nodeIdx % 3) * 0.15,
          basePos: new THREE.Vector3(node.position.x, node.position.y, node.position.z),
          baseMaterials: [planetMat],
        });
      });
    });
  }, [
    nodes,
    disposeObjectHierarchy,
    getTerraformedPlanetTexture,
    getActivePlanetTexture,
    getCryoStasisPlanetTexture,
    getAccretionRingTexture,
  ]);

  // -------------------------------------------------------------
  // 3. Build Interstellar Warp Conduits & Traveling Photonic Comets
  // -------------------------------------------------------------
  useEffect(() => {
    const warpRoadsGroup = warpRoadsGroupRef.current;
    if (!warpRoadsGroup) return;

    disposeObjectHierarchy(warpRoadsGroup);
    while (warpRoadsGroup.children.length > 0) {
      warpRoadsGroup.remove(warpRoadsGroup.children[0]);
    }
    animatedCometsRef.current = [];

    edges.forEach((edge, edgeIdx) => {
      const fromNode = nodesMap.get(edge.fromNodeId);
      const toNode = nodesMap.get(edge.toNodeId);
      if (!fromNode || !toNode) return;

      const pFrom = new THREE.Vector3(fromNode.position.x, fromNode.position.y, fromNode.position.z);
      const pTo = new THREE.Vector3(toNode.position.x, toNode.position.y, toNode.position.z);
      const dist = pFrom.distanceTo(pTo);

      // Elevated Space Warp Curve
      const pMid = new THREE.Vector3().addVectors(pFrom, pTo).multiplyScalar(0.5);
      pMid.y = Math.max(pFrom.y, pTo.y) + 3.2 + dist * 0.08;
      const warpCurve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);

      const isCompleted = fromNode.status === 'COMPLETED';
      const isUnlocked = fromNode.status === 'UNLOCKED';

      // Outer Translucent Glass Warp Tube
      const tubeGeo = new THREE.TubeGeometry(warpCurve, 64, 0.14, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: isCompleted ? 0xfbbf24 : isUnlocked ? 0x06b6d4 : 0x475569,
        transparent: true,
        opacity: isCompleted ? 0.45 : isUnlocked ? 0.3 : 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      warpRoadsGroup.add(tubeMesh);

      // Inner Laser Core
      const laserGeo = new THREE.TubeGeometry(warpCurve, 64, 0.038, 6, false);
      const laserMat = new THREE.MeshBasicMaterial({
        color: isCompleted ? 0xffffff : isUnlocked ? 0x38bdf8 : 0x334155,
        transparent: true,
        opacity: isCompleted ? 0.95 : isUnlocked ? 0.75 : 0.35,
        depthWrite: false,
      });
      const laserMesh = new THREE.Mesh(laserGeo, laserMat);
      warpRoadsGroup.add(laserMesh);

      // Photonic Traveling Comets
      const parts: WarpCometPart[] = [];
      const trailCount = isCompleted ? 4 : 2;

      for (let t = 0; t < trailCount; t++) {
        const cometGeo = new THREE.SphereGeometry(0.32 - t * 0.07, 12, 12);
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

      animatedCometsRef.current.push({
        curve: warpCurve,
        parts,
        speed: isCompleted ? 0.16 : 0.09,
        offset: (edgeIdx * 0.25) % 1.0,
        edgeId: edge.id,
      });
    });
  }, [edges, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 4. Active Planet Selection Reticle
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

    // Dual Targeting Rings
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
    if (viewMode === 'isometric') {
      setViewMode('perspective');
      targetCamPosRef.current.set(0, 56, 68);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    } else if (viewMode === 'perspective') {
      setViewMode('topdown');
      targetCamPosRef.current.set(0, 95, 0.1);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    } else {
      setViewMode('isometric');
      targetCamPosRef.current.set(48, 56, 48);
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
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-semibold truncate flex items-center gap-1">
                <Globe2 className="w-3 h-3 text-cyan-400" />
                {hoveredTooltip.node.region}
              </span>

              {hoveredTooltip.node.status === 'COMPLETED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Terraformed
                </span>
              )}
              {hoveredTooltip.node.status === 'UNLOCKED' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Active Orbit
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
                  ? 'Base Planet'
                  : `${hoveredTooltip.node.prerequisites.length} prerequisite warp${
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
