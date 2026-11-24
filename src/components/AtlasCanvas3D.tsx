import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  className?: string;
}

interface HoveredTooltipData {
  node: MapNode;
  screenX: number;
  screenY: number;
}

interface AnimatedLandmark {
  nodeId: string;
  status: NodeStatus;
  group: THREE.Group;
  crystalMesh?: THREE.Mesh;
  monolithMesh?: THREE.Mesh;
  containmentCage?: THREE.LineSegments;
  mistDome?: THREE.Mesh;
  runicRing1?: THREE.Mesh;
  runicRing2?: THREE.Mesh;
  satellites: THREE.Mesh[];
  auraPoints?: THREE.Points;
  crownSpire?: THREE.Mesh;
  crownJewel?: THREE.Mesh;
  skyBeam?: THREE.Mesh;
  baseY: number;
  phaseOffset: number;
  baseMaterials: THREE.Material[];
}

interface AnimatedEnergyPulse {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  speed: number;
  offset: number;
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

interface SpringingLandmark {
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
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Scene Hierarchy Groups
  const islandsGroupRef = useRef<THREE.Group | null>(null);
  const landmarksGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const fogGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const shockwavesGroupRef = useRef<THREE.Group | null>(null);

  // Animation & Dynamics State
  const interactiveHitboxesRef = useRef<THREE.Mesh[]>([]);
  const animatedLandmarksRef = useRef<AnimatedLandmark[]>([]);
  const animatedPulsesRef = useRef<AnimatedEnergyPulse[]>([]);
  const animatedFogRegionsRef = useRef<AnimatedFogRegion[]>([]);
  const islandLevitationsRef = useRef<IslandLevitationData[]>([]);
  const activeShockwavesRef = useRef<ActiveShockwave[]>([]);
  const springingLandmarksRef = useRef<Map<string, SpringingLandmark>>(new Map());
  const radarRingsRef = useRef<THREE.Group | null>(null);

