import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import type { MapZone } from '../engine/types.js';
import {
  buildDesyncedScenarioZoneFields,
  buildPushedGlobalZone,
  getEffectiveZones,
} from '../engine/map/map_zone.js';
import { assert } from '../errors/application_error.js';
import { concatUniqueById } from '../util/array.js';
import { useScenarioStore } from './scenario_store.js';

const DATABASE_OBJECT_NAME = 'map_zone';

type ZoneEdits = Partial<Pick<MapZone, 'name' | 'locationIds' | 'privateToGroupIds'>>;

type MapZoneStoreState = {
  zones: MapZone[];
  zonesAreLoaded: boolean;
  editorZones: MapZone[];
  editorZonesAreLoaded: boolean;

  setZones: (zones: MapZone[]) => void;
  loadScenarioZones: () => Promise<void>;
  getEffectiveZones: () => MapZone[];
  getScenarioZones: () => MapZone[];
  saveZone: (zone: MapZone) => void;
  createScenarioZone: (mapId: string, name: string) => MapZone;
  editScenarioZone: (zoneId: string, changes: ZoneEdits) => MapZone;
  deleteZone: (zoneId: string) => void;
  resyncZone: (scenarioZoneId: string, direction: 'push' | 'discard') => void;
  removeGroupFromAllZones: (groupId: string) => void;

  loadEditorGlobalZones: (mapId: string) => Promise<void>;
  createEditorZone: (mapId: string, name: string) => MapZone;
  editEditorZone: (zoneId: string, changes: ZoneEdits) => void;
  deleteEditorZone: (zoneId: string) => void;
};

