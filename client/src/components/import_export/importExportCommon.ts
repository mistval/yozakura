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

export function getScenarioTurnKey(scenarioId: string): string {
  return `scenario_${scenarioId}_turn`;
}
