import { assert } from '../../errors/application_error.js';
import type { WorldMap } from '../types.js';

export function setMapAdjacency(
  map: WorldMap,
  locationId: string,
  targetId: string,
  connected: boolean
): WorldMap {
  assert(locationId !== targetId, 'Trying to set adjacency to self');

  const ids = new Set(getLocationIds(map));
  assert(ids.has(locationId) && ids.has(targetId), 'Could not find location and target');

  return {
    ...map,
    locations: map.locations.map((location) => {
      const otherId =
        location.id === locationId ? targetId : location.id === targetId ? locationId : undefined;

      if (!otherId) {
        return location;
      }

      const withoutOther = location.adjacency.filter((id) => id !== otherId);
      return {
        ...location,
        adjacency: connected ? withoutOther.concat(otherId) : withoutOther,
      };
    }),
  };
}

export function removeMapLocation(map: WorldMap, locationId: string): WorldMap {
  assert(map.locations.length > 1, 'Cannot remove the last location from a map');

  return {
    ...map,
    locations: map.locations
      .filter((location) => location.id !== locationId)
      .map((location) => ({
        ...location,
        adjacency: location.adjacency.filter((id) => id !== locationId),
      })),
    zones: map.zones.map((zone) => ({
      ...zone,
      locationIds: zone.locationIds.filter((id) => id !== locationId),
    })),
  };
}

export function getLocationIds(map: WorldMap) {
  return map.locations.map((location) => location.id);
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