export const useMapZoneStore = create<MapZoneStoreState>((set, get) => ({
  zones: [],
  zonesAreLoaded: false,
  editorZones: [],
  editorZonesAreLoaded: false,

  setZones: (zones) => {
    set({ zones, zonesAreLoaded: true });
  },

  loadScenarioZones: async () => {
    set({ zones: [], zonesAreLoaded: false });

    const scenario = useScenarioStore.getState().activeScenario;
    if (!scenario) {
      return;
    }

    const [globalZones, scenarioZones] = await Database.doAsDataRead(async () => {
      return Promise.all([
        Database.loadGlobalMapZones(scenario.mapId),
        Database.loadScenarioMapZones(scenario.id),
      ]);
    }, `${DATABASE_OBJECT_NAME}.${scenario.id}.all`);

    get().setZones(globalZones.concat(scenarioZones));
  },

  getEffectiveZones: () => {
    const scenario = useScenarioStore.getState().activeScenario;
    if (!scenario) {
      return [];
    }
    return getEffectiveZones(scenario.id, scenario.mapId, get().zones);
  },

  getScenarioZones: () => {
    const scenario = useScenarioStore.getState().activeScenario;
    if (!scenario) {
      return [];
    }
    return get().zones.filter((zone) => zone.scenarioId === scenario.id);
  },

  saveZone: (zone) => {
    set({ zones: concatUniqueById(get().zones, zone) });

    void Database.doAsDataWrite(
      async () => {
        const latest = get().zones.find((z) => z.id === zone.id);
        if (!latest) {
          return;
        }
        await Database.storeMapZones([latest]);
      },
      DATABASE_OBJECT_NAME,
      { debouncerKey: zone.id }
    );
  },

  createScenarioZone: (mapId, name) => {
    const scenario = useScenarioStore.getState().activeScenario;
    assert(scenario, 'createScenarioZone called with no active scenario');

    const zone = Database.createPersistedObject({
      mapId,
      scenarioId: scenario.id,
      name,
      locationIds: [],
      privateToGroupIds: [],
    });
    get().saveZone(zone);
    return zone;
  },

  editScenarioZone: (zoneId, changes) => {
    const zone = get().zones.find((z) => z.id === zoneId);
    assert(zone, 'editScenarioZone called for unknown zone');

    if (zone.scenarioId !== undefined) {
      const updated = { ...zone, ...changes };
      get().saveZone(updated);
      return updated;
    }

    const scenario = useScenarioStore.getState().activeScenario;
    assert(scenario, 'editScenarioZone called with no active scenario');

    const desynced = Database.createPersistedObject({
      ...buildDesyncedScenarioZoneFields(zone, scenario.id),
      ...changes,
    });
    get().saveZone(desynced);
    return desynced;
  },

  deleteZone: (zoneId) => {
    const remaining = get().zones.filter((zone) => zone.id !== zoneId && zone.parentZoneId !== zoneId);
    set({ zones: remaining });

    void Database.doAsDataWrite(async () => {
      await Database.deleteMapZone(zoneId);
    }, DATABASE_OBJECT_NAME);
  },

  resyncZone: (scenarioZoneId, direction) => {
    const scenarioZone = get().zones.find((z) => z.id === scenarioZoneId);
    assert(scenarioZone?.parentZoneId, 'resyncZone called for a zone without a parent');

    if (direction === 'push') {
      const globalZone = get().zones.find((z) => z.id === scenarioZone.parentZoneId);
      if (globalZone) {
        get().saveZone(buildPushedGlobalZone(scenarioZone, globalZone));
      }
    }

    get().deleteZone(scenarioZoneId);
  },

  removeGroupFromAllZones: (groupId) => {
    const affected = get().zones.filter((zone) => zone.privateToGroupIds.includes(groupId));
    for (const zone of affected) {
      get().saveZone({
        ...zone,
        privateToGroupIds: zone.privateToGroupIds.filter((id) => id !== groupId),
      });
    }
  },

  loadEditorGlobalZones: async (mapId) => {
    set({ editorZones: [], editorZonesAreLoaded: false });

    const globalZones = await Database.doAsDataRead(async () => {
      return Database.loadGlobalMapZones(mapId);
    }, `${DATABASE_OBJECT_NAME}.${mapId}.global`);

    set({ editorZones: globalZones, editorZonesAreLoaded: true });
  },

  createEditorZone: (mapId, name) => {
    const zone = Database.createPersistedObject({ mapId, name, locationIds: [], privateToGroupIds: [] });
    set({ editorZones: concatUniqueById(get().editorZones, zone) });

    void Database.doAsDataWrite(
      async () => {
        const latest = get().editorZones.find((z) => z.id === zone.id);
        if (latest) {
          await Database.storeMapZones([latest]);
        }
      },
      DATABASE_OBJECT_NAME,
      { debouncerKey: zone.id }
    );

    return zone;
  },

  editEditorZone: (zoneId, changes) => {
    const zone = get().editorZones.find((z) => z.id === zoneId);
    assert(zone, 'editEditorZone called for unknown zone');

    const updated = { ...zone, ...changes };
    set({ editorZones: concatUniqueById(get().editorZones, updated) });

    void Database.doAsDataWrite(
      async () => {
        const latest = get().editorZones.find((z) => z.id === zoneId);
        if (latest) {
          await Database.storeMapZones([latest]);
        }
      },
      DATABASE_OBJECT_NAME,
      { debouncerKey: zoneId }
    );
  },

  deleteEditorZone: (zoneId) => {
    set({ editorZones: get().editorZones.filter((zone) => zone.id !== zoneId) });

    void Database.doAsDataWrite(async () => {
      await Database.deleteMapZone(zoneId);
    }, DATABASE_OBJECT_NAME);
  },
}));

useScenarioStore.subscribe((newScenario, prevScenario) => {
  if (newScenario.activeScenario && prevScenario.activeScenario?.id !== newScenario.activeScenario.id) {
    void useMapZoneStore.getState().loadScenarioZones();
  }
});

if (useScenarioStore.getState().activeScenario) {
  await useMapZoneStore.getState().loadScenarioZones();
}
