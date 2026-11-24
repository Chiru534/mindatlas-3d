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
  mistRing?: THREE.Mesh;
  auraPoints?: THREE.Points;
  crownMesh?: THREE.Mesh;
  baseY: number;
  phaseOffset: number;
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

interface UnlockAnimationState {
  startTime: number;
  duration: number;
}

/**
 * Creates an in-memory soft circular radial gradient alpha texture for volumetric mist.
 */
function createSoftMistTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(165, 180, 252, 0.7)');
  gradient.addColorStop(0.35, 'rgba(148, 163, 184, 0.35)');
  gradient.addColorStop(0.7, 'rgba(71, 85, 105, 0.12)');
  gradient.addColorStop(1.0, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Computes bounding box and center of active landmarks.
 */
function getNodesBoundingBox(nodes: MapNode[]): { centerX: number; centerZ: number; span: number } {
  if (nodes.length === 0) return { centerX: 0, centerZ: 0, span: 75 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.position.x);
    maxX = Math.max(maxX, n.position.x);
    minZ = Math.min(minZ, n.position.z);
    maxZ = Math.max(maxZ, n.position.z);
  });
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const span = Math.max(30, Math.max(maxX - minX, maxZ - minZ) + 24);
  return { centerX, centerZ, span };
}

/**
 * Calculates responsive camera overview coordinates dynamically centered and scaled to active islands.
 */
