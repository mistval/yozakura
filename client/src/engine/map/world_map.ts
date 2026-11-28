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

/**
 * Normalizes `map.locations[].adjacency` by removing entries for nonexistent
 * locations (or self-references), deduplicating, and making all edges symmetric.
 */
export function normalizeMapAdjacencies(map: WorldMap): WorldMap {
  const validLocationIds = new Set(getLocationIds(map));
  const neighborsById = new Map<string, string[]>();
  const neighborSetById = new Map<string, Set<string>>();

  for (const location of map.locations) {
    neighborsById.set(location.id, []);
    neighborSetById.set(location.id, new Set());
  }

  const addNeighbor = (fromId: string, toId: string) => {
    const list = neighborsById.get(fromId);
    const set = neighborSetById.get(fromId);
    if (!list || !set || set.has(toId)) {
      return;
    }
    set.add(toId);
    list.push(toId);
  };

  for (const location of map.locations) {
    for (const targetId of location.adjacency) {
      if (!validLocationIds.has(targetId) || targetId === location.id) {
        continue;
      }
      addNeighbor(location.id, targetId);
      addNeighbor(targetId, location.id);
    }
  }

  let changed = false;
  const nextLocations = map.locations.map((location) => {
    const nextAdjacency = neighborsById.get(location.id) ?? [];
    const unchanged =
      nextAdjacency.length === location.adjacency.length &&
      nextAdjacency.every((id, index) => id === location.adjacency[index]);
    if (unchanged) {
      return location;
    }
    changed = true;
    return {
      ...location,
      adjacency: nextAdjacency,
    };
  });

  if (!changed) {
    return map;
  }

  return {
    ...map,
    locations: nextLocations,
  };
}

/**
 * Normalizes a `WorldMap` by fixing symmetric/valid adjacencies, forcing
 * `isEphemeral: false` on persisted map locations, and pruning dangling or
 * duplicate `locationIds` inside `zones`. Returns the original map reference
 * unchanged when no normalization is needed.
 */
export function normalizeWorldMap(map: WorldMap): WorldMap {
  const withNormalizedAdjacencies = normalizeMapAdjacencies(map);
  const validLocationIds = new Set(getLocationIds(withNormalizedAdjacencies));

  let locationsChanged = false;
  const nextLocations = withNormalizedAdjacencies.locations.map((location) => {
    if (!location.isEphemeral) {
      return location;
    }
    locationsChanged = true;
    return {
      ...location,
      isEphemeral: false,
    };
  });

  let zonesChanged = false;
  const nextZones = withNormalizedAdjacencies.zones.map((zone) => {
    const seen = new Set<string>();
    const nextLocationIds: string[] = [];
    let zoneChanged = false;

    for (const locationId of zone.locationIds) {
      if (!validLocationIds.has(locationId) || seen.has(locationId)) {
        zoneChanged = true;
        continue;
      }
      seen.add(locationId);
      nextLocationIds.push(locationId);
    }

    if (!zoneChanged) {
      return zone;
    }

    zonesChanged = true;
    return {
      ...zone,
      locationIds: nextLocationIds,
    };
  });

  if (!locationsChanged && !zonesChanged) {
    return withNormalizedAdjacencies;
  }

  return {
    ...withNormalizedAdjacencies,
    locations: locationsChanged ? nextLocations : withNormalizedAdjacencies.locations,
    zones: zonesChanged ? nextZones : withNormalizedAdjacencies.zones,
  };
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

    if (!String(location.description || '').trim() && location.name.trim()) {
      errors.push(`Location "${location.name}" is missing a description.`);
    }
  }

  return errors;
}

/** Deterministically selects the fallback map with the lowest ID when the configured map is unavailable. */
export function getDeterministicFallbackMap(maps: WorldMap[]): WorldMap | undefined {
  if (maps.length === 0) return undefined;

  return maps.reduce((lowest, candidate) => (candidate.id < lowest.id ? candidate : lowest));
}
