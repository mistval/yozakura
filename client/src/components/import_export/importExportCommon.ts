import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';
import { turnPersistenceKey } from '../../engine/scenario_loop/turn_persistence.js';

export const SQL_UTC_NOW = "CONCAT(datetime('now'), 'Z')";

export const TABLE_COLUMNS = {
  scenario: ['id', 'created_at', 'updated_at', 'data'],
  scenario_character: ['id', 'scenario_id', 'created_at', 'updated_at', 'data'],
  character_relationship: ['id', 'from_id', 'to_id', 'created_at', 'updated_at', 'data'],
  scenario_character_group: ['id', 'scenario_id', 'created_at', 'updated_at', 'data'],
  scenario_character_group_schedule: ['id', 'scenario_id', 'group_id', 'created_at', 'updated_at', 'data'],
  conversation: ['id', 'scenario_id', 'created_at', 'updated_at', 'data'],
  conversation_participant: ['id', 'conversation_id', 'character_id', 'created_at', 'updated_at'],
  map: ['id', 'created_at', 'updated_at', 'data'],
  character: ['id', 'created_at', 'updated_at', 'data'],
  key_value: ['key', 'created_at', 'updated_at', 'data'],
} as const;

export const TreeEntityIds = {
  rootScenarios: () => 'root:scenarios',
  rootMaps: () => 'root:maps',
  rootCharacters: () => 'root:characters',
  rootSettings: () => 'root:settings',
  rootPromptTemplates: () => 'root:prompt_templates',

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

  promptGroup: (groupId: string) => `prompt_group:${groupId}`,
  promptChain: (chainId: string) => `prompt_chain:${chainId}`,
} as const;

export const STRIP_MEMORIES_PATCH = JSON.stringify({
  globalMemories: '',
  rollingConversationSummaries: [],
  nextConversationWithCharacterId: '',
});

export const STRIP_GROUPS_PATCH = JSON.stringify({
  groupIds: [],
});

export const STRIP_BOTH_PATCH = JSON.stringify({
  globalMemories: '',
  rollingConversationSummaries: [],
  nextConversationWithCharacterId: '',
  groupIds: [],
});

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
  selectedTemplateChainIds: string[];
};

export type DecomposeSelectionOptions = {
  selectedIds: Set<string>;
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
  templateGroupData: TemplateGroupData;
};

export function decomposeSelection(options: DecomposeSelectionOptions): DecomposedSelection {
  const { selectedIds, scenarios, maps, globalCharacters, templateGroupData } = options;

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

  // Template Chains
  const selectedTemplateChainIds: string[] = [];
  for (const group of Object.values(templateGroupData)) {
    for (const chainId of Object.keys(group.templateChains)) {
      if (selectedIds.has(TreeEntityIds.promptChain(chainId))) {
        selectedTemplateChainIds.push(chainId);
      }
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
    selectedTemplateChainIds,
  };
}
