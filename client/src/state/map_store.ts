import { create } from 'zustand';
import { doAsDataRead, doAsDataWrite, mainDatabase } from '../backend_bridge/database.js';
import { importDemoMaps } from '../backend_bridge/demo_import.js';
import { normalizeMapAdjacencies } from '../engine/map/world_map.js';
import type { WorldMap } from '../engine/types.js';
import { concatUniqueByIds, findRequiredById } from '../util/array.js';
import { ephemeralStateSlice, IMMEDIATE_SYNC, type SyncOptions } from './ephemeral_state_helper.js';

const DATABASE_OBJECT_NAME = 'map';

type MapStoreState = {
  maps: WorldMap[];
  mapsById: Record<string, WorldMap>;
  mapsAreLoaded: boolean;

  setMaps: (maps: WorldMap[]) => void;
  saveMap: (map: WorldMap, syncOptions?: SyncOptions) => WorldMap;
  updateMap: (mapId: string, mutator: (prev: WorldMap) => WorldMap) => WorldMap;
  deleteMap: (mapId: string) => void;
  refreshMaps: () => Promise<void>;
  importDemoMaps: () => Promise<void>;
} & ReturnType<typeof ephemeralStateSlice<WorldMap>>;

export const useMapStore = create<MapStoreState>((set, get) => ({
  maps: [],
  mapsById: {},
  mapsAreLoaded: false,

  ...ephemeralStateSlice<WorldMap>({
    setStoreState(entities: WorldMap[]) {
      get().setMaps(concatUniqueByIds(get().maps, entities.map(normalizeMapAdjacencies)));
    },

    deleteStoreState(entities: WorldMap[]) {
      const ids = new Set(entities.map((entity) => entity.id));
      get().setMaps(get().maps.filter((map) => !ids.has(map.id)));
    },

    async setDatabaseState(entities: WorldMap[]) {
      const debouncerKey = entities.length === 1 ? entities[0]!.id : `${DATABASE_OBJECT_NAME}.all`;

      await doAsDataWrite(
        async () => {
          const existingMaps = entities
            .map((entity) => get().mapsById[entity.id])
            .filter((map): map is WorldMap => Boolean(map));

          if (existingMaps.length === 0) {
            return;
          }

          await mainDatabase.storeMaps(existingMaps);
        },
        DATABASE_OBJECT_NAME,
        { debouncerKey }
      );
    },

    deleteDatabaseState(entities: WorldMap[]) {
      const debouncerKey = entities.length === 1 ? entities[0]!.id : `${DATABASE_OBJECT_NAME}.all`;

      return doAsDataWrite(
        async () => {
          await mainDatabase.deleteMaps(entities.map((entity) => entity.id));
        },
        DATABASE_OBJECT_NAME,
        { debouncerKey }
      );
    },

    getEntitiesFromDatabase(entities: WorldMap[]) {
      return doAsDataRead(
        () => mainDatabase.loadMapsByIds(entities.map((entity) => entity.id)),
        `${DATABASE_OBJECT_NAME}.partial.refresh`
      );
    },
  }),

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
      get().setMaps([]);
    }
  },

  saveMap(map: WorldMap, syncOptions: SyncOptions = IMMEDIATE_SYNC) {
    const normalized = normalizeMapAdjacencies(map);
    const withUpdatedFields = {
      ...normalized,
      updatedAt: new Date().toISOString(),
    } satisfies WorldMap;

    void get().ephemeralStateHelper.stageUpdatedEntity(withUpdatedFields, syncOptions);

    return withUpdatedFields;
  },

  updateMap(mapId, mutator) {
    const currentMap = findRequiredById(get().maps, mapId);
    const newMap = mutator(currentMap);
    return get().saveMap(newMap);
  },

  deleteMap(mapId: string) {
    const existing = get().mapsById[mapId];
    if (!existing) {
      return;
    }

    void get().ephemeralStateHelper.stageDeletedEntity(existing, IMMEDIATE_SYNC);
  },
}));

useMapStore.getState().refreshMaps();
