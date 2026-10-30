import { describe, it, expect } from 'vitest';
import { detectConflicts } from './importConflictResolver.js';
import type { WorldMap, Character } from '../../engine/types.js';

describe('importConflictResolver', () => {
  const dummyMap1 = {
    id: '000000000000000001',
    name: 'Existing Map',
    locations: [],
    zones: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as WorldMap;

  const dummyMap2 = {
    id: '000000000000000002',
    name: 'New Map',
    locations: [],
    zones: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as WorldMap;

  const dummyChar1 = {
    id: '00000000000000000a',
    firstName: 'Alice',
    lastName: 'Smith',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Character;

  const dummyChar2 = {
    id: '00000000000000000b',
    firstName: 'Bob',
    lastName: 'Jones',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Character;

  it('detects no conflicts when selected entities are absent from existing stores', () => {
    const existingMaps = { [dummyMap1.id]: dummyMap1 };
    const existingChars = { [dummyChar1.id]: dummyChar1 };

    const conflicts = detectConflicts([dummyMap2], [dummyChar2], existingMaps, existingChars);
    expect(conflicts).toHaveLength(0);
  });

  it('detects map collisions and defaults action to skip', () => {
    const existingMaps = { [dummyMap1.id]: dummyMap1 };
    const existingChars = {};

    const conflicts = detectConflicts([dummyMap1, dummyMap2], [], existingMaps, existingChars);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      id: dummyMap1.id,
      name: dummyMap1.name,
      kind: 'map',
      action: 'skip',
    });
  });

  it('detects character collisions and formats names correctly', () => {
    const existingMaps = {};
    const existingChars = { [dummyChar1.id]: dummyChar1 };

    const conflicts = detectConflicts([], [dummyChar1, dummyChar2], existingMaps, existingChars);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      id: dummyChar1.id,
      name: 'Alice Smith',
      kind: 'character',
      action: 'skip',
    });
  });

  it('detects mixed map and character collisions', () => {
    const existingMaps = { [dummyMap1.id]: dummyMap1 };
    const existingChars = { [dummyChar1.id]: dummyChar1 };

    const conflicts = detectConflicts(
      [dummyMap1, dummyMap2],
      [dummyChar1, dummyChar2],
      existingMaps,
      existingChars
    );
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.kind)).toEqual(['map', 'character']);
  });
});