function getAdaptiveCameraOverview(
  width: number,
  height: number,
  nodes: MapNode[] = []
): { x: number; y: number; z: number; lookAtX: number; lookAtY: number; lookAtZ: number } {
  const aspect = width / Math.max(1, height);
  const { centerX, centerZ, span } = getNodesBoundingBox(nodes);
  const scale = Math.max(0.65, Math.min(1.3, span / 75));

  let baseY = 64;
  let baseZ = 76;
  let lookAtY = 2;

  if (aspect < 0.85) {
    // Mobile Portrait
    baseY = 96;
    baseZ = 110;
    lookAtY = 4;
  } else if (aspect < 1.25) {
    // Tablet / Square
    baseY = 76;
    baseZ = 88;
    lookAtY = 3;
  }

  return {
    x: centerX,
    y: baseY * scale,
    z: centerZ + baseZ * scale,
    lookAtX: centerX,
    lookAtY,
    lookAtZ: centerZ,
  };
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

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Group references
  const islandsGroupRef = useRef<THREE.Group | null>(null);
  const landmarksGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const fogGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);

  // Animation references
  const animationFrameIdRef = useRef<number | null>(null);
  const animatedLandmarksRef = useRef<Map<string, AnimatedLandmark>>(new Map());
  const animatedPulsesRef = useRef<AnimatedEnergyPulse[]>([]);
  const animatedFogRegionsRef = useRef<AnimatedFogRegion[]>([]);
  const islandGroupsRef = useRef<{ group: THREE.Group; phase: number }[]>([]);
  const unlockAnimationsRef = useRef<Map<string, UnlockAnimationState>>(new Map());
  const prevStatusesRef = useRef<Map<string, NodeStatus>>(new Map());

  // Camera transition state
  const isTransitioningCameraRef = useRef<boolean>(false);
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetControlsLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Raycasting & Interaction
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseCoordsRef = useRef<THREE.Vector2>(new THREE.Vector2(-999, -999));
  const hoveredNodeIdRef = useRef<string | null>(null);

  // Tooltip & UI state
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipData | null>(null);
  const [isTopDownView, setIsTopDownView] = useState<boolean>(false);

  // Quick lookup maps
  const nodesMap = useMemo(() => {
    const map = new Map<string, MapNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Keep references updated for animation loop
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const audioMutedRef = useRef(audioMuted);
  audioMutedRef.current = audioMuted;

  // -------------------------------------------------------------
  // Memory Cleanup Helper
  // -------------------------------------------------------------
  const disposeObjectHierarchy = useCallback((obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      }
    });
  }, []);

  // -------------------------------------------------------------
  // Camera Positioning Helpers
  // -------------------------------------------------------------
  const focusCameraOnPosition = useCallback((x: number, y: number, z: number, immediate: boolean = false) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offsetDistance = 24;
    const elevationAngle = Math.PI / 4; // 45 deg angle
    const camX = x + offsetDistance * Math.cos(elevationAngle);
    const camY = y + offsetDistance * Math.sin(elevationAngle) + 4;
    const camZ = z + offsetDistance * Math.cos(elevationAngle);

    targetCamPosRef.current.set(camX, camY, camZ);
    targetControlsLookAtRef.current.set(x, y + 1.2, z);

    if (immediate) {
      camera.position.set(camX, camY, camZ);
      controls.target.set(x, y + 1.2, z);
      controls.update();
      isTransitioningCameraRef.current = false;
    } else {
      isTransitioningCameraRef.current = true;
    }
  }, []);

  // Active regions list for quick-jump toolbar
  const activeRegionsList = useMemo(() => {
    return Object.entries(REGIONS).filter(([regionName]) =>
      nodes.some((n) => n.region === regionName)
    );
  }, [nodes]);

  const resetCameraToOverview = useCallback(() => {
    const container = mountRef.current;
    const w = container?.clientWidth || window.innerWidth;
    const h = container?.clientHeight || window.innerHeight;
    const adaptive = getAdaptiveCameraOverview(w, h, nodes);

    targetCamPosRef.current.set(adaptive.x, adaptive.y, adaptive.z);
    targetControlsLookAtRef.current.set(adaptive.lookAtX, adaptive.lookAtY, adaptive.lookAtZ);
    isTransitioningCameraRef.current = true;
    setIsTopDownView(false);
    onRequestResetCamera?.();
  }, [nodes, onRequestResetCamera]);

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
  // Detect Newly Unlocked / Completed Nodes for Spring Animation
  // -------------------------------------------------------------
  useEffect(() => {
    const prevMap = prevStatusesRef.current;
    const now = performance.now() / 1000;

    nodes.forEach((n) => {
      const prev = prevMap.get(n.id);
      if (prev && prev !== n.status) {
        if (n.status === 'UNLOCKED' || n.status === 'COMPLETED') {
          // Trigger spring scale & emissive surge
          unlockAnimationsRef.current.set(n.id, {
            startTime: now,
            duration: 1.6,
          });
        }
      }
      prevMap.set(n.id, n.status);
    });
  }, [nodes]);

  // -------------------------------------------------------------
  // 1. Core Scene Initialization
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.007);

    // 2. Camera with adaptive overview framing
    const adaptive = getAdaptiveCameraOverview(width, height, nodes);
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 1000);
    camera.position.set(adaptive.x, adaptive.y, adaptive.z);
    cameraRef.current = camera;

    // 3. WebGLRenderer
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
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 10;
    controls.maxDistance = 220;
    controls.target.set(adaptive.lookAtX, adaptive.lookAtY, adaptive.lookAtZ);
    controlsRef.current = controls;

    const onControlsStart = () => {
      isTransitioningCameraRef.current = false;
    };
    controls.addEventListener('start', onControlsStart);

    // 5. Environmental Lighting (Brighter, Richer Contrast)
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.8);
    scene.add(ambientLight);

    const keyDirectionalLight = new THREE.DirectionalLight(0xe0e7ff, 2.2);
    keyDirectionalLight.position.set(45, 75, 40);
    scene.add(keyDirectionalLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 1.0);
    scene.add(hemiLight);

    // 6. Holographic Tech Grid Floor
    const gridHelper = new THREE.GridHelper(220, 50, 0x1e3a8a, 0x0c162c);
    gridHelper.position.y = -5.0;
    scene.add(gridHelper);

    // Concentric Range Rings
    const ringRadii = [40, 75, 110];
    ringRadii.forEach((r) => {
      const ringGeo = new THREE.RingGeometry(r - 0.15, r + 0.15, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = -4.95;
      scene.add(ringMesh);
    });

    // 7. Particle Starfield
    const starCount = 800;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 350;
      starPositions[i * 3 + 1] = Math.random() * 120 - 10;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 350;

      const tint = Math.random();
      if (tint > 0.7) {
        starColors[i * 3] = 0.22;
        starColors[i * 3 + 1] = 0.71;
        starColors[i * 3 + 2] = 0.97;
      } else if (tint > 0.4) {
        starColors[i * 3] = 0.65;
        starColors[i * 3 + 1] = 0.55;
        starColors[i * 3 + 2] = 0.98;
      } else {
        starColors[i * 3] = 0.85;
        starColors[i * 3 + 1] = 0.9;
        starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 1.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 8. Container Groups
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

    // -------------------------------------------------------------
    // 9. Continuous Animation Loop
    // -------------------------------------------------------------
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      const nowSec = performance.now() / 1000;

      // Camera Smooth Interpolation
      if (isTransitioningCameraRef.current && cameraRef.current && controlsRef.current) {
        cameraRef.current.position.lerp(targetCamPosRef.current, 0.05);
        controlsRef.current.target.lerp(targetControlsLookAtRef.current, 0.05);

        if (
          cameraRef.current.position.distanceTo(targetCamPosRef.current) < 0.15 &&
          controlsRef.current.target.distanceTo(targetControlsLookAtRef.current) < 0.1
        ) {
          isTransitioningCameraRef.current = false;
        }
      }

      // Island Gentle Breathing Floating Animation
      islandGroupsRef.current.forEach(({ group, phase }) => {
        group.position.y = Math.sin(elapsedTime * 0.4 + phase) * 0.25;

        // Dynamic distance scaling for 3D Island Labels (prevents oversized balloons on zoom)
        const label = group.getObjectByName('island-label');
        if (label && cameraRef.current) {
          const dist = cameraRef.current.position.distanceTo(group.position);
          const scaleFactor = Math.max(0.45, Math.min(1.15, dist * 0.012));
          label.scale.set(scaleFactor * 14, scaleFactor * 7, 1);
        }
      });

      // Animate 3D Landmarks & Unlock Pulses
      animatedLandmarksRef.current.forEach((landmark) => {
        const { group, crystalMesh, mistRing, auraPoints, crownMesh, baseY, phaseOffset, status, nodeId } = landmark;

        // Check if node is actively playing an unlock spring pulse
        const unlockAnim = unlockAnimationsRef.current.get(nodeId);
        let scaleMultiplier = 1.0;
        let emissiveSurge = 1.0;

        if (unlockAnim) {
          const progress = (nowSec - unlockAnim.startTime) / unlockAnim.duration;
          if (progress >= 1.0) {
            unlockAnimationsRef.current.delete(nodeId);
          } else {
            // Sinusoidal spring pulse: peaks at 1.4x scale and surges emissive
            const spring = Math.sin(progress * Math.PI);
            scaleMultiplier = 1.0 + spring * 0.42;
            emissiveSurge = 1.0 + spring * 2.5;
          }
        }

        if (status === 'UNLOCKED') {
          // Bobbing + rotating cyan crystal beacon
          const bobY = Math.sin(elapsedTime * 2.2 + phaseOffset) * 0.45;
          if (crystalMesh) {
            crystalMesh.position.y = baseY + 2.4 + bobY;
            crystalMesh.rotation.y = elapsedTime * 1.2;
            crystalMesh.rotation.x = Math.sin(elapsedTime * 0.8) * 0.15;

            // Apply pulse scale and emissive surge
            crystalMesh.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
            const mat = crystalMesh.material as THREE.MeshStandardMaterial;
            if (mat && mat.emissive) {
              mat.emissiveIntensity = (0.7 + Math.sin(elapsedTime * 3) * 0.25) * emissiveSurge;
            }
          }
        } else if (status === 'COMPLETED') {
          // Golden Monument with gentle celestial oscillation
          const bobY = Math.sin(elapsedTime * 1.4 + phaseOffset) * 0.2;
          if (crownMesh) {
            crownMesh.position.y = baseY + 5.2 + bobY;
            crownMesh.rotation.y = -elapsedTime * 0.6;
            crownMesh.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
          }
          if (auraPoints) {
            auraPoints.rotation.y = elapsedTime * 0.8;
          }
        } else if (status === 'LOCKED') {
          // Dark obsidian mist ring rotation
          if (mistRing) {
            mistRing.rotation.z = elapsedTime * 0.5;
          }
        }

        // Selection highlight scale
        if (selectedNodeId === nodeId) {
          group.scale.lerp(new THREE.Vector3(1.25 * scaleMultiplier, 1.25 * scaleMultiplier, 1.25 * scaleMultiplier), 0.1);
        } else {
          group.scale.lerp(new THREE.Vector3(scaleMultiplier, scaleMultiplier, scaleMultiplier), 0.1);
        }
      });

      // Animate Highway Energy Pulses
      animatedPulsesRef.current.forEach((pulse) => {
        pulse.offset += pulse.speed;
        if (pulse.offset > 1.0) pulse.offset = 0.0;
        const pt = pulse.curve.getPointAt(pulse.offset);
        pulse.mesh.position.copy(pt);
      });

      // Animate Fog-of-War particles (Smooth drifting volumetric mist)
      animatedFogRegionsRef.current.forEach((fog) => {
        const positions = fog.points.geometry.attributes.position as THREE.BufferAttribute;
        const count = fog.speeds.length;

        for (let i = 0; i < count; i++) {
          fog.angles[i] += fog.speeds[i];
          const x = fog.center.x + Math.cos(fog.angles[i]) * fog.radii[i];
          const z = fog.center.z + Math.sin(fog.angles[i]) * fog.radii[i];
          const y = fog.yPositions[i] + Math.sin(elapsedTime * 0.9 + i) * 0.35;

          positions.setXYZ(i, x, y, z);
        }
        positions.needsUpdate = true;
      });

      // Animate Active Selection Beacon (Toned down)
      if (selectionGroupRef.current && selectionGroupRef.current.children.length > 0) {
        selectionGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.name === 'ring1') child.rotation.z = elapsedTime * 1.5;
            if (child.name === 'ring2') child.rotation.z = -elapsedTime * 1.2;
            if (child.name === 'beam') {
              const mat = child.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.18 + Math.sin(elapsedTime * 3) * 0.08;
            }
          }
        });
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 10. Resize Listener with Frustum Update
    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 11. Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlsStart);

      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }

      controls.dispose();
      disposeObjectHierarchy(scene);
      renderer.dispose();

      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 2. Build Island Terrains (Richer Plateau Colors & Topo Rings)
  // -------------------------------------------------------------
  useEffect(() => {
    const islandsGroup = islandsGroupRef.current;
    if (!islandsGroup) return;

    while (islandsGroup.children.length > 0) {
      const child = islandsGroup.children[0];
      islandsGroup.remove(child);
      disposeObjectHierarchy(child);
    }
    islandGroupsRef.current = [];

    const activeRegions = new Set<string>();
    nodes.forEach((n) => activeRegions.add(n.region));

    activeRegions.forEach((regionName) => {
      const theme = REGIONS[regionName] || {
        name: regionName,
        color: '#6366f1',
        emissiveColor: '#818cf8',
        center: { x: 0, y: 0, z: 0 },
        islandRadius: 20,
      };

      const islandGroup = new THREE.Group();
      islandGroup.position.set(theme.center.x, theme.center.y, theme.center.z);

      const radius = theme.islandRadius;
      const themeColor = new THREE.Color(theme.color);

      // Top Plateau: Richer cyber slate `#1e293b` with beveled edges
      const plateauGeo = new THREE.CylinderGeometry(radius * 0.95, radius, 2.8, 8);
      const plateauMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.55,
        metalness: 0.28,
      });
      const plateauMesh = new THREE.Mesh(plateauGeo, plateauMat);
      plateauMesh.position.y = 0;
      islandGroup.add(plateauMesh);

      // Topography Ring on Plateau surface
      const topoGeo = new THREE.RingGeometry(radius * 0.45, radius * 0.48, 48);
      topoGeo.rotateX(-Math.PI / 2);
      const topoMat = new THREE.MeshBasicMaterial({
        color: themeColor,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      });
      const topoMesh = new THREE.Mesh(topoGeo, topoMat);
      topoMesh.position.y = 1.42;
      islandGroup.add(topoMesh);

      // Mid Foundation
      const midGeo = new THREE.CylinderGeometry(radius * 0.88, radius * 0.55, 3.8, 8);
      const midMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.85,
        metalness: 0.15,
      });
      const midMesh = new THREE.Mesh(midGeo, midMat);
      midMesh.position.y = -2.8;
      islandGroup.add(midMesh);

      // Inverted Stalactite Keel Core
      const keelGeo = new THREE.ConeGeometry(radius * 0.45, 7.5, 8);
      keelGeo.rotateX(Math.PI);
      const keelMat = new THREE.MeshStandardMaterial({
        color: 0x060912,
        roughness: 0.9,
        metalness: 0.1,
      });
      const keelMesh = new THREE.Mesh(keelGeo, keelMat);
      keelMesh.position.y = -7.5;
      islandGroup.add(keelMesh);

      // Glowing Rim Light
      const rimGeo = new THREE.TorusGeometry(radius * 0.96, 0.22, 16, 64);
      rimGeo.rotateX(Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 2.2,
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = 1.4;
      islandGroup.add(rimMesh);

      // Floating Outer Perimeter Orbit Ring
      const orbitGeo = new THREE.TorusGeometry(radius * 1.15, 0.08, 16, 64);
      orbitGeo.rotateX(Math.PI / 2);
      const orbitMat = new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.4,
      });
      const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
      orbitMesh.position.y = 0.5;
      islandGroup.add(orbitMesh);

      // Subtle Island Point Light
      const islandPointLight = new THREE.PointLight(themeColor, 35, 45, 2);
      islandPointLight.position.set(0, 5, 0);
      islandGroup.add(islandPointLight);

      // Floating 3D Text Sprite Label (named for distance-attenuated scaling)
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 512, 128);

        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = theme.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(theme.name.toUpperCase(), 256, 64);

        const labelTexture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({
          map: labelTexture,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.name = 'island-label';
        sprite.position.set(0, 4.2, radius * 0.65);
        sprite.scale.set(14, 7, 1);
        islandGroup.add(sprite);
      }

      islandsGroup.add(islandGroup);
      islandGroupsRef.current.push({
        group: islandGroup,
        phase: Math.random() * Math.PI * 2,
      });
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 3. Build 3D Landmarks per Node Status
  // -------------------------------------------------------------
  useEffect(() => {
    const landmarksGroup = landmarksGroupRef.current;
    if (!landmarksGroup) return;

    while (landmarksGroup.children.length > 0) {
      const child = landmarksGroup.children[0];
      landmarksGroup.remove(child);
      disposeObjectHierarchy(child);
    }
    animatedLandmarksRef.current.clear();

    nodes.forEach((node) => {
      const group = new THREE.Group();
      group.name = node.id;
      group.position.set(node.position.x, node.position.y, node.position.z);

      const status: NodeStatus = node.status;
      const baseY = 0;

      // Base Pedestal for all landmarks
      const baseGeo = new THREE.CylinderGeometry(2.2, 2.6, 0.7, 8);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.8,
        metalness: 0.3,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.35;
      group.add(baseMesh);

      // Base glow ring
      const baseRingGeo = new THREE.RingGeometry(2.15, 2.35, 32);
      baseRingGeo.rotateX(-Math.PI / 2);
      const baseRingMat = new THREE.MeshBasicMaterial({
        color: status === 'COMPLETED' ? 0xfbbf24 : status === 'UNLOCKED' ? 0x38bdf8 : 0x475569,
        side: THREE.DoubleSide,
      });
      const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
      baseRing.position.y = 0.72;
      group.add(baseRing);

      let crystalMesh: THREE.Mesh | undefined;
      let mistRing: THREE.Mesh | undefined;
      let auraPoints: THREE.Points | undefined;
      let crownMesh: THREE.Mesh | undefined;

      if (status === 'COMPLETED') {
        // Golden Monument Pillar
        const pillarGeo = new THREE.CylinderGeometry(1.2, 1.6, 4.2, 6);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          roughness: 0.25,
          metalness: 0.85,
          emissive: 0xd97706,
          emissiveIntensity: 0.45,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = 2.45;
        group.add(pillar);

        // Radiant Spire Crown
        const crownGeo = new THREE.OctahedronGeometry(1.3, 0);
        const crownMat = new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.9,
          roughness: 0.15,
          metalness: 0.9,
        });
        crownMesh = new THREE.Mesh(crownGeo, crownMat);
        crownMesh.position.y = 5.2;
        group.add(crownMesh);

        // Golden Particle Aura
        const auraCount = 45;
        const auraGeo = new THREE.BufferGeometry();
        const auraPos = new Float32Array(auraCount * 3);
        for (let i = 0; i < auraCount; i++) {
          const theta = Math.random() * Math.PI * 2;
          const r = 1.4 + Math.random() * 1.5;
          auraPos[i * 3] = Math.cos(theta) * r;
          auraPos[i * 3 + 1] = 1.0 + Math.random() * 5.0;
          auraPos[i * 3 + 2] = Math.sin(theta) * r;
        }
        auraGeo.setAttribute('position', new THREE.BufferAttribute(auraPos, 3));
        const auraMat = new THREE.PointsMaterial({
          color: 0xfef08a,
          size: 0.7,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        auraPoints = new THREE.Points(auraGeo, auraMat);
        group.add(auraPoints);

        // Subtle sky beam (toned down)
        const skyBeamGeo = new THREE.CylinderGeometry(0.06, 0.25, 8, 16, 1, true);
        const skyBeamMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const skyBeam = new THREE.Mesh(skyBeamGeo, skyBeamMat);
        skyBeam.position.y = 7.5;
        group.add(skyBeam);

      } else if (status === 'UNLOCKED') {
        // Vibrant Cyan Crystal Beacon (Octahedron)
        const crystalGeo = new THREE.OctahedronGeometry(1.85, 1);
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.75,
          roughness: 0.2,
          metalness: 0.6,
        });
        crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
        crystalMesh.position.y = 2.4;
        group.add(crystalMesh);

        // Orbiting Mini-Crystal Satellites
        const satCount = 3;
        for (let s = 0; s < satCount; s++) {
          const satGeo = new THREE.OctahedronGeometry(0.4, 0);
          const satMat = new THREE.MeshStandardMaterial({
            color: 0x7dd3fc,
            emissive: 0x0369a1,
            emissiveIntensity: 0.8,
          });
          const satMesh = new THREE.Mesh(satGeo, satMat);
          const angle = (s / satCount) * Math.PI * 2;
          satMesh.position.set(Math.cos(angle) * 2.8, 2.4, Math.sin(angle) * 2.8);
          crystalMesh.add(satMesh);
        }

        // Hover Ring
        const ringGeo = new THREE.TorusGeometry(2.7, 0.08, 16, 32);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.7,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 2.4;
        group.add(ring);

      } else {
        // LOCKED: Dim Obsidian Monolith
        const monoGeo = new THREE.BoxGeometry(2.0, 3.8, 2.0);
        const monoMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.88,
          metalness: 0.18,
        });
        const monoMesh = new THREE.Mesh(monoGeo, monoMat);
        monoMesh.position.y = 2.25;
        group.add(monoMesh);

        // Rune Mist Ring
        const mistRingGeo = new THREE.RingGeometry(2.4, 2.7, 16);
        mistRingGeo.rotateX(-Math.PI / 2);
        const mistRingMat = new THREE.MeshBasicMaterial({
          color: 0x475569,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        mistRing = new THREE.Mesh(mistRingGeo, mistRingMat);
        mistRing.position.y = 0.75;
        group.add(mistRing);
      }

      landmarksGroup.add(group);
      animatedLandmarksRef.current.set(node.id, {
        nodeId: node.id,
        status,
        group,
        crystalMesh,
        mistRing,
        auraPoints,
        crownMesh,
        baseY,
        phaseOffset: Math.random() * Math.PI * 2,
      });
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 4. Build Connecting Road Highways & Energy Pulses
  // -------------------------------------------------------------
  useEffect(() => {
    const roadsGroup = roadsGroupRef.current;
    if (!roadsGroup) return;

    while (roadsGroup.children.length > 0) {
      const child = roadsGroup.children[0];
      roadsGroup.remove(child);
      disposeObjectHierarchy(child);
    }
    animatedPulsesRef.current = [];

    edges.forEach((edge) => {
      const fromNode = nodesMap.get(edge.fromNodeId);
      const toNode = nodesMap.get(edge.toNodeId);
      if (!fromNode || !toNode) return;

      const p1 = new THREE.Vector3(fromNode.position.x, fromNode.position.y + 0.8, fromNode.position.z);
      const p3 = new THREE.Vector3(toNode.position.x, toNode.position.y + 0.8, toNode.position.z);

      // Parabolic midpoint arc
      const mid = new THREE.Vector3().addVectors(p1, p3).multiplyScalar(0.5);
      const dist = p1.distanceTo(p3);
      mid.y += Math.min(9.0, Math.max(3.5, dist * 0.25));

      const curve = new THREE.CatmullRomCurve3([p1, mid, p3]);

      const isBothCompleted = fromNode.status === 'COMPLETED' && toNode.status === 'COMPLETED';
      const isRoadUnlocked = toNode.status === 'UNLOCKED' || isBothCompleted;

      const roadColor = isBothCompleted ? 0xfbbf24 : isRoadUnlocked ? 0x06b6d4 : 0x334155;
      const roadRadius = isBothCompleted ? 0.22 : isRoadUnlocked ? 0.18 : 0.1;

      const tubeGeo = new THREE.TubeGeometry(curve, 32, roadRadius, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: roadColor,
        emissive: roadColor,
        emissiveIntensity: isBothCompleted ? 0.8 : isRoadUnlocked ? 0.6 : 0.1,
        roughness: 0.3,
        metalness: 0.7,
        transparent: !isRoadUnlocked,
        opacity: isRoadUnlocked ? 1.0 : 0.45,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      roadsGroup.add(tubeMesh);

      // Energy Pulse traveling along active road curves
      if (isRoadUnlocked) {
        const pulseGeo = new THREE.SphereGeometry(roadRadius * 1.8, 12, 12);
        const pulseMat = new THREE.MeshBasicMaterial({
          color: isBothCompleted ? 0xfef08a : 0x7dd3fc,
        });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        pulseMesh.position.copy(p1);
        roadsGroup.add(pulseMesh);

        animatedPulsesRef.current.push({
          curve,
          mesh: pulseMesh,
          speed: 0.006 + Math.random() * 0.004,
          offset: Math.random(),
        });
      }
    });
  }, [edges, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 5. Build Fog-of-War Shroud (Soft Radial Volumetric Mist)
  // -------------------------------------------------------------
  useEffect(() => {
    const fogGroup = fogGroupRef.current;
    if (!fogGroup) return;

    while (fogGroup.children.length > 0) {
      const child = fogGroup.children[0];
      fogGroup.remove(child);
      disposeObjectHierarchy(child);
    }
    animatedFogRegionsRef.current = [];

    // Identify regions containing locked nodes
    const lockedNodesByRegion = new Map<string, MapNode[]>();
    nodes.forEach((n) => {
      if (n.status === 'LOCKED') {
        const list = lockedNodesByRegion.get(n.region) || [];
        list.push(n);
        lockedNodesByRegion.set(n.region, list);
      }
    });

    const mistTexture = createSoftMistTexture();

    lockedNodesByRegion.forEach((lockedList, regionName) => {
      const theme = REGIONS[regionName];
      const center = theme ? theme.center : { x: 0, y: 0, z: 0 };
      const baseRadius = theme ? theme.islandRadius : 20;

      const particleCount = 140;
      const positions = new Float32Array(particleCount * 3);
      const speeds = new Float32Array(particleCount);
      const angles = new Float32Array(particleCount);
      const radii = new Float32Array(particleCount);
      const yPositions = new Float32Array(particleCount);

      for (let i = 0; i < particleCount; i++) {
        angles[i] = Math.random() * Math.PI * 2;
        radii[i] = 3 + Math.random() * baseRadius * 0.9;
        speeds[i] = 0.0012 + Math.random() * 0.002;
        yPositions[i] = 1.2 + Math.random() * 6.5;

        positions[i * 3] = center.x + Math.cos(angles[i]) * radii[i];
        positions[i * 3 + 1] = yPositions[i];
        positions[i * 3 + 2] = center.z + Math.sin(angles[i]) * radii[i];
      }

      const fogGeo = new THREE.BufferGeometry();
      fogGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      // Soft circular radial alpha mist (replaces 4.8 gray squares)
      const fogMat = new THREE.PointsMaterial({
        map: mistTexture,
        color: 0x94a3b8,
        size: 2.4,
        transparent: true,
        opacity: 0.42,
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

      // Translucent locked node mist domes
      lockedList.forEach((lockedNode) => {
        const domeGeo = new THREE.SphereGeometry(2.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.28,
          side: THREE.BackSide,
          depthWrite: false,
        });
        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        domeMesh.position.set(lockedNode.position.x, lockedNode.position.y + 0.2, lockedNode.position.z);
        fogGroup.add(domeMesh);
      });
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 6. Build Selection Reticle & Sky Beam (Toned down)
  // -------------------------------------------------------------
  useEffect(() => {
    const selectionGroup = selectionGroupRef.current;
    if (!selectionGroup) return;

    while (selectionGroup.children.length > 0) {
      const child = selectionGroup.children[0];
      selectionGroup.remove(child);
      disposeObjectHierarchy(child);
    }

    if (!selectedNodeId) return;

    const node = nodesMap.get(selectedNodeId);
    if (!node) return;

    const { x, y, z } = node.position;

    // Outer Target Reticle Rings
    const ring1Geo = new THREE.RingGeometry(3.0, 3.25, 32);
    ring1Geo.rotateX(-Math.PI / 2);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.name = 'ring1';
    ring1.position.set(x, y + 0.8, z);
    selectionGroup.add(ring1);

    const ring2Geo = new THREE.RingGeometry(3.6, 3.75, 24);
    ring2Geo.rotateX(-Math.PI / 2);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.name = 'ring2';
    ring2.position.set(x, y + 0.82, z);
    selectionGroup.add(ring2);

    // Glowing Sky Beacon Beam (Toned down: height 14, opacity 0.2)
    const beamGeo = new THREE.CylinderGeometry(0.08, 0.45, 14, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'beam';
    beam.position.set(x, y + 7.0, z);
    selectionGroup.add(beam);
  }, [selectedNodeId, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 7. Raycasting & Event Handling
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;

    const domElement = renderer.domElement;

    const onPointerMove = (e: MouseEvent) => {
      const rect = domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseCoordsRef.current.set(x, y);

      const camera = cameraRef.current;
      const landmarksGroup = landmarksGroupRef.current;
      if (!camera || !landmarksGroup) return;

      raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(landmarksGroup.children, true);

      if (intersects.length > 0) {
        let rootObj: THREE.Object3D | null = intersects[0].object;
        while (rootObj && rootObj.parent && rootObj.parent !== landmarksGroup) {
          rootObj = rootObj.parent;
        }

        const nodeId = rootObj?.name;
        if (nodeId && nodeId !== hoveredNodeIdRef.current) {
          hoveredNodeIdRef.current = nodeId;
          const found = nodesMap.get(nodeId);

          if (found) {
            setHoveredTooltip({
              node: found,
              screenX: e.clientX,
              screenY: e.clientY,
            });

            // Single audio hover trigger: region-tuned frequency
            if (!audioMutedRef.current) {
              playHoverBlip(found.position.y, found.region);
            }
            onHoverNode?.(nodeId);
          }
        } else if (nodeId && hoveredNodeIdRef.current === nodeId) {
          // Update tooltip screen position
          const found = nodesMap.get(nodeId);
          if (found) {
            setHoveredTooltip({
              node: found,
              screenX: e.clientX,
              screenY: e.clientY,
            });
          }
        }
      } else if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        setHoveredTooltip(null);
        onHoverNode?.(null);
      }
    };

    const onPointerLeave = () => {
      hoveredNodeIdRef.current = null;
      setHoveredTooltip(null);
      onHoverNode?.(null);
    };

    const onClick = (e: MouseEvent) => {
      const camera = cameraRef.current;
      const landmarksGroup = landmarksGroupRef.current;
      if (!camera || !landmarksGroup) return;

      const rect = domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseCoordsRef.current.set(x, y);

      raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(landmarksGroup.children, true);

      if (intersects.length > 0) {
        let rootObj: THREE.Object3D | null = intersects[0].object;
        while (rootObj && rootObj.parent && rootObj.parent !== landmarksGroup) {
          rootObj = rootObj.parent;
        }

        const nodeId = rootObj?.name;
        if (nodeId) {
          if (!audioMutedRef.current) {
            playSelectTone();
          }
          onSelectNode(nodeId);
        }
      }
    };

    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerleave', onPointerLeave);
    domElement.addEventListener('click', onClick);

    return () => {
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerleave', onPointerLeave);
      domElement.removeEventListener('click', onClick);
    };
  }, [nodesMap, onSelectNode, onHoverNode]);

  // -------------------------------------------------------------
  // Quick Viewport Mode Toggles
  // -------------------------------------------------------------
  const toggleTopDownView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (!isTopDownView) {
      targetCamPosRef.current.set(0, 110, 0.1);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
      setIsTopDownView(true);
    } else {
      resetCameraToOverview();
    }
  };

  const handleZoomIn = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.multiplyScalar(0.85);
    controlsRef.current.update();
  };

  const handleZoomOut = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.multiplyScalar(1.15);
    controlsRef.current.update();
  };

  return (
    <div
      ref={mountRef}
      className={`relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* Real-time Hovered Node HUD Tooltip */}
      {hoveredTooltip && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-4 px-3.5 py-2.5 rounded-xl glass-panel border border-cyan-500/40 shadow-2xl shadow-black/80 font-mono transition-opacity duration-150 animate-in fade-in"
          style={{
            left: `${hoveredTooltip.screenX}px`,
            top: `${hoveredTooltip.screenY - 14}px`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2 h-2 rounded-full ${
                hoveredTooltip.node.status === 'COMPLETED'
                  ? 'bg-yellow-400 shadow-sm shadow-yellow-400'
                  : hoveredTooltip.node.status === 'UNLOCKED'
                  ? 'bg-cyan-400 shadow-sm shadow-cyan-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-xs font-bold text-slate-100 max-w-[200px] truncate">
              {hoveredTooltip.node.title}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
            <span className="text-cyan-300">{hoveredTooltip.node.region}</span>
            <span className="text-yellow-400 font-semibold">+{hoveredTooltip.node.xpReward} XP</span>
          </div>

          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 border-t border-slate-800/80 pt-1">
            {hoveredTooltip.node.status === 'COMPLETED' ? (
              <span className="text-yellow-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Landmark Mastered
              </span>
            ) : hoveredTooltip.node.status === 'UNLOCKED' ? (
              <span className="text-cyan-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Ready for Exploration
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" /> Prerequisites Required
              </span>
            )}
          </div>
        </div>
      )}

      {/* Floating On-Screen Viewport Navigation Controls */}
      <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
          className="p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg shadow-black/40 bg-slate-900/80 border border-slate-800"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
          className="p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg shadow-black/40 bg-slate-900/80 border border-slate-800"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={toggleTopDownView}
          title={isTopDownView ? 'Switch to Perspective View' : 'Switch to Top-Down View'}
          aria-label="Toggle Top-Down View"
          className={`p-2.5 rounded-xl glass-panel transition-colors shadow-lg shadow-black/40 border ${
            isTopDownView
              ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:text-cyan-400'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        <button
          onClick={resetCameraToOverview}
          title="Reset Camera Overview"
          aria-label="Reset Camera"
          className="p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors shadow-lg shadow-black/40 bg-slate-900/80 border border-slate-800"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Region Quick Jump Bar (Centered horizontally, active regions only) */}
      {activeRegionsList.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 hidden sm:flex items-center gap-2 pointer-events-auto bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-xl shadow-black/60">
          {activeRegionsList.map(([regionName, theme]) => (
            <button
              key={regionName}
              onClick={() => focusCameraOnPosition(theme.center.x, theme.center.y, theme.center.z)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-mono font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 transition-colors flex items-center gap-1.5"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: theme.color }}
              />
              <span>{theme.name.replace(/ Archipelago| Citadel| Sanctuary| Bastion/g, '')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AtlasCanvas3D;