  // Tracking Completed Nodes for Shockwaves
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
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              if (mat instanceof THREE.Material) {
                mat.dispose();
              }
            });
          } else if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      } else if (child instanceof THREE.Sprite) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (child.material.map) {
            child.material.map.dispose();
          }
          child.material.dispose();
        }
      }
    });
  }, []);

  // Smooth Camera Lerp Trigger
  const focusCameraOnPosition = useCallback(
    (x: number, y: number, z: number, immediate = false) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      let camX = x + 18;
      let camY = y + 16;
      let camZ = z + 22;

      if (viewMode === 'topdown') {
        camX = x;
        camY = y + 70;
        camZ = z + 0.1;
      } else if (viewMode === 'isometric') {
        camX = x + 24;
        camY = y + 26;
        camZ = z + 24;
      }

      if (immediate) {
        camera.position.set(camX, camY, camZ);
        controls.target.set(x, y, z);
        controls.update();
        isTransitioningCameraRef.current = false;
      } else {
        targetCamPosRef.current.set(camX, camY, camZ);
        targetControlsLookAtRef.current.set(x, y, z);
        isTransitioningCameraRef.current = true;
      }
    },
    [viewMode]
  );

  // Reset Camera to 45-Degree Cinematic Overview
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

  // React to selectedNodeId change by focusing camera
  useEffect(() => {
    if (!selectedNodeId) return;
    const targetNode = nodesMap.get(selectedNodeId);
    if (targetNode) {
      focusCameraOnPosition(
        targetNode.position.x,
        targetNode.position.y,
        targetNode.position.z,
        false
      );
    }
  }, [selectedNodeId, nodesMap, focusCameraOnPosition]);

  // -------------------------------------------------------------
  // PHYSICAL UNLOCK SHOCKWAVE TRIGGER
  // -------------------------------------------------------------
  const triggerUnlockShockwave = useCallback(
    (completedNode: MapNode) => {
      const shockwavesGroup = shockwavesGroupRef.current;
      if (!shockwavesGroup) return;

      const { x, y, z } = completedNode.position;

      // Dynamic Expanding Surface Shockwave Ring
      const shockGeo = new THREE.RingGeometry(0.5, 1.4, 48);
      shockGeo.rotateX(-Math.PI / 2);
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shockMesh = new THREE.Mesh(shockGeo, shockMat);
      shockMesh.position.set(x, y + 0.15, z);
      shockMesh.scale.set(0.2, 0.2, 0.2);
      shockwavesGroup.add(shockMesh);

      const now = performance.now() / 1000;
      activeShockwavesRef.current.push({
        mesh: shockMesh,
        startTime: now,
        duration: 1.4,
        initialScale: 0.2,
        maxScale: 16.0,
      });

      // Register landmark elastic spring bounce & 3.5x emissive flash
      springingLandmarksRef.current.set(completedNode.id, {
        nodeId: completedNode.id,
        startTime: now,
        duration: 1.3,
      });
    },
    []
  );

  // Monitor nodes to detect new completions and trigger physical shockwaves
  useEffect(() => {
    const currentCompleted = new Set<string>();
    nodes.forEach((n) => {
      if (n.status === 'COMPLETED') {
        currentCompleted.add(n.id);
        if (
          !prevCompletedNodeIdsRef.current.has(n.id) &&
          prevCompletedNodeIdsRef.current.size > 0
        ) {
          triggerUnlockShockwave(n);
        }
      }
    });
    prevCompletedNodeIdsRef.current = currentCompleted;
  }, [nodes, triggerUnlockShockwave]);

  // -------------------------------------------------------------
  // 1. Initial Scene Setup: Dual-Tone Lighting & Cosmic Void
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

    // 2. Perspective Camera (Cinematic 45-Degree Isometric Default Vantage)
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 1000);
    camera.position.set(46, 52, 46);
    cameraRef.current = camera;

    // 3. WebGLRenderer with Tone Mapping
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

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
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0x0a1128, 1.2);
    scene.add(ambientLight);

    // Electric-Cyan Key Directional Light
    const keyDirectionalLight = new THREE.DirectionalLight(0x38bdf8, 2.8);
    keyDirectionalLight.position.set(50, 75, 45);
    scene.add(keyDirectionalLight);

    // Warm Magenta/Amber Rim Backlight (Opposite key light for metallic edge highlights)
    const rimBacklight = new THREE.DirectionalLight(0xf43f5e, 1.8);
    rimBacklight.position.set(-35, -30, -35);
    scene.add(rimBacklight);

    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x02040a, 0.65);
    scene.add(hemiLight);

    // 6. Deep Cyber Grid Floor at y = -12 with Rotating Concentric Radar Rings
    const gridFloor = new THREE.GridHelper(220, 55, 0x0284c7, 0x071530);
    gridFloor.position.y = -12;
    scene.add(gridFloor);

    // Radar Concentric Rings Group
    const radarGroup = new THREE.Group();
    radarGroup.position.y = -11.9;
    radarRingsRef.current = radarGroup;

    const ringRadii = [35, 65, 95];
    const ringColors = [0x06b6d4, 0x8b5cf6, 0x3b82f6];
    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.25, r + 0.25, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColors[idx],
        transparent: true,
        opacity: 0.22 - idx * 0.05,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      radarGroup.add(ringMesh);
    });
    scene.add(radarGroup);

    // 7. Cosmic Nebula Starfield with 1,200 Two-Layer Particles
    // Layer 1: Sparkling Stars (Cyan, Violet, Gold, White)
    const starCount = 700;
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
      const radius = 80 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.max(4, radius * Math.sin(phi) * Math.sin(theta));
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

    // Layer 2: Ethereal Cosmic Dust Motes (Drifting slowly in the void)
    const dustCount = 500;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const radius = 30 + Math.random() * 95;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      dustPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      dustPositions[i * 3 + 1] = Math.max(-5, radius * Math.sin(phi) * Math.sin(theta));
      dustPositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x22d3ee,
      size: 2.2,
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

    const landmarksGroup = new THREE.Group();
    landmarksGroupRef.current = landmarksGroup;
    scene.add(landmarksGroup);

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
    };
    window.addEventListener('resize', handleResize);

    // 10. Animation Loop
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
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

      // Rotate cosmic starfield and radar rings
      starPoints.rotation.y = elapsedTime * 0.015;
      dustPoints.rotation.y = -elapsedTime * 0.02;
      if (radarRingsRef.current) {
        radarRingsRef.current.rotation.y = elapsedTime * 0.04;
      }

      // Animate Cyber-Biomes & Anti-Gravity Levitation Cores
      islandLevitationsRef.current.forEach(({ group, phase, levitationCore, orbitRing1, orbitRing2 }) => {
        // Harmonic island floating
        group.position.y = Math.sin(elapsedTime * 0.75 + phase) * 0.32;

        // Anti-gravity levitation core rotation
        levitationCore.rotation.y = elapsedTime * 1.4;
        levitationCore.rotation.x = Math.sin(elapsedTime * 0.9) * 0.3;

        // Dual counter-rotating orbit rings
        orbitRing1.rotation.z = elapsedTime * 0.6;
        orbitRing2.rotation.z = -elapsedTime * 0.5;
      });

      // Animate Landmark Meshes
      animatedLandmarksRef.current.forEach((landmark) => {
        const {
          nodeId,
          status,
          group,
          crystalMesh,
          containmentCage,
          mistDome,
          runicRing1,
          runicRing2,
          satellites,
          auraPoints,
          crownSpire,
          crownJewel,
          skyBeam,
          baseY,
          phaseOffset,
          baseMaterials,
        } = landmark;

        // Check if landmark is undergoing elastic spring bounce from shockwave
        let springScale = 1.0;
        let emissiveMultiplier = 1.0;
        const springData = springingLandmarksRef.current.get(nodeId);

        if (springData) {
          const elapsedSpring = nowSec - springData.startTime;
          const p = elapsedSpring / springData.duration;

          if (p >= 1.0) {
            springingLandmarksRef.current.delete(nodeId);
          } else {
            // Elastic spring formula (1.0 -> 1.48 -> damped bounce)
            if (p < 0.2) {
              springScale = 1.0 + (p / 0.2) * 0.48;
            } else {
              springScale = 1.0 + 0.48 * Math.exp(-p * 4.5) * Math.cos((p - 0.2) * 14);
            }
            // 3.5x emissive flash decay
            emissiveMultiplier = 1.0 + 2.5 * Math.exp(-p * 3.5);
          }
        }

        group.scale.set(springScale, springScale, springScale);

        // Apply emissive multiplier if active
        if (emissiveMultiplier > 1.0) {
          baseMaterials.forEach((mat) => {
            if ('emissiveIntensity' in mat) {
              const standardMat = mat as THREE.MeshStandardMaterial;
              standardMat.emissiveIntensity = 1.2 * emissiveMultiplier;
            }
          });
        }

        // UNLOCKED: Multi-Faceted Crystal Beacon with Heartbeat & Dual Runic Rings
        if (status === 'UNLOCKED') {
          // Breathing scale heartbeat
          const heartbeat = 1.0 + Math.pow(Math.sin(elapsedTime * 3.0 + phaseOffset), 3) * 0.08;
          const bob = Math.sin(elapsedTime * 2.2 + phaseOffset) * 0.35;
          group.position.y = baseY + bob;

          if (crystalMesh) {
            crystalMesh.scale.set(heartbeat, heartbeat, heartbeat);
            crystalMesh.rotation.y = elapsedTime * 1.6;
            crystalMesh.rotation.x = Math.sin(elapsedTime * 1.2) * 0.2;

            const mat = crystalMesh.material as THREE.MeshPhysicalMaterial;
            if (mat && 'emissiveIntensity' in mat) {
              mat.emissiveIntensity =
                (1.2 + Math.sin(elapsedTime * 3.5 + phaseOffset) * 0.5) * emissiveMultiplier;
            }
          }

          // Counter-rotating runic rings
          if (runicRing1) runicRing1.rotation.z = elapsedTime * 1.4;
          if (runicRing2) runicRing2.rotation.z = -elapsedTime * 1.1;

          // 4 Orbiting Particle Satellites at radius 2.4
          satellites.forEach((sat, sIdx) => {
            const angle = elapsedTime * 1.3 + (sIdx * Math.PI) / 2;
            const r = 2.4;
            sat.position.set(Math.cos(angle) * r, 2.2 + Math.sin(angle * 2) * 0.25, Math.sin(angle) * r);
            sat.rotation.y = elapsedTime * 3;
          });
        }

        // COMPLETED: Golden Celestial Citadel Crown & Ascending Spire
        if (status === 'COMPLETED') {
          const bob = Math.sin(elapsedTime * 1.2 + phaseOffset) * 0.16;
          group.position.y = baseY + bob;

          if (crownSpire) {
            crownSpire.rotation.y = -elapsedTime * 0.8;
          }

          if (crownJewel) {
            crownJewel.rotation.y = elapsedTime * 1.5;
            crownJewel.rotation.x = Math.sin(elapsedTime * 1.5) * 0.3;
          }

          if (auraPoints) {
            auraPoints.rotation.y = elapsedTime * 0.9;
          }

          if (skyBeam) {
            const mat = skyBeam.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.25 + Math.sin(elapsedTime * 3.0) * 0.08;
          }
        }

        // LOCKED: Sleek Obsidian Monolith in Holographic Containment Cage
        if (status === 'LOCKED') {
          if (containmentCage) {
            containmentCage.rotation.y = elapsedTime * 0.4;
          }
          if (mistDome) {
            mistDome.rotation.y = elapsedTime * 0.25;
            mistDome.position.y = 0.2 + Math.sin(elapsedTime * 1.5) * 0.08;
          }
        }
      });

      // Animate Living Data Highway Light Packets (2 per active highway)
      animatedPulsesRef.current.forEach((pulse) => {
        const t = (elapsedTime * pulse.speed + pulse.offset) % 1.0;
        const pt = pulse.curve.getPointAt(t);
        pulse.mesh.position.copy(pt);
      });

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

      // Animate Active Shockwaves (scale 0.2 -> 16.0, opacity 0.95 -> 0.0, duration 1.4s)
      const survivingShockwaves: ActiveShockwave[] = [];
      activeShockwavesRef.current.forEach((sw) => {
        const elapsed = nowSec - sw.startTime;
        const p = elapsed / sw.duration;

        if (p < 1.0) {
          const currentScale = sw.initialScale + p * (sw.maxScale - sw.initialScale);
          sw.mesh.scale.set(currentScale, currentScale, currentScale);
          const mat = sw.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.95 * (1.0 - Math.pow(p, 2));
          survivingShockwaves.push(sw);
        } else {
          // Dispose shockwave mesh
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

      renderer.render(scene, camera);
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

      if (mistTextureRef.current) {
        mistTextureRef.current.dispose();
        mistTextureRef.current = null;
      }

      disposeObjectHierarchy(scene);
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 2. Build Cyber-Biomes & Anti-Gravity Levitation Cores
  // -------------------------------------------------------------
  useEffect(() => {
    const islandsGroup = islandsGroupRef.current;
    if (!islandsGroup) return;

    disposeObjectHierarchy(islandsGroup);
    while (islandsGroup.children.length > 0) {
      islandsGroup.remove(islandsGroup.children[0]);
    }
    islandLevitationsRef.current = [];

    const regionNamesSet = new Set<string>();
    nodes.forEach((n) => regionNamesSet.add(n.region));
    Object.keys(REGIONS).forEach((reg) => regionNamesSet.add(reg));

    let index = 0;
    regionNamesSet.forEach((regionName) => {
      const theme = REGIONS[regionName] || {
        name: regionName,
        color: '#06b6d4',
        emissiveColor: '#22d3ee',
        center: {
          x: Math.cos((index * Math.PI) / 2) * 35,
          y: 0,
          z: Math.sin((index * Math.PI) / 2) * 35,
        },
        description: 'Custom Study Region',
        islandRadius: 18,
      };

      const islandGroup = new THREE.Group();
      islandGroup.position.set(theme.center.x, theme.center.y, theme.center.z);

      const radius = theme.islandRadius;
      const themeColor = new THREE.Color(theme.color);

      // Plateau: Sleek cyber-slate (#1e293b, metalness 0.45, roughness 0.45)
      const plateauGeo = new THREE.CylinderGeometry(radius, radius * 0.88, 3.2, 8);
      const plateauMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.45,
        roughness: 0.45,
      });
      const plateauMesh = new THREE.Mesh(plateauGeo, plateauMat);
      plateauMesh.position.y = 0;
      islandGroup.add(plateauMesh);

      // Concentric Glowing Topography Contour Lines (r*0.35, r*0.65, r*0.88)
      const contourRatios = [0.35, 0.65, 0.88];
      contourRatios.forEach((ratio, cIdx) => {
        const ringR = radius * ratio;
        const contourGeo = new THREE.RingGeometry(ringR - 0.12, ringR + 0.12, 48);
        contourGeo.rotateX(-Math.PI / 2);
        const contourMat = new THREE.MeshStandardMaterial({
          color: themeColor,
          emissive: themeColor,
          emissiveIntensity: 1.6 + cIdx * 0.3,
          side: THREE.DoubleSide,
        });
        const contourMesh = new THREE.Mesh(contourGeo, contourMat);
        contourMesh.position.y = 1.62;
        islandGroup.add(contourMesh);
      });

      // Plateau Glowing Rim Torus
      const rimGeo = new THREE.TorusGeometry(radius * 0.98, 0.22, 16, 64);
      rimGeo.rotateX(Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 2.2,
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = 1.6;
      islandGroup.add(rimMesh);

      // Underneath: Inverted Stalactite Core Cone
      const keelGeo = new THREE.ConeGeometry(radius * 0.48, 8.5, 8);
      keelGeo.rotateX(Math.PI);
      const keelMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.85,
        metalness: 0.2,
      });
      const keelMesh = new THREE.Mesh(keelGeo, keelMat);
      keelMesh.position.y = -6.0;
      islandGroup.add(keelMesh);

      // Glowing Anti-Gravity Energy Crystal at y = -7.5
      const coreGeo = new THREE.OctahedronGeometry(2.4, 0);
      const coreMat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 2.8,
        metalness: 0.3,
        roughness: 0.2,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.y = -7.5;
      islandGroup.add(coreMesh);

      // Regional Pulsing Point Light underneath (intensity 60, distance 50)
      const underPointLight = new THREE.PointLight(themeColor, 60, 50, 2);
      underPointLight.position.set(0, -6.0, 0);
      islandGroup.add(underPointLight);

      // Upper Surface Point Light for landmark illumination
      const upperPointLight = new THREE.PointLight(themeColor, 35, 45, 2);
      upperPointLight.position.set(0, 5.0, 0);
      islandGroup.add(upperPointLight);

      // Dual Counter-Rotating Outer Perimeter Orbit Rings
      const orbit1Geo = new THREE.TorusGeometry(radius * 1.15, 0.08, 16, 64);
      orbit1Geo.rotateX((12 * Math.PI) / 180);
      const orbit1Mat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.5,
      });
      const orbitRing1 = new THREE.Mesh(orbit1Geo, orbit1Mat);
      orbitRing1.position.y = 0.5;
      islandGroup.add(orbitRing1);

      const orbit2Geo = new THREE.TorusGeometry(radius * 1.28, 0.05, 16, 64);
      orbit2Geo.rotateZ((-12 * Math.PI) / 180);
      const orbit2Mat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.4,
      });
      const orbitRing2 = new THREE.Mesh(orbit2Geo, orbit2Mat);
      orbitRing2.position.y = 0.3;
      islandGroup.add(orbitRing2);

      // Floating 3D Text Sprite Label
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
      sprite.position.set(0, 8.0, 0);
      islandGroup.add(sprite);

      islandsGroup.add(islandGroup);
      islandLevitationsRef.current.push({
        group: islandGroup,
        phase: (index * Math.PI) / 2.5,
        levitationCore: coreMesh,
        orbitRing1,
        orbitRing2,
      });

      index++;
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 3. Build High-End Holo-Artifact Landmarks
  // -------------------------------------------------------------
  useEffect(() => {
    const landmarksGroup = landmarksGroupRef.current;
    if (!landmarksGroup) return;

    disposeObjectHierarchy(landmarksGroup);
    while (landmarksGroup.children.length > 0) {
      landmarksGroup.remove(landmarksGroup.children[0]);
    }

    interactiveHitboxesRef.current = [];
    animatedLandmarksRef.current = [];

    const mistTexture = getMistTexture();

    nodes.forEach((node, idx) => {
      const landmarkGroup = new THREE.Group();
      landmarkGroup.position.set(node.position.x, node.position.y, node.position.z);
      landmarkGroup.name = `landmark-${node.id}`;

      // Invisible Raycast Hitbox
      const hitboxGeo = new THREE.BoxGeometry(3.2, 5.5, 3.2);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.y = 2.2;
      hitbox.userData = { nodeId: node.id };
      landmarkGroup.add(hitbox);
      interactiveHitboxesRef.current.push(hitbox);

      // Base Pedestal Dais
      const pedestalGeo = new THREE.CylinderGeometry(1.4, 1.75, 0.45, 6);
      let pedestalColor = 0x1e293b;
      if (node.status === 'UNLOCKED') pedestalColor = 0x0284c7;
      if (node.status === 'COMPLETED') pedestalColor = 0x854d0e;

      const pedestalMat = new THREE.MeshStandardMaterial({
        color: pedestalColor,
        roughness: 0.35,
        metalness: 0.65,
      });
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = 0.22;
      landmarkGroup.add(pedestal);

      const baseMaterials: THREE.Material[] = [pedestalMat];
      let crystalMesh: THREE.Mesh | undefined;
      let monolithMesh: THREE.Mesh | undefined;
      let containmentCage: THREE.LineSegments | undefined;
      let mistDome: THREE.Mesh | undefined;
      let runicRing1: THREE.Mesh | undefined;
      let runicRing2: THREE.Mesh | undefined;
      const satellites: THREE.Mesh[] = [];
      let auraPoints: THREE.Points | undefined;
      let crownSpire: THREE.Mesh | undefined;
      let crownJewel: THREE.Mesh | undefined;
      let skyBeam: THREE.Mesh | undefined;

      // ============================================================
      // STATUS 1: LOCKED — Monolith in Holographic Containment Cage + Volumetric Mist
      // ============================================================
      if (node.status === 'LOCKED') {
        // Sleek Dark Obsidian Monolith
        const monolithGeo = new THREE.BoxGeometry(1.2, 3.4, 1.2);
        const monolithMat = new THREE.MeshStandardMaterial({
          color: 0x0b0d14,
          roughness: 0.2,
          metalness: 0.92,
          emissive: 0x030408,
        });
        monolithMesh = new THREE.Mesh(monolithGeo, monolithMat);
        monolithMesh.position.y = 1.85;
        landmarkGroup.add(monolithMesh);
        baseMaterials.push(monolithMat);

        // Glowing Holographic Containment Cage (Wireframe lattice)
        const cageGeo = new THREE.BoxGeometry(1.7, 3.9, 1.7);
        const cageEdges = new THREE.EdgesGeometry(cageGeo);
        const cageMat = new THREE.LineBasicMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.75,
        });
        containmentCage = new THREE.LineSegments(cageEdges, cageMat);
        containmentCage.position.y = 1.85;
        landmarkGroup.add(containmentCage);

        // 4 Corner Laser Containment Nodes
        const cornerOffsets = [
          [-0.85, -0.85],
          [-0.85, 0.85],
          [0.85, -0.85],
          [0.85, 0.85],
        ];
        cornerOffsets.forEach(([cx, cz]) => {
          const laserGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.8, 8);
          const laserMat = new THREE.MeshBasicMaterial({
            color: 0xfb7185,
            transparent: true,
            opacity: 0.6,
          });
          const laserMesh = new THREE.Mesh(laserGeo, laserMat);
          laserMesh.position.set(cx, 1.85, cz);
          landmarkGroup.add(laserMesh);
        });

        // Soft Volumetric Mist Dome (Radial Alpha Texture, Zero Square Blocks)
        const domeGeo = new THREE.SphereGeometry(2.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({
          map: mistTexture,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        mistDome = new THREE.Mesh(domeGeo, domeMat);
        mistDome.position.y = 0.2;
        landmarkGroup.add(mistDome);
      }

      // ============================================================
      // STATUS 2: UNLOCKED — Multi-Faceted Crystal Beacon with Dual Runic Rings & 4 Satellites
      // ============================================================
      if (node.status === 'UNLOCKED') {
        const crystalGeo = new THREE.IcosahedronGeometry(1.2, 0);
        const crystalMat = new THREE.MeshPhysicalMaterial({
          color: 0x00f5ff,
          emissive: 0x0284c7,
          emissiveIntensity: 1.2,
          roughness: 0.08,
          metalness: 0.35,
          transmission: 0.35,
          transparent: true,
          opacity: 0.95,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
        });
        crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
        crystalMesh.position.y = 2.2;
        landmarkGroup.add(crystalMesh);
        baseMaterials.push(crystalMat);

        // Dual Counter-Rotating Runic Rings (Tilted at 20 deg angles)
        const ring1Geo = new THREE.TorusGeometry(1.85, 0.06, 16, 48);
        ring1Geo.rotateX((20 * Math.PI) / 180);
        const ring1Mat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x00f5ff,
          emissiveIntensity: 2.0,
        });
        runicRing1 = new THREE.Mesh(ring1Geo, ring1Mat);
        runicRing1.position.y = 2.2;
        landmarkGroup.add(runicRing1);

        const ring2Geo = new THREE.TorusGeometry(2.15, 0.045, 16, 48);
        ring2Geo.rotateX((-20 * Math.PI) / 180);
        ring2Geo.rotateZ((15 * Math.PI) / 180);
        const ring2Mat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x22d3ee,
          emissiveIntensity: 1.8,
        });
        runicRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
        runicRing2.position.y = 2.2;
        landmarkGroup.add(runicRing2);

        // 4 Orbiting Particle Satellites at Radius 2.4
        for (let s = 0; s < 4; s++) {
          const satGeo = new THREE.OctahedronGeometry(0.26, 0);
          const satMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
          const satMesh = new THREE.Mesh(satGeo, satMat);
          satMesh.position.set(2.4, 2.2, 0);
          landmarkGroup.add(satMesh);
          satellites.push(satMesh);
        }

        // Base Glowing Dais Ring
        const daisRimGeo = new THREE.TorusGeometry(1.45, 0.08, 16, 32);
        daisRimGeo.rotateX(Math.PI / 2);
        const daisRimMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
        const daisRim = new THREE.Mesh(daisRimGeo, daisRimMat);
        daisRim.position.y = 0.45;
        landmarkGroup.add(daisRim);
      }

      // ============================================================
      // STATUS 3: COMPLETED — Celestial Citadel Crown, Golden Aura & Ascending Spire
      // ============================================================
      if (node.status === 'COMPLETED') {
        const pillarGeo = new THREE.CylinderGeometry(0.9, 1.25, 2.8, 6);
        const goldMat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          emissive: 0xd97706,
          emissiveIntensity: 0.8,
          metalness: 0.95,
          roughness: 0.1,
        });
        const pillar = new THREE.Mesh(pillarGeo, goldMat);
        pillar.position.y = 1.4;
        landmarkGroup.add(pillar);
        baseMaterials.push(goldMat);

        // Crowned Spire
        const crownGeo = new THREE.ConeGeometry(1.15, 1.6, 6);
        crownSpire = new THREE.Mesh(crownGeo, goldMat);
        crownSpire.position.y = 3.3;
        landmarkGroup.add(crownSpire);

        // Floating Celestial Star Jewel
        const jewelGeo = new THREE.IcosahedronGeometry(0.6, 0);
        const jewelMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
        crownJewel = new THREE.Mesh(jewelGeo, jewelMat);
        crownJewel.position.y = 4.5;
        landmarkGroup.add(crownJewel);

        // Swirling Golden Ember Points Halo with Additive Blending (48 points)
        const emberCount = 48;
        const emberPositions = new Float32Array(emberCount * 3);
        for (let p = 0; p < emberCount; p++) {
          const t = p / emberCount;
          const theta = t * Math.PI * 6;
          const r = 1.6 + Math.sin(t * Math.PI) * 0.45;
          emberPositions[p * 3] = Math.cos(theta) * r;
          emberPositions[p * 3 + 1] = 0.6 + t * 4.2;
          emberPositions[p * 3 + 2] = Math.sin(theta) * r;
        }

        const auraGeo = new THREE.BufferGeometry();
        auraGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
        const auraMat = new THREE.PointsMaterial({
          color: 0xfbbf24,
          size: 0.35,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        auraPoints = new THREE.Points(auraGeo, auraMat);
        landmarkGroup.add(auraPoints);

        // Ascending Ethereal Vertical Light Beam Spire
        const skyBeamGeo = new THREE.CylinderGeometry(0.18, 0.55, 32, 16, 1, true);
        const skyBeamMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        skyBeam = new THREE.Mesh(skyBeamGeo, skyBeamMat);
        skyBeam.position.y = 18;
        landmarkGroup.add(skyBeam);
      }

      landmarksGroup.add(landmarkGroup);

      animatedLandmarksRef.current.push({
        nodeId: node.id,
        status: node.status,
        group: landmarkGroup,
        crystalMesh,
        monolithMesh,
        containmentCage,
        mistDome,
        runicRing1,
        runicRing2,
        satellites,
        auraPoints,
        crownSpire,
        crownJewel,
        skyBeam,
        baseY: node.position.y,
        phaseOffset: idx * 0.65,
        baseMaterials,
      });
    });
  }, [nodes, disposeObjectHierarchy, getMistTexture]);

  // -------------------------------------------------------------
  // 4. Build Living Data Highway Roads (2 Light Packets per Unlocked Road)
  // -------------------------------------------------------------
  useEffect(() => {
    const roadsGroup = roadsGroupRef.current;
    if (!roadsGroup) return;

    disposeObjectHierarchy(roadsGroup);
    while (roadsGroup.children.length > 0) {
      roadsGroup.remove(roadsGroup.children[0]);
    }
    animatedPulsesRef.current = [];

    edges.forEach((edge, index) => {
      const fromNode = nodesMap.get(edge.fromNodeId);
      const toNode = nodesMap.get(edge.toNodeId);
      if (!fromNode || !toNode) return;

      const pFrom = new THREE.Vector3(fromNode.position.x, fromNode.position.y + 0.45, fromNode.position.z);
      const pTo = new THREE.Vector3(toNode.position.x, toNode.position.y + 0.45, toNode.position.z);

      const dist = pFrom.distanceTo(pTo);
      const pMid = new THREE.Vector3()
        .addVectors(pFrom, pTo)
        .multiplyScalar(0.5);
      pMid.y = Math.max(pFrom.y, pTo.y) + 1.4 + dist * 0.08;

      const curve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);
      const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.18, 8, false);

      const isBothCompleted = fromNode.status === 'COMPLETED' && toNode.status === 'COMPLETED';
      const isUnlockedHighway = fromNode.status === 'COMPLETED' && toNode.status === 'UNLOCKED';

      let tubeMat: THREE.MeshStandardMaterial;

      if (isBothCompleted) {
        tubeMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xb45309,
          emissiveIntensity: 1.5,
          roughness: 0.25,
          metalness: 0.8,
        });
      } else if (isUnlockedHighway) {
        tubeMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x0891b2,
          emissiveIntensity: 1.4,
          roughness: 0.3,
          metalness: 0.6,
        });
      } else {
        tubeMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0x0b1329,
          emissiveIntensity: 0.2,
          roughness: 0.85,
          transparent: true,
          opacity: 0.45,
        });
      }

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      roadsGroup.add(tubeMesh);

      // Living Data Flow: 2 traveling glowing light packets per active road
      if (isBothCompleted || isUnlockedHighway) {
        const pulseColor = isBothCompleted ? 0xfef08a : 0x38bdf8;
        const offsets = [0.0, 0.5];

        offsets.forEach((stagger) => {
          const pulseGeo = new THREE.SphereGeometry(0.34, 12, 12);
          const pulseMat = new THREE.MeshBasicMaterial({
            color: pulseColor,
          });
          const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
          roadsGroup.add(pulseMesh);

          animatedPulsesRef.current.push({
            curve,
            mesh: pulseMesh,
            speed: 0.26 + (index % 3) * 0.06,
            offset: (stagger + index * 0.2) % 1.0,
          });
        });
      }
    });
  }, [edges, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 5. Build Fog-of-War Shroud over Locked Territories
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
  // 6. Build Selection Reticle & Sky Light Beam
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
    ring1.position.set(x, y + 0.35, z);
    selectionGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.65, 0.05, 16, 48);
    ring2Geo.rotateX(Math.PI / 2);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.name = 'ring2';
    ring2.position.set(x, y + 0.35, z);
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
  // 7. Raycasting, Pointer Events & Audio Telemetry
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
              playHoverBlip(node.position.y);
            }
          }

          // Compute screen projection for tooltip overlay
          const screenPos = new THREE.Vector3(node.position.x, node.position.y + 3.4, node.position.z);
          screenPos.project(camera);
          const screenX = ((screenPos.x + 1) * rect.width) / 2;
          const screenY = ((-screenPos.y + 1) * rect.height) / 2;

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
      focusCameraOnPosition(theme.center.x, theme.center.y, theme.center.z, false);
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

      {/* Floating Region Quick Jump Bar */}
      <div className="absolute bottom-6 left-6 z-30 hidden sm:flex items-center gap-2 pointer-events-auto bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
        {Object.entries(REGIONS).map(([regionName, theme]) => (
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
    </div>
  );
};

export default AtlasCanvas3D;
