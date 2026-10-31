import { createPersistedObject } from '../../backend_bridge/database.js';
import type { WorldMap, WorldMapLocation } from '../types.js';

export function createEmptyMapLocation(): WorldMapLocation {
  return createPersistedObject({
    name: '',
    description: '',
    adjacency: [] as string[],
    isEphemeral: false,
  });
}

export function createEmptyWorldMap(): WorldMap {
  return createPersistedObject({
    name: 'New Map',
    description: '',
    locations: [createEmptyMapLocation()],
    zones: [],
  });
}
