import { create } from 'zustand';
import { doAsDataRead, doAsDataWrite, mainDatabase } from '../backend_bridge/database.js';
import { importDemoMaps } from '../backend_bridge/demo_import.js';
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
  importDemoMaps: () => Promise<void>;
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

  async importDemoMaps() {
    await importDemoMaps();
    const reloaded = await doAsDataRead(async () => {
      return mainDatabase.loadMaps();
    }, 'map.all');
    get().setMaps(reloaded);
  },

  async refreshMaps() {
    const existing = await doAsDataRead(async () => {
      return mainDatabase.loadMaps();
    }, 'map.all');

    if (existing.length > 0) {
      get().setMaps(existing);
      return;
    }

    try {
      await get().importDemoMaps();
    } catch (err) {
      console.error('Failed to auto-import demo maps:', err);
    }
  },

  saveMap(map: WorldMap) {
    const withUpdatedFields = {
      ...map,
      updatedAt: new Date().toISOString(),
    } satisfies WorldMap;

    get().setMaps(concatUniqueById(get().maps, withUpdatedFields));

    void doAsDataWrite(
      async () => {
        const map = findById(get().maps, withUpdatedFields.id);
        if (!map) {
          return;
        }

        await mainDatabase.storeMaps([map]);
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
    void doAsDataWrite(async () => {
      await mainDatabase.deleteMap(mapId);
    }, 'map');

    const newMaps = removeById(get().maps, mapId);
    get().setMaps(newMaps);
  },
}));

useMapStore.getState().refreshMaps();
