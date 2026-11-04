import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import { turnPersistenceKey } from '../../util/id.js';
import {
  SQL_UTC_NOW,
  TABLE_COLUMNS,
  STRIP_MEMORIES_PATCH,
  STRIP_GROUPS_PATCH,
  STRIP_BOTH_PATCH,
} from '../../backend_bridge/export_queries.js';

export { SQL_UTC_NOW, TABLE_COLUMNS, STRIP_MEMORIES_PATCH, STRIP_GROUPS_PATCH, STRIP_BOTH_PATCH };

export const TreeEntityIds = {
  rootScenarios: () => 'root:scenarios',
  rootMaps: () => 'root:maps',
  rootCharacters: () => 'root:characters',

  scenario: (scenId: string) => `scenario:${scenId}`,
  scenarioCharacters: (scenId: string) => `scenario:${scenId}:characters`,
  scenarioGroups: (scenId: string) => `scenario:${scenId}:groups`,
  scenarioSchedules: (scenId: string) => `scenario:${scenId}:schedules`,
  scenarioMemories: (scenId: string) => `scenario:${scenId}:memories`,
  scenarioConversations: (scenId: string) => `scenario:${scenId}:conversations`,
  scenarioTurn: (scenId: string) => `scenario:${scenId}:turn`,
  scenarioMap: (scenId: string, mapId: string) => `scenario_map:${scenId}:${mapId}`,

  map: (mapId: string) => `map:${mapId}`,
  character: (charId: string) => `character:${charId}`,
} as const;

export { turnPersistenceKey };
export const getScenarioTurnKey = turnPersistenceKey;

export type DecomposedScenarioSelection = {
  scenarioId: string;
  hasCharacters: boolean;
  hasGroups: boolean;
  hasSchedules: boolean;
  hasMemories: boolean;
  hasConversations: boolean;
  hasTurn: boolean;
};

export type DecomposedSelection = {
  selectedScenarioIds: string[];
  scenarioDetails: Map<string, DecomposedScenarioSelection>;
  selectedScenarioCharactersIds: string[];
  selectedScenarioGroupsIds: string[];
  selectedScenarioSchedulesIds: string[];
  selectedScenarioMemoriesIds: string[];
  selectedScenarioConversationsIds: string[];
  selectedScenarioTurnIds: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
};

export type DecomposeSelectionOptions = {
  selectedIds: Set<string>;
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
};

export function decomposeSelection(options: DecomposeSelectionOptions): DecomposedSelection {
  const { selectedIds, scenarios, maps, globalCharacters } = options;

  const selectedScenarioIds: string[] = [];
  const scenarioDetails = new Map<string, DecomposedScenarioSelection>();
  const selectedScenarioCharactersIds: string[] = [];
  const selectedScenarioGroupsIds: string[] = [];
  const selectedScenarioSchedulesIds: string[] = [];
  const selectedScenarioMemoriesIds: string[] = [];
  const selectedScenarioConversationsIds: string[] = [];
  const selectedScenarioTurnIds: string[] = [];

  for (const summary of scenarios) {
    const scenId = summary.scenario.id;
    if (!selectedIds.has(TreeEntityIds.scenario(scenId))) {
      continue;
    }

    selectedScenarioIds.push(scenId);

    const rawCharacters = selectedIds.has(TreeEntityIds.scenarioCharacters(scenId));
    const rawGroups = selectedIds.has(TreeEntityIds.scenarioGroups(scenId));
    const rawSchedules = selectedIds.has(TreeEntityIds.scenarioSchedules(scenId));
    const rawMemories = selectedIds.has(TreeEntityIds.scenarioMemories(scenId));
    const rawConversations = selectedIds.has(TreeEntityIds.scenarioConversations(scenId));
    const rawTurn = selectedIds.has(TreeEntityIds.scenarioTurn(scenId));

    // Apply dependency rules:
    // - Memories and turn state require scenario characters (prevents FK violations)
    // - Schedules require character groups
    const hasCharacters = rawCharacters;
    const hasGroups = rawGroups;
    const hasSchedules = hasGroups && rawSchedules;
    const hasMemories = hasCharacters && rawMemories;
    const hasConversations = rawConversations;
    const hasTurn = hasCharacters && rawTurn;

    scenarioDetails.set(scenId, {
      scenarioId: scenId,
      hasCharacters,
      hasGroups,
      hasSchedules,
      hasMemories,
      hasConversations,
      hasTurn,
    });

    if (hasCharacters) selectedScenarioCharactersIds.push(scenId);
    if (hasGroups) selectedScenarioGroupsIds.push(scenId);
    if (hasSchedules) selectedScenarioSchedulesIds.push(scenId);
    if (hasMemories) selectedScenarioMemoriesIds.push(scenId);
    if (hasConversations) selectedScenarioConversationsIds.push(scenId);
    if (hasTurn) selectedScenarioTurnIds.push(scenId);
  }

  // Maps
  const selectedMapIds: string[] = [];
  for (const map of maps) {
    const isDirectlySelected = selectedIds.has(TreeEntityIds.map(map.id));
    const isScenarioMapSelected = scenarios.some(
      (s) => s.scenario.mapId === map.id && selectedIds.has(TreeEntityIds.scenarioMap(s.scenario.id, map.id))
    );
    if (isDirectlySelected || isScenarioMapSelected) {
      selectedMapIds.push(map.id);
    }
  }

  // Global Characters
  const selectedGlobalCharacterIds: string[] = [];
  for (const char of globalCharacters) {
    if (selectedIds.has(TreeEntityIds.character(char.id))) {
      selectedGlobalCharacterIds.push(char.id);
    }
  }

  return {
    selectedScenarioIds,
    scenarioDetails,
    selectedScenarioCharactersIds,
    selectedScenarioGroupsIds,
    selectedScenarioSchedulesIds,
    selectedScenarioMemoriesIds,
    selectedScenarioConversationsIds,
    selectedScenarioTurnIds,
    selectedMapIds,
    selectedGlobalCharacterIds,
  };
}
