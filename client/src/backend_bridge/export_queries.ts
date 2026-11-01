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

export const SQL_UTC_NOW = "CONCAT(datetime('now'), 'Z')";

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

export type TableExportQuery = {
  table: string;
  statement: string;
  params: unknown[];
};

export type ScenarioCharacterExportPartition = {
  fullScenarioIds: string[];
  stripMemoriesScenarioIds: string[];
  stripGroupsScenarioIds: string[];
  stripBothScenarioIds: string[];
};

export type BuildExportQueriesParams = {
  selectedScenarioIds: string[];
  characterPartition?: ScenarioCharacterExportPartition;
  scenariosWithMemories: string[];
  scenariosWithGroups: string[];
  scenariosWithSchedules: string[];
  scenariosWithConversations: string[];
  turnKeys: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
};

export function buildScenarioExportQuery(scenarioIds: string[]): TableExportQuery | undefined {
  if (scenarioIds.length === 0) return undefined;
  return {
    table: 'scenario',
    statement: `
      SELECT ${TABLE_COLUMNS.scenario.join(', ')}
      FROM scenario
      WHERE id IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(scenarioIds)],
  };
}

export function buildScenarioCharacterExportQueries(
  partition: ScenarioCharacterExportPartition
): TableExportQuery[] {
  const queries: TableExportQuery[] = [];
  const scenCharCols = TABLE_COLUMNS.scenario_character.join(', ');
  const scenCharPatchedCols = TABLE_COLUMNS.scenario_character
    .map((c) => (c === 'data' ? 'json_patch(data, ?) AS data' : c))
    .join(', ');

  if (partition.fullScenarioIds.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(partition.fullScenarioIds)],
    });
  }

  if (partition.stripMemoriesScenarioIds.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharPatchedCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [STRIP_MEMORIES_PATCH, JSON.stringify(partition.stripMemoriesScenarioIds)],
    });
  }

  if (partition.stripGroupsScenarioIds.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharPatchedCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [STRIP_GROUPS_PATCH, JSON.stringify(partition.stripGroupsScenarioIds)],
    });
  }

  if (partition.stripBothScenarioIds.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharPatchedCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [STRIP_BOTH_PATCH, JSON.stringify(partition.stripBothScenarioIds)],
    });
  }

  return queries;
}

export function buildCharacterRelationshipExportQuery(
  scenarioIdsWithMemories: string[]
): TableExportQuery | undefined {
  if (scenarioIdsWithMemories.length === 0) return undefined;
  return {
    table: 'character_relationship',
    statement: `
      SELECT ${TABLE_COLUMNS.character_relationship.map((c) => `cr.${c}`).join(', ')}
      FROM character_relationship cr
      JOIN scenario_character sc ON cr.from_id = sc.id
      WHERE sc.scenario_id IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(scenarioIdsWithMemories)],
  };
}

export function buildScenarioGroupExportQuery(
  scenarioIdsWithGroups: string[]
): TableExportQuery | undefined {
  if (scenarioIdsWithGroups.length === 0) return undefined;
  return {
    table: 'scenario_character_group',
    statement: `
      SELECT ${TABLE_COLUMNS.scenario_character_group.join(', ')}
      FROM scenario_character_group
      WHERE scenario_id IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(scenarioIdsWithGroups)],
  };
}

export function buildScenarioGroupScheduleExportQuery(
  scenarioIdsWithSchedules: string[]
): TableExportQuery | undefined {
  if (scenarioIdsWithSchedules.length === 0) return undefined;
  return {
    table: 'scenario_character_group_schedule',
    statement: `
      SELECT ${TABLE_COLUMNS.scenario_character_group_schedule.join(', ')}
      FROM scenario_character_group_schedule
      WHERE scenario_id IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(scenarioIdsWithSchedules)],
  };
}

export function buildConversationExportQueries(
  scenarioIdsWithConversations: string[]
): TableExportQuery[] {
  if (scenarioIdsWithConversations.length === 0) return [];
  return [
    {
      table: 'conversation',
      statement: `
        SELECT ${TABLE_COLUMNS.conversation.join(', ')}
        FROM conversation
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenarioIdsWithConversations)],
    },
    {
      table: 'conversation_participant',
      statement: `
        SELECT ${TABLE_COLUMNS.conversation_participant.map((c) => `cp.${c}`).join(', ')}
        FROM conversation_participant cp
        JOIN conversation c ON cp.conversation_id = c.id
        WHERE c.scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenarioIdsWithConversations)],
    },
  ];
}

export function buildTurnKeyValueExportQuery(turnKeys: string[]): TableExportQuery | undefined {
  if (turnKeys.length === 0) return undefined;
  return {
    table: 'key_value',
    statement: `
      SELECT ${TABLE_COLUMNS.key_value.join(', ')}
      FROM key_value
      WHERE key IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(turnKeys)],
  };
}

export function buildMapExportQuery(mapIds: string[]): TableExportQuery | undefined {
  if (mapIds.length === 0) return undefined;
  return {
    table: 'map',
    statement: `
      SELECT ${TABLE_COLUMNS.map.join(', ')}
      FROM map
      WHERE id IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(mapIds)],
  };
}

export function buildGlobalCharacterExportQuery(characterIds: string[]): TableExportQuery | undefined {
  if (characterIds.length === 0) return undefined;
  return {
    table: 'character',
    statement: `
      SELECT ${TABLE_COLUMNS.character.join(', ')}
      FROM character
      WHERE id IN (SELECT value FROM json_each(?))
    `.trim(),
    params: [JSON.stringify(characterIds)],
  };
}

export function buildTableExportQueries(params: BuildExportQueriesParams): TableExportQuery[] {
  const queries: TableExportQuery[] = [];

  const scenQuery = buildScenarioExportQuery(params.selectedScenarioIds);
  if (scenQuery) queries.push(scenQuery);

  if (params.characterPartition) {
    queries.push(...buildScenarioCharacterExportQueries(params.characterPartition));
  }

  const relQuery = buildCharacterRelationshipExportQuery(params.scenariosWithMemories);
  if (relQuery) queries.push(relQuery);

  const grpQuery = buildScenarioGroupExportQuery(params.scenariosWithGroups);
  if (grpQuery) queries.push(grpQuery);

  const schQuery = buildScenarioGroupScheduleExportQuery(params.scenariosWithSchedules);
  if (schQuery) queries.push(schQuery);

  queries.push(...buildConversationExportQueries(params.scenariosWithConversations));

  const turnQuery = buildTurnKeyValueExportQuery(params.turnKeys);
  if (turnQuery) queries.push(turnQuery);

  const mapQuery = buildMapExportQuery(params.selectedMapIds);
  if (mapQuery) queries.push(mapQuery);

  const charQuery = buildGlobalCharacterExportQuery(params.selectedGlobalCharacterIds);
  if (charQuery) queries.push(charQuery);

  return queries;
}

