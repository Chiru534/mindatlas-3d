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

  // Dynamic Scene Groups
  const islandsGroupRef = useRef<THREE.Group | null>(null);
  const landmarksGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const fogGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);

  // Interactive Meshes & Animation State
  const interactiveHitboxesRef = useRef<THREE.Mesh[]>([]);
  const animatedLandmarksRef = useRef<AnimatedLandmark[]>([]);
  const animatedPulsesRef = useRef<AnimatedEnergyPulse[]>([]);
  const animatedFogRegionsRef = useRef<AnimatedFogRegion[]>([]);
  const islandGroupsRef = useRef<{ group: THREE.Group; phase: number }[]>([]);

  // Camera Lerp State
  const isTransitioningCameraRef = useRef<boolean>(false);
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetControlsLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Mouse & Hover UI State
  const mousePosRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipData | null>(null);
  const [isTopDownView, setIsTopDownView] = useState<boolean>(false);

  // Raycaster
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Quick lookup maps
  const nodesMap = useMemo(() => {
    const map = new Map<string, MapNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Recursively dispose geometries, materials, and textures for clean memory hygiene
  const disposeObjectHierarchy = useCallback((obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.Line
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

      const offsetDist = isTopDownView ? 45 : 22;
      const camY = isTopDownView ? y + 60 : y + 14;
      const camZ = isTopDownView ? z + 0.1 : z + offsetDist;
      const camX = isTopDownView ? x : x + 12;

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
    [isTopDownView]
  );

  // Reset Camera to Master Overview
  const resetCameraToOverview = useCallback(() => {
    focusCameraOnPosition(0, 0, 0, false);
    targetCamPosRef.current.set(0, 52, 62);
    targetControlsLookAtRef.current.set(0, 0, 0);
    isTransitioningCameraRef.current = true;
    onRequestResetCamera?.();
  }, [focusCameraOnPosition, onRequestResetCamera]);

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
  // 1. Initial Scene Setup & Three.js WebGL Lifecycle
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
    scene.fog = new THREE.FogExp2(0x060913, 0.008);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 1000);
    camera.position.set(0, 52, 62);
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
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't go below horizon
    controls.minDistance = 10;
    controls.maxDistance = 200;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Cancel automatic camera lerp if user manually interacts with controls
    const onControlsStart = () => {
      isTransitioningCameraRef.current = false;
    };
    controls.addEventListener('start', onControlsStart);

    // 5. Environmental Lighting
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    scene.add(ambientLight);

    const keyDirectionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyDirectionalLight.position.set(40, 65, 35);
    scene.add(keyDirectionalLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x030712, 0.8);
    scene.add(hemiLight);

    // 6. Holographic Tech Grid Floor
    const gridHelper = new THREE.GridHelper(180, 45, 0x1e3a8a, 0x0c162c);
    gridHelper.position.y = -5.0;
    scene.add(gridHelper);

    // Circular Sci-Fi Range Rings at floor
    const ringGeo1 = new THREE.RingGeometry(35, 35.4, 64);
    ringGeo1.rotateX(-Math.PI / 2);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    ringMesh1.position.y = -4.9;
    scene.add(ringMesh1);

    const ringGeo2 = new THREE.RingGeometry(65, 65.5, 64);
    ringGeo2.rotateX(-Math.PI / 2);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.position.y = -4.9;
    scene.add(ringMesh2);

    // 7. Cosmic Particle Starfield
    const starCount = 1000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starPalette = [
      new THREE.Color(0x38bdf8),
      new THREE.Color(0x818cf8),
      new THREE.Color(0xfef08a),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < starCount; i++) {
      const radius = 90 + Math.random() * 140;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.max(5, radius * Math.sin(phi) * Math.sin(theta));
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      const color = starPalette[Math.floor(Math.random() * starPalette.length)];
      starColors[i * 3] = color.r;
      starColors[i * 3 + 1] = color.g;
      starColors[i * 3 + 2] = color.b;
    }

    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starsMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const starPoints = new THREE.Points(starsGeo, starsMat);
    scene.add(starPoints);

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
    let clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Update Controls
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

      // Rotate subtle starfield
      starPoints.rotation.y = elapsedTime * 0.012;

      // Animate Islands Bobbing
      islandGroupsRef.current.forEach(({ group, phase }) => {
        group.position.y = Math.sin(elapsedTime * 0.8 + phase) * 0.28;
      });

      // Animate Landmark Meshes
      animatedLandmarksRef.current.forEach((landmark) => {
        const { status, group, crystalMesh, mistRing, auraPoints, crownMesh, baseY, phaseOffset } =
          landmark;

        if (status === 'UNLOCKED') {
          // Bobbing crystal beacon
          const bob = Math.sin(elapsedTime * 2.4 + phaseOffset) * 0.35;
          group.position.y = baseY + bob;

          if (crystalMesh) {
            crystalMesh.rotation.y = elapsedTime * 1.5;
            crystalMesh.rotation.x = Math.sin(elapsedTime * 1.2) * 0.2;

            // Pulse emissive glow
            const mat = crystalMesh.material as THREE.MeshPhysicalMaterial;
            if (mat && 'emissiveIntensity' in mat) {
              mat.emissiveIntensity = 1.0 + Math.sin(elapsedTime * 3.5 + phaseOffset) * 0.45;
            }
          }
        } else if (status === 'COMPLETED') {
          // Gentle floating golden monument
          const bob = Math.sin(elapsedTime * 1.2 + phaseOffset) * 0.15;
          group.position.y = baseY + bob;

          if (crownMesh) {
            crownMesh.rotation.y = -elapsedTime * 1.2;
          }

          if (auraPoints) {
            auraPoints.rotation.y = elapsedTime * 0.8;
          }
        } else if (status === 'LOCKED') {
          // Slowly rotating mist ring around dark monolith
          if (mistRing) {
            mistRing.rotation.z = elapsedTime * 0.6;
          }
        }
      });

      // Animate Energy Pulses along highways
      animatedPulsesRef.current.forEach((pulse) => {
        const t = (elapsedTime * pulse.speed + pulse.offset) % 1.0;
        const pt = pulse.curve.getPointAt(t);
        pulse.mesh.position.copy(pt);
      });

      // Animate Fog-of-War particles
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

      // Animate Active Selection Beam
      if (selectionGroupRef.current && selectionGroupRef.current.children.length > 0) {
        selectionGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.name === 'ring1') child.rotation.z = elapsedTime * 1.5;
            if (child.name === 'ring2') child.rotation.z = -elapsedTime * 1.2;
            if (child.name === 'beam') {
              const mat = child.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.3 + Math.sin(elapsedTime * 4) * 0.15;
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

      disposeObjectHierarchy(scene);
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 2. Build Floating Regional Islands
  // -------------------------------------------------------------
  useEffect(() => {
    const islandsGroup = islandsGroupRef.current;
    if (!islandsGroup) return;

    // Clear old islands
    disposeObjectHierarchy(islandsGroup);
    while (islandsGroup.children.length > 0) {
      islandsGroup.remove(islandsGroup.children[0]);
    }
    islandGroupsRef.current = [];

    // Group nodes by region to know which regions are populated
    const regionNamesSet = new Set<string>();
    nodes.forEach((n) => regionNamesSet.add(n.region));

    // Ensure all 4 canonical regions always exist, plus any custom imported ones
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

      // Top Hexagonal Plateau
      const plateauGeo = new THREE.CylinderGeometry(radius, radius * 0.88, 2.8, 8);
      const plateauMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.65,
        metalness: 0.35,
      });
      const plateauMesh = new THREE.Mesh(plateauGeo, plateauMat);
      plateauMesh.position.y = 0;
      islandGroup.add(plateauMesh);

      // Mid Foundation
      const midGeo = new THREE.CylinderGeometry(radius * 0.88, radius * 0.55, 3.8, 8);
      const midMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
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
        opacity: 0.45,
      });
      const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
      orbitMesh.position.y = 0.5;
      islandGroup.add(orbitMesh);

      // Subtle Island Point Light
      const islandPointLight = new THREE.PointLight(themeColor, 35, 45, 2);
      islandPointLight.position.set(0, 5, 0);
      islandGroup.add(islandPointLight);

      // Floating 3D Text Sprite Label
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = 'rgba(6, 10, 20, 0.82)';
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
      sprite.position.set(0, 7.5, 0);
      islandGroup.add(sprite);

      islandsGroup.add(islandGroup);
      islandGroupsRef.current.push({
        group: islandGroup,
        phase: (index * Math.PI) / 3,
      });

      index++;
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 3. Build 3D Landmark Meshes per Node Status
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

    nodes.forEach((node, idx) => {
      const landmarkGroup = new THREE.Group();
      landmarkGroup.position.set(node.position.x, node.position.y, node.position.z);
      landmarkGroup.name = `landmark-${node.id}`;

      // Invisible Raycast Hitbox for seamless interaction
      const hitboxGeo = new THREE.BoxGeometry(3.0, 5.0, 3.0);
      const hitboxMat = new THREE.MeshBasicMaterial({
        visible: false,
      });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.y = 2.0;
      hitbox.userData = { nodeId: node.id };
      landmarkGroup.add(hitbox);
      interactiveHitboxesRef.current.push(hitbox);

      // Base Pedestal
      const pedestalGeo = new THREE.CylinderGeometry(1.4, 1.7, 0.45, 6);
      let pedestalColor = 0x1e293b;
      if (node.status === 'UNLOCKED') pedestalColor = 0x0369a1;
      if (node.status === 'COMPLETED') pedestalColor = 0x854d0e;

      const pedestalMat = new THREE.MeshStandardMaterial({
        color: pedestalColor,
        roughness: 0.4,
        metalness: 0.6,
      });
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = 0.22;
      landmarkGroup.add(pedestal);

      let crystalMesh: THREE.Mesh | undefined;
      let mistRing: THREE.Mesh | undefined;
      let auraPoints: THREE.Points | undefined;
      let crownMesh: THREE.Mesh | undefined;

      // Status 1: LOCKED — Dim Obsidian Monolith
      if (node.status === 'LOCKED') {
        const monolithGeo = new THREE.BoxGeometry(1.2, 3.2, 1.2);
        const monolithMat = new THREE.MeshStandardMaterial({
          color: 0x11141c,
          roughness: 0.35,
          metalness: 0.85,
          emissive: 0x05070e,
        });
        const monolith = new THREE.Mesh(monolithGeo, monolithMat);
        monolith.position.y = 1.85;
        landmarkGroup.add(monolith);

        // Rotating Mist/Rune Ring
        const mistGeo = new THREE.TorusGeometry(1.8, 0.06, 16, 48);
        mistGeo.rotateX(Math.PI / 4);
        const mistMat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          emissive: 0x334155,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.65,
        });
        mistRing = new THREE.Mesh(mistGeo, mistMat);
        mistRing.position.y = 1.8;
        landmarkGroup.add(mistRing);
      }

      // Status 2: UNLOCKED — Vibrant Cyan Crystal Beacon
      if (node.status === 'UNLOCKED') {
        const crystalGeo = new THREE.OctahedronGeometry(1.3, 0);
        const crystalMat = new THREE.MeshPhysicalMaterial({
          color: 0x00f5ff,
          emissive: 0x0284c7,
          emissiveIntensity: 1.1,
          roughness: 0.12,
          metalness: 0.25,
          transmission: 0.25,
          transparent: true,
          opacity: 0.94,
        });
        crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
        crystalMesh.position.y = 2.2;
        landmarkGroup.add(crystalMesh);

        // 3 Orbiting Mini Crystal Satellites
        for (let s = 0; s < 3; s++) {
          const satGeo = new THREE.OctahedronGeometry(0.28, 0);
          const satMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
          const satMesh = new THREE.Mesh(satGeo, satMat);
          const angle = (s * Math.PI * 2) / 3;
          satMesh.position.set(Math.cos(angle) * 2.2, 2.2, Math.sin(angle) * 2.2);
          landmarkGroup.add(satMesh);
        }

        // Floating Cyan Dais Rim
        const daisRimGeo = new THREE.TorusGeometry(1.4, 0.08, 16, 32);
        daisRimGeo.rotateX(Math.PI / 2);
        const daisRimMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
        const daisRim = new THREE.Mesh(daisRimGeo, daisRimMat);
        daisRim.position.y = 0.45;
        landmarkGroup.add(daisRim);
      }

      // Status 3: COMPLETED — Golden Crowned Monument
      if (node.status === 'COMPLETED') {
        const pillarGeo = new THREE.CylinderGeometry(0.85, 1.15, 2.7, 6);
        const goldMat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          emissive: 0xb45309,
          emissiveIntensity: 0.6,
          metalness: 0.94,
          roughness: 0.14,
        });
        const pillar = new THREE.Mesh(pillarGeo, goldMat);
        pillar.position.y = 1.35;
        landmarkGroup.add(pillar);

        // Crowned Spire
        const crownGeo = new THREE.ConeGeometry(0.95, 1.3, 6);
        crownMesh = new THREE.Mesh(crownGeo, goldMat);
        crownMesh.position.y = 3.25;
        landmarkGroup.add(crownMesh);

        // Floating Crown Jewel
        const jewelGeo = new THREE.IcosahedronGeometry(0.5, 0);
        const jewelMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
        const jewelMesh = new THREE.Mesh(jewelGeo, jewelMat);
        jewelMesh.position.y = 4.3;
        landmarkGroup.add(jewelMesh);

        // Golden Particle Aura
        const auraParticleCount = 32;
        const auraPositions = new Float32Array(auraParticleCount * 3);
        for (let p = 0; p < auraParticleCount; p++) {
          const t = p / auraParticleCount;
          const theta = t * Math.PI * 4;
          const r = 1.8 + Math.sin(t * Math.PI) * 0.4;
          auraPositions[p * 3] = Math.cos(theta) * r;
          auraPositions[p * 3 + 1] = 0.8 + t * 3.8;
          auraPositions[p * 3 + 2] = Math.sin(theta) * r;
        }

        const auraGeo = new THREE.BufferGeometry();
        auraGeo.setAttribute('position', new THREE.BufferAttribute(auraPositions, 3));
        const auraMat = new THREE.PointsMaterial({
          color: 0xfef08a,
          size: 0.32,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        auraPoints = new THREE.Points(auraGeo, auraMat);
        landmarkGroup.add(auraPoints);

        // Radiant sky beam
        const skyBeamGeo = new THREE.CylinderGeometry(0.12, 0.4, 16, 16, 1, true);
        const skyBeamMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const skyBeam = new THREE.Mesh(skyBeamGeo, skyBeamMat);
        skyBeam.position.y = 10;
        landmarkGroup.add(skyBeam);
      }

      landmarksGroup.add(landmarkGroup);

      animatedLandmarksRef.current.push({
        nodeId: node.id,
        status: node.status,
        group: landmarkGroup,
        crystalMesh,
        mistRing,
        auraPoints,
        crownMesh,
        baseY: node.position.y,
        phaseOffset: idx * 0.7,
      });
    });
  }, [nodes, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 4. Build Connecting Road Highways
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

      const pFrom = new THREE.Vector3(fromNode.position.x, fromNode.position.y + 0.4, fromNode.position.z);
      const pTo = new THREE.Vector3(toNode.position.x, toNode.position.y + 0.4, toNode.position.z);

      const dist = pFrom.distanceTo(pTo);
      const pMid = new THREE.Vector3()
        .addVectors(pFrom, pTo)
        .multiplyScalar(0.5);
      pMid.y = Math.max(pFrom.y, pTo.y) + 1.2 + dist * 0.08;

      const curve = new THREE.CatmullRomCurve3([pFrom, pMid, pTo]);
      const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.16, 8, false);

      const isBothCompleted = fromNode.status === 'COMPLETED' && toNode.status === 'COMPLETED';
      const isUnlockedHighway = fromNode.status === 'COMPLETED' && toNode.status === 'UNLOCKED';

      let tubeMat: THREE.MeshStandardMaterial;

      if (isBothCompleted) {
        tubeMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 1.4,
          roughness: 0.25,
          metalness: 0.8,
        });
      } else if (isUnlockedHighway) {
        tubeMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x0891b2,
          emissiveIntensity: 1.3,
          roughness: 0.3,
          metalness: 0.6,
        });
      } else {
        tubeMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0x0f172a,
          emissiveIntensity: 0.2,
          roughness: 0.85,
          transparent: true,
          opacity: 0.45,
        });
      }

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      roadsGroup.add(tubeMesh);

      // Energy Pulse traveling along unlocked / completed highways
      if (isBothCompleted || isUnlockedHighway) {
        const pulseColor = isBothCompleted ? 0xfef08a : 0x38bdf8;
        const pulseGeo = new THREE.SphereGeometry(0.32, 12, 12);
        const pulseMat = new THREE.MeshBasicMaterial({
          color: pulseColor,
        });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        roadsGroup.add(pulseMesh);

        animatedPulsesRef.current.push({
          curve,
          mesh: pulseMesh,
          speed: 0.25 + (index % 3) * 0.08,
          offset: (index * 0.35) % 1.0,
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

    // Identify regions containing locked nodes
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

      const particleCount = 120;
      const positions = new Float32Array(particleCount * 3);
      const speeds = new Float32Array(particleCount);
      const angles = new Float32Array(particleCount);
      const radii = new Float32Array(particleCount);
      const yPositions = new Float32Array(particleCount);

      const baseRadius = theme ? theme.islandRadius * 0.95 : 18;

      for (let i = 0; i < particleCount; i++) {
        angles[i] = Math.random() * Math.PI * 2;
        radii[i] = 4 + Math.random() * baseRadius;
        speeds[i] = 0.0015 + Math.random() * 0.0025;
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

      // Individual locked node fog domes
      lockedList.forEach((lockedNode) => {
        const domeGeo = new THREE.SphereGeometry(2.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.35,
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
  // 6. Build Selection Reticle & Sky Beam
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

    // Dual holographic rings
    const ring1Geo = new THREE.TorusGeometry(2.1, 0.08, 16, 48);
    ring1Geo.rotateX(Math.PI / 2);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.name = 'ring1';
    ring1.position.set(x, y + 0.3, z);
    selectionGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.6, 0.05, 16, 48);
    ring2Geo.rotateX(Math.PI / 2);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.name = 'ring2';
    ring2.position.set(x, y + 0.3, z);
    selectionGroup.add(ring2);

    // Glowing Sky Beacon Beam
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.85, 45, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'beam';
    beam.position.set(x, y + 22.5, z);
    selectionGroup.add(beam);
  }, [selectedNodeId, nodesMap, disposeObjectHierarchy]);

  // -------------------------------------------------------------
  // 7. Raycasting, Pointer Events & Audio Triggers
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
          const screenPos = new THREE.Vector3(node.position.x, node.position.y + 3.2, node.position.z);
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
      // Only handle primary left click/tap
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
    camera.position.addScaledVector(dir, 8);
    controls.update();
  };

  const handleZoomOut = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    camera.position.addScaledVector(dir, 8);
    controls.update();
  };

  const toggleTopDownView = () => {
    const newMode = !isTopDownView;
    setIsTopDownView(newMode);
    if (newMode) {
      targetCamPosRef.current.set(0, 85, 0.1);
      targetControlsLookAtRef.current.set(0, 0, 0);
      isTransitioningCameraRef.current = true;
    } else {
      targetCamPosRef.current.set(0, 52, 62);
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
      className={`relative w-full h-full overflow-hidden select-none bg-[#060913] ${className}`}
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
          <div className="glass-panel p-3 rounded-xl border border-cyan-500/40 shadow-xl shadow-cyan-950/60 max-w-xs backdrop-blur-md bg-slate-950/85 text-slate-100">
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
              ? 'text-cyan-400 border-cyan-500/50 bg-cyan-950/50'
              : 'text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 bg-slate-900/80 border-slate-800'
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

      {/* Floating Region Quick Jump Bar */}
      <div className="absolute bottom-6 left-6 z-30 hidden sm:flex items-center gap-2 pointer-events-auto bg-slate-950/70 p-1.5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
        {Object.entries(REGIONS).map(([regionName, theme]) => (
          <button
            key={regionName}
            onClick={() => jumpToRegion(regionName)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all border border-transparent hover:border-slate-700"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
            />
            <span>{regionName.replace(' Archipelago', '').replace(' Sanctuary', '').replace(' Citadel', '').replace(' Bastion', '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AtlasCanvas3D;
