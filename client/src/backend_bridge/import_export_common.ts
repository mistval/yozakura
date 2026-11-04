import type { Character, ScenarioSummary, WorldMap } from '../engine/types.js';
import { turnPersistenceKey } from '../util/id.js';
import {
  SQL_UTC_NOW,
  TABLE_COLUMNS,
  STRIP_MEMORIES_PATCH,
  STRIP_GROUPS_PATCH,
  STRIP_BOTH_PATCH,
} from './export_queries.js';

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

export type DecomposedSelection = {
  selectedScenarioIds: string[];
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

    const hasCharacters = selectedIds.has(TreeEntityIds.scenarioCharacters(scenId));
    const hasGroups = selectedIds.has(TreeEntityIds.scenarioGroups(scenId));
    const hasSchedules = hasGroups && selectedIds.has(TreeEntityIds.scenarioSchedules(scenId));
    const hasMemories = hasCharacters && selectedIds.has(TreeEntityIds.scenarioMemories(scenId));
    const hasConversations = selectedIds.has(TreeEntityIds.scenarioConversations(scenId));
    const hasTurn = hasCharacters && selectedIds.has(TreeEntityIds.scenarioTurn(scenId));

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
