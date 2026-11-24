import { describe, it, expect } from 'vitest';
import {
  createDefaultDemoNodes,
  detectCycle,
  topologicalSort,
  completeNodeAndPropagate,
  createDefaultWorldState,
  calculateLevelFromXp,
} from './questGraphEngine';
import { MapNode, MapEdge } from '../types/atlas';

describe('QuestGraphEngine - DAG & Topological Validation', () => {
  it('should initialize a valid default demo graph with 0 cycles', () => {
    const { nodes, edges } = createDefaultDemoNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(16);
    expect(edges.length).toBeGreaterThanOrEqual(12);
    expect(detectCycle(nodes, edges)).toBe(false);
  });

  it('should accurately detect cyclic dependencies in graphs', () => {
    const nodes: MapNode[] = [
      { id: 'a', title: 'A', region: 'R', notes: '', xpReward: 100, status: 'UNLOCKED', position: { x: 0, y: 0, z: 0 }, prerequisites: ['b'] },
      { id: 'b', title: 'B', region: 'R', notes: '', xpReward: 100, status: 'LOCKED', position: { x: 0, y: 0, z: 0 }, prerequisites: ['a'] },
    ];
    const edges: MapEdge[] = [
      { id: 'e1', fromNodeId: 'a', toNodeId: 'b' },
      { id: 'e2', fromNodeId: 'b', toNodeId: 'a' },
    ];

    expect(detectCycle(nodes, edges)).toBe(true);
    expect(topologicalSort(nodes, edges)).toBeNull();
  });

  it('should perform valid topological sorting on an acyclic DAG', () => {
    const nodes: MapNode[] = [
      { id: '1', title: 'Foundations', region: 'R', notes: '', xpReward: 100, status: 'COMPLETED', position: { x: 0, y: 0, z: 0 }, prerequisites: [] },
      { id: '2', title: 'Intermediate', region: 'R', notes: '', xpReward: 150, status: 'UNLOCKED', position: { x: 0, y: 0, z: 0 }, prerequisites: ['1'] },
      { id: '3', title: 'Advanced', region: 'R', notes: '', xpReward: 200, status: 'LOCKED', position: { x: 0, y: 0, z: 0 }, prerequisites: ['2'] },
    ];
    const edges: MapEdge[] = [
      { id: 'e1', fromNodeId: '1', toNodeId: '2' },
      { id: 'e2', fromNodeId: '2', toNodeId: '3' },
    ];

    const sorted = topologicalSort(nodes, edges);
    expect(sorted).not.toBeNull();
    expect(sorted!.map((n) => n.id)).toEqual(['1', '2', '3']);
  });

  it('should unlock downstream nodes only when ALL prerequisites are cleared', () => {
    const state = createDefaultWorldState();
    
    // Find an UNLOCKED node with locked downstream children
    const availableNode = state.nodes.find((n) => n.status === 'UNLOCKED');
    expect(availableNode).toBeDefined();

    const result = completeNodeAndPropagate(state, availableNode!.id);
    const completedNode = result.newState.nodes.find((n) => n.id === availableNode!.id);

    expect(completedNode?.status).toBe('COMPLETED');
    expect(result.newlyEarnedXp).toBe(availableNode!.xpReward);
    expect(result.newState.totalXp).toBeGreaterThan(state.totalXp);
  });

  it('should calculate player level accurately using 250 XP tiers', () => {
    expect(calculateLevelFromXp(0)).toBe(1);
    expect(calculateLevelFromXp(249)).toBe(1);
    expect(calculateLevelFromXp(250)).toBe(2);
    expect(calculateLevelFromXp(500)).toBe(3);
    expect(calculateLevelFromXp(1250)).toBe(6);
  });
});
