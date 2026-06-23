import { describe, expect, it } from 'vitest';
import { breadthFirstSearch, findNearestReachable } from './graph_search';

const lineAdjacency: Record<string, string[]> = {
  A: ['B'],
  B: ['A', 'C'],
  C: ['B', 'D'],
  D: ['C'],
};

const diamondAdjacency: Record<string, string[]> = {
  A: ['B', 'C'],
  B: ['A', 'D'],
  C: ['A', 'D'],
  D: ['B', 'C'],
};

const neighbors = (adjacency: Record<string, string[]>) => (node: string) => adjacency[node] ?? [];

describe('breadthFirstSearch', () => {
  it('visits nodes in breadth-first order with correct distances', () => {
    const { order, distance } = breadthFirstSearch('A', neighbors(lineAdjacency));
    expect(order).toEqual(['A', 'B', 'C', 'D']);
    expect(distance.get('A')).toBe(0);
    expect(distance.get('D')).toBe(3);
  });

  it('does not enter nodes blocked by canEnter', () => {
    const { order } = breadthFirstSearch('A', neighbors(lineAdjacency), {
      canEnter: (node) => node !== 'C',
    });
    expect(order).toEqual(['A', 'B']);
  });
});

describe('findNearestReachable', () => {
  it('returns only the nearest targets and reconstructs the first step', () => {
    const { targets, firstStepsToward } = findNearestReachable(
      'A',
      neighbors(lineAdjacency),
      (node) => node === 'C' || node === 'D',
      () => true
    );
    expect(targets).toEqual(['C']);
    expect(firstStepsToward('C')).toEqual(['B']);
  });

  it('reports an adjacent target as its own first step', () => {
    const { firstStepsToward } = findNearestReachable(
      'A',
      neighbors(lineAdjacency),
      (node) => node === 'B',
      () => true
    );
    expect(firstStepsToward('B')).toEqual(['B']);
  });

  it('returns every first step that still leads to the target', () => {
    const { targets, firstStepsToward } = findNearestReachable(
      'A',
      neighbors(diamondAdjacency),
      (node) => node === 'D',
      () => true
    );
    expect(targets).toEqual(['D']);
    expect([...firstStepsToward('D')].sort()).toEqual(['B', 'C']);
  });

  it('returns no targets when the path is blocked', () => {
    const { targets } = findNearestReachable(
      'A',
      neighbors(lineAdjacency),
      (node) => node === 'C',
      (node) => node !== 'B'
    );
    expect(targets).toEqual([]);
  });
});
