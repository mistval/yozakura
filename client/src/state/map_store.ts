import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import { DEFAULT_WORLD_MAPS } from '../engine/map/default_maps.js';
import type { WorldMap } from '../engine/types.js';
import { assert } from '../errors/application_error.js';
import { concatUniqueById } from '../util/array.js';

export const useMapStore = create<{
  maps: WorldMap[];
  mapsById: Record<string, WorldMap>;
  mapsAreLoaded: boolean;

  setMaps: (maps: WorldMap[]) => void;
  saveMap: (map: WorldMap) => void;
  deleteMap: (mapId: string) => void;
  refreshMapsImmediate: () => Promise<void>;
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

  async refreshMapsImmediate() {
    const existing = await Database.doAsDataRead(async () => {
      return Database.loadMaps();
    }, 'map.all');

    if (existing.length > 0) {
      get().setMaps(existing);
      return;
    }

    await Database.doAsDataWrite(
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
    assert(get().mapsAreLoaded, 'Maps not yet loaded');

    const withUpdatedFields: WorldMap = {
      ...map,
      updatedAt: new Date().toISOString(),
    } as WorldMap;

    get().setMaps(concatUniqueById(get().maps, map));

    void Database.doAsDataWrite(
      async () => {
        const map = get().maps.find((m) => m.id == withUpdatedFields.id);
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

  deleteMap(mapId: string) {
    assert(get().mapsAreLoaded, 'Maps not yet loaded');
    void Database.doAsDataWrite(async () => {
      await Database.deleteMap(mapId);
    }, 'map');

    const newMaps = get().maps.filter((m) => m.id !== mapId);
    get().setMaps(newMaps);
  },
}));

useMapStore.getState().refreshMapsImmediate();
