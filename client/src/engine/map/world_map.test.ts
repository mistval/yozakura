import { describe, expect, it } from 'vitest';
import type { WorldMap, WorldMapLocation } from '../types.js';
import { removeMapLocation, setMapAdjacency } from './world_map';

function makeLocation(id: string, adjacency: string[] = []): WorldMapLocation {
  return {
    id,
    name: id,
    description: '',
    adjacency,
    isEphemeral: false,
    createdAt: '',
    updatedAt: '',
  };
}

function makeMap(locations: WorldMapLocation[], zoneLocationIds: string[] = []): WorldMap {
  return {
    id: 'map',
    name: 'Map',
    description: '',
    locations,
    zones: [
      {
        id: 'zone',
        name: 'Zone',
        locationIds: zoneLocationIds,
        createdAt: '',
        updatedAt: '',
      },
    ],
    createdAt: '',
    updatedAt: '',
  };
}

function adjacencyOf(map: WorldMap, locationId: string) {
  return map.locations.find((location) => location.id === locationId)?.adjacency;
}

describe('setMapAdjacency', () => {
  it('connects two locations symmetrically', () => {
    const map = makeMap([makeLocation('A'), makeLocation('B'), makeLocation('C')]);
    const result = setMapAdjacency(map, 'A', 'B', true);
    expect(adjacencyOf(result, 'A')).toEqual(['B']);
    expect(adjacencyOf(result, 'B')).toEqual(['A']);
    expect(adjacencyOf(result, 'C')).toEqual([]);
  });

  it('does not duplicate an existing connection', () => {
    const map = makeMap([makeLocation('A', ['B']), makeLocation('B', ['A'])]);
    const result = setMapAdjacency(map, 'A', 'B', true);
    expect(adjacencyOf(result, 'A')).toEqual(['B']);
    expect(adjacencyOf(result, 'B')).toEqual(['A']);
  });

  it('disconnects both directions, including one-sided connections', () => {
    const map = makeMap([makeLocation('A', ['B', 'C']), makeLocation('B'), makeLocation('C', ['A'])]);
    const result = setMapAdjacency(map, 'A', 'B', false);
    expect(adjacencyOf(result, 'A')).toEqual(['C']);
    expect(adjacencyOf(result, 'B')).toEqual([]);
    expect(adjacencyOf(result, 'C')).toEqual(['A']);
  });

  it('rejects self-adjacency', () => {
    const map = makeMap([makeLocation('A'), makeLocation('B')]);
    expect(() => setMapAdjacency(map, 'A', 'A', true)).toThrow();
  });
});

describe('removeMapLocation', () => {
  it('removes the location and all references to it', () => {
    const map = makeMap(
      [makeLocation('A', ['B']), makeLocation('B', ['A', 'C']), makeLocation('C', ['B'])],
      ['A', 'B']
    );
    const result = removeMapLocation(map, 'B');
    expect(result.locations.map((location) => location.id)).toEqual(['A', 'C']);
    expect(adjacencyOf(result, 'A')).toEqual([]);
    expect(adjacencyOf(result, 'C')).toEqual([]);
    expect(result.zones[0]?.locationIds).toEqual(['A']);
  });

  it('refuses to remove the last location', () => {
    const map = makeMap([makeLocation('A')]);
    expect(() => removeMapLocation(map, 'A')).toThrow();
  });
});
