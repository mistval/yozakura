import { create } from 'zustand';
import * as Database from '../backend_bridge/database';
import * as Files from '../backend_bridge/files';
import { type Scenario, type ScenarioSummary, type WorldMap } from '../engine/types.js';
import * as MapHelper from '../engine/map/world_map.js';
import { useMapStore } from './map_store.js';
import { assert, assertNonNullish } from '../errors/application_error.js';

type ScenarioStoreState = {
  activeScenario: Scenario | undefined;
  activeScenarioMap: WorldMap | undefined;
  pendingScenarioId: string | undefined;
  scenarioSummaries: ScenarioSummary[];
  scenarioSummariesAreLoaded: boolean;
  updateScenario: (updater: (prev: Scenario) => Scenario) => Scenario;
  setUserCharacter: (characterId: string) => void;
  setScenarioMap: (mapId: string) => void;
  mergeMapOverrides: (
    overrides: { name?: string | undefined; description?: string | undefined } | undefined
  ) => void;
  deleteInactiveScenario: (scenarioId: string) => void;
  saveImmediateBlankInactiveScenario: (mapId: string) => Promise<Scenario>;
  saveImmediateInactiveScenario: (
    scenario: Scenario,
    opt?: {
      noSummaryReload: boolean;
    }
  ) => Promise<void>;
  refreshScenario: (scenarioId: string) => Promise<void>;
  refreshScenarioSummaries: () => Promise<ScenarioSummary[]>;
};

export const useScenarioStore = create<ScenarioStoreState>((set, get) => ({
  activeScenario: undefined,
  activeScenarioMap: undefined,
  pendingScenarioId: undefined,
  scenarioSummariesAreLoaded: false,
  scenarioSummaries: [],

  refreshScenario: async (scenarioId) => {
    if (get().activeScenario?.id === scenarioId) {
      return;
    }

    const maps = useMapStore.getState().maps;
    if (maps.length === 0) {
      set({ pendingScenarioId: scenarioId });
      return;
    }

    set({ pendingScenarioId: undefined });

    const loadedScenario = await Database.doAsDataRead(
      () => {
        return Database.loadScenario(scenarioId);
      },
      'scenario',
      {
        debouncerKey: scenarioId,
      }
    );

    if (!loadedScenario) {
      return undefined;
    }

    const newestMap = MapHelper.getNewestUpdatedMap(maps);
    assertNonNullish(newestMap, 'No maps available after seeding.');

    const selectedMap = maps.find((map) => map.id === loadedScenario.mapId) || newestMap;
    const locationIds = MapHelper.getLocationIds(selectedMap);
    assertNonNullish(locationIds[0], 'Selected map has no locations.');

    const nextScenario: Scenario = {
      ...loadedScenario,
      mapId: selectedMap.id,
    };

    set({
      activeScenario: nextScenario,
      activeScenarioMap: {
        ...selectedMap,
        name: nextScenario.mapOverrides?.name ?? selectedMap.name,
        description: nextScenario.mapOverrides?.description ?? selectedMap.description,
      },
    });

    get().updateScenario(() => nextScenario);
  },

  updateScenario: (updater) => {
    const scenario = getRequiredActiveScenario();
    const nextScenario = updater(scenario);

    set({
      activeScenario: nextScenario,
    });

    void Database.doAsDataWrite(
      async () => {
        const curScenario = get().activeScenario;
        if (curScenario?.id !== nextScenario.id) {
          return;
        }

        await Database.storeScenario(curScenario);
      },
      'scenario',
      {
        debouncerKey: nextScenario.id,
      }
    );

    return nextScenario;
  },

  setUserCharacter: (characterId) => {
    const scenario = getRequiredActiveScenario();

    if (characterId === scenario.userCharacterId) {
      return;
    }

    get().updateScenario(
      (prev) =>
        ({
          ...prev,
          userCharacterId: characterId,
        }) satisfies typeof prev
    );
  },

  setScenarioMap: (mapId) => {
    const maps = useMapStore.getState().maps;
    const selectedMap = maps.find((map) => map.id === mapId);
    if (!selectedMap) {
      throw new Error(`Map not found: ${mapId}`);
    }

    get().updateScenario(
      (prev) =>
        ({
          ...prev,
          mapId: selectedMap.id,
        }) satisfies typeof prev
    );

    set({
      activeScenarioMap: selectedMap,
    });
  },

  mergeMapOverrides: (overrides) => {
    const scenario = getRequiredActiveScenario();

    const maps = useMapStore.getState().maps;
    const baseMap = maps.find((map) => map.id === scenario.mapId);
    assert(baseMap, 'could not find map');

    const newOverrides = {
      ...scenario.mapOverrides,
      ...overrides,
    };

    get().updateScenario((prev) => ({
      ...prev,
      mapOverrides: newOverrides,
    }));

    set({
      activeScenarioMap: {
        ...baseMap,
        name: newOverrides?.name ?? baseMap.name,
        description: newOverrides?.description ?? baseMap.description,
      },
    });
  },

  saveImmediateBlankInactiveScenario: async (mapId) => {
    const scenario = Database.createPersistedObject({
      mapId,
      turnNumber: 0,
      userCharacterId: '',
    });

    await get().saveImmediateInactiveScenario(scenario);
    return scenario;
  },

  saveImmediateInactiveScenario: async (scenario, opts) => {
    await Database.doAsDataWrite(
      async () => {
        await Database.storeScenario(scenario);
      },
      'scenario',
      {
        debouncerKey: scenario.id,
      }
    );

    if (!opts?.noSummaryReload) {
      await get().refreshScenarioSummaries();
    }
  },

  deleteInactiveScenario: (scenarioId: string) => {
    const newScenarioSummaries = get().scenarioSummaries.filter((s) => s.scenario.id !== scenarioId);

    if (newScenarioSummaries.length !== get().scenarioSummaries.length) {
      set({
        scenarioSummaries: newScenarioSummaries,
      });

      void Database.doAsDataWrite(async () => {
        await Database.deleteScenarioDatabase(scenarioId);
        await Files.deleteScenarioFolder(scenarioId);
      }, 'scenario');
    }
  },

  refreshScenarioSummaries: async () => {
    const summaries = await Database.doAsDataRead(
      () => Database.loadScenarioSummaries(),
      'scenario_summary.all'
    );

    set({
      scenarioSummaries: summaries,
      scenarioSummariesAreLoaded: true,
    });

    return summaries;
  },
}));

useMapStore.subscribe((newState, prevState) => {
  const pendingScenarioId = useScenarioStore.getState().pendingScenarioId;
  if (newState.mapsAreLoaded && !prevState.mapsAreLoaded && pendingScenarioId) {
    useScenarioStore.getState().refreshScenario(pendingScenarioId);
  }
});

useScenarioStore.getState().refreshScenarioSummaries();

export function getRequiredActiveScenario() {
  const scenario = useScenarioStore.getState().activeScenario;
  assertNonNullish(scenario, 'no active scenario');
  return scenario;
}

export function getRequiredActiveScenarioMap() {
  const activeMap = useScenarioStore.getState().activeScenarioMap;
  assertNonNullish(activeMap, 'no active map');
  return activeMap;
}
