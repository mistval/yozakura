import { assertNonNullish } from '../../errors/application_error.js';
import type { WorldMap, WorldMapLocation } from '../types.js';
import { breadthFirstSearch } from './graph_search.js';

export function getLocationIds(map: WorldMap) {
  return map.locations.map((location) => location.id);
}

export function getConnectivityIslands(locations: WorldMapLocation[]) {
  const locationsById = new Map(locations.map((location) => [location.id, location] as const));
  const unvisited = new Set(locations.map((location) => location.id));
  const islands: WorldMapLocation[][] = [];

  while (unvisited.size > 0) {
    const startId = unvisited.values().next().value as string | undefined;
    assertNonNullish(startId);

    const { order } = breadthFirstSearch(
      startId,
      (locationId) => locationsById.get(locationId)?.adjacency ?? []
    );

    const islandLocations: WorldMapLocation[] = [];
    for (const locationId of order) {
      unvisited.delete(locationId);
      const location = locationsById.get(locationId);
      if (location) {
        islandLocations.push(location);
      }
    }

    islands.push(islandLocations);
  }

  return islands;
}

export function validateWorldMap(worldMap: Pick<WorldMap, 'name' | 'description' | 'locations'>) {
  const errors: string[] = [];

  if (!String(worldMap.name || '').trim()) {
    errors.push('Map name is required.');
  }

  if (!String(worldMap.description || '').trim()) {
    errors.push('Map description is required.');
  }

  if (worldMap.locations.length === 0) {
    errors.push('At least one location is required.');
    return errors;
  }

  for (const [index, location] of worldMap.locations.entries()) {
    if (!String(location.name || '').trim()) {
      errors.push(`Location ${index + 1} is missing a name.`);
    }

    if (!String(location.description || '').trim()) {
      errors.push(`Location "${location.name}" is missing a description.`);
    }
  }

  const locationSet = new Set(worldMap.locations.map((l) => l.id));

  for (const location of worldMap.locations) {
    for (const targetId of location.adjacency || []) {
      if (!locationSet.has(targetId)) {
        errors.push(`Location ${location.id} has adjacency to unknown location ${targetId}.`);
      }
    }
  }

  const adjacencySetForLocationId = new Map(worldMap.locations.map((l) => [l.id, new Set(l.adjacency)]));

  for (const location of worldMap.locations) {
    for (const adjacentLocation of location.adjacency) {
      const isSymmetrical = adjacencySetForLocationId.get(adjacentLocation)?.has(location.id);
      if (!isSymmetrical) {
        const other = worldMap.locations.find((l) => l.id === adjacentLocation);
        errors.push(
          `Locations ${location.name} and ${other?.name} do not have symmetrical adjacency (suggests a bug in Yozakura)`
        );
      }
    }
  }

  return errors;
}

export function getNewestUpdatedMap(maps: WorldMap[]) {
  if (maps.length === 0) return undefined;

  const sorted = [...maps].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return sorted[0] || undefined;
}
