import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import { DEFAULT_WORLD_MAPS } from '../engine/map/default_maps.js';
import type { WorldMap } from '../engine/types.js';
import { concatUniqueById, findById, findRequiredById, removeById } from '../util/array.js';

export const useMapStore = create<{
  maps: WorldMap[];
  mapsById: Record<string, WorldMap>;
  mapsAreLoaded: boolean;

  setMaps: (maps: WorldMap[]) => void;
  saveMap: (map: WorldMap) => void;
  updateMap: (mapId: string, mutator: (prev: WorldMap) => WorldMap) => void;
  deleteMap: (mapId: string) => void;
  refreshMaps: () => Promise<void>;
}>((set, get) => ({
  maps: [],
  mapsById: {},
  mapsAreLoaded: false,

  setMaps(maps: WorldMap[]) {
    set({
      maps,
      mapsById: Object.fromEntries(maps.map((m) => [m.id, m])),
      mapsAreLoaded: true,
    });
  },

  async refreshMaps() {
    const existing = await Database.doAsDataRead(async () => {
      return Database.loadMaps();
    }, 'map.all');

    if (existing.length > 0) {
      get().setMaps(existing);
      return;
    }

    void Database.doAsDataWrite(
      async () => {
        await Database.storeMaps(DEFAULT_WORLD_MAPS);
      },
      'map.default',
      {
        debouncerKey: 'default_maps',
      }
    );

    get().setMaps(DEFAULT_WORLD_MAPS);
  },

  saveMap(map: WorldMap) {
    const withUpdatedFields = {
      ...map,
      updatedAt: new Date().toISOString(),
    } satisfies WorldMap;

    get().setMaps(concatUniqueById(get().maps, withUpdatedFields));

    void Database.doAsDataWrite(
      async () => {
        const map = findById(get().maps, withUpdatedFields.id);
        if (!map) {
          return;
        }

        await Database.storeMaps([map]);
      },
      'map',
      {
        debouncerKey: withUpdatedFields.id,
      }
    );

    return withUpdatedFields;
  },

  updateMap(mapId, mutator) {
    const currentMap = findRequiredById(get().maps, mapId);
    const newMap = mutator(currentMap);
    return get().saveMap(newMap);
  },

  deleteMap(mapId: string) {
    void Database.doAsDataWrite(async () => {
      await Database.deleteMap(mapId);
    }, 'map');

    const newMaps = removeById(get().maps, mapId);
    get().setMaps(newMaps);
  },
}));

useMapStore.getState().refreshMaps();
