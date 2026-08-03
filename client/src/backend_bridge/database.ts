import * as Api from './api';
import { z } from 'zod';
import {
  characterRelationshipSchema,
  characterSchema,
  storedConversationSchema,
  scenarioSchema,
  worldMapSchema,
  scenarioCharacterGroupSchema,
  scenarioCharacterGroupScheduleSchema,
  scenarioEventSchema,
  type CharacterPair,
  type Character,
  type CharacterRelationship,
  type StoredConversation,
  type ScenarioEvent,
  type Scenario,
  type WorldMap,
  type RootPersistedObject,
  type ScenarioSummary,
  type ScenarioCharacterGroup,
  type ScenarioCharacterGroupSchedule,
} from '../engine/types.js';
import { newId } from '../util/id';
import { runWithInteractiveRetry } from '../engine/interative_retry';
import { ReadWriteDebouncer } from '../util/rw_debouncer';

const TABLE_CHARACTER = 'character';
const TABLE_SCENARIO_CHARACTER = 'scenario_character';
const TABLE_SCENARIO = 'scenario';
const TABLE_CHARACTER_RELATIONSHIP = 'character_relationship';
const TABLE_CONVERSATION = 'conversation';
const TABLE_CONVERSATION_PARTICIPANT = 'conversation_participant';
const TABLE_MAP = 'map';
const TABLE_KEY_VALUE = 'key_value';
const TABLE_SCENARIO_CHARACTER_GROUP = 'scenario_character_group';
const TABLE_SCENARIO_CHARACTER_GROUP_SCHEDULE = 'scenario_character_group_schedule';
const TABLE_SCENARIO_EVENT_LOG = 'scenario_event_log';

function buildSqlPlaceholders(count: number): string {
  return Array(count).fill('?').join(', ');
}

function sqlDatetimeNow() {
  return `CONCAT(datetime('now'), 'Z')`;
}

const UPSERT_CHARACTER_SQL = `
  INSERT INTO ${TABLE_CHARACTER} (id, data, created_at, updated_at)
  SELECT
    json_extract(value, '$[0]'),
    json_extract(value, '$[1]'),
    ${sqlDatetimeNow()},
    ${sqlDatetimeNow()}
  FROM json_each(?)
  WHERE TRUE
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_SCENARIO_CHARACTER_SQL = `
  INSERT INTO ${TABLE_SCENARIO_CHARACTER} (id, scenario_id, data, created_at, updated_at)
  SELECT
    json_extract(value, '$[0]'),
    json_extract(value, '$[1]'),
    json_extract(value, '$[2]'),
    ${sqlDatetimeNow()},
    ${sqlDatetimeNow()}
  FROM json_each(?)
  WHERE TRUE
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_SCENARIO_SQL = `
  INSERT INTO ${TABLE_SCENARIO} (id, data, created_at, updated_at)
  VALUES (?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_CHARACTER_RELATIONSHIP_SQL = `
  INSERT INTO ${TABLE_CHARACTER_RELATIONSHIP} (id, from_id, to_id, data, created_at, updated_at)
  SELECT
    json_extract(value, '$[0]'),
    json_extract(value, '$[1]'),
    json_extract(value, '$[2]'),
    json_extract(value, '$[3]'),
    ${sqlDatetimeNow()},
    ${sqlDatetimeNow()}
  FROM json_each(?)
  WHERE TRUE
  ON CONFLICT(id)
  DO UPDATE SET
    from_id = excluded.from_id,
    to_id = excluded.to_id,
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_CONVERSATION_SQL = `
  INSERT INTO ${TABLE_CONVERSATION} (id, scenario_id, data, created_at, updated_at)
  VALUES (?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    scenario_id = excluded.scenario_id,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_CONVERSATION_PARTICIPANT_SQL = `
  INSERT INTO ${TABLE_CONVERSATION_PARTICIPANT} (id, character_id, conversation_id, created_at, updated_at)
  SELECT
    json_extract(value, '$[0]'),
    json_extract(value, '$[1]'),
    json_extract(value, '$[2]'),
    ${sqlDatetimeNow()},
    ${sqlDatetimeNow()}
  FROM json_each(?)
  WHERE TRUE
  ON CONFLICT(id)
  DO UPDATE SET
    character_id = excluded.character_id,
    conversation_id = excluded.conversation_id,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_MAP_SQL = `
  INSERT INTO ${TABLE_MAP} (id, data, created_at, updated_at)
  SELECT
    json_extract(value, '$[0]'),
    json_extract(value, '$[1]'),
    ${sqlDatetimeNow()},
    ${sqlDatetimeNow()}
  FROM json_each(?)
  WHERE TRUE
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const UPSERT_KEY_VALUE_SQL = `
  INSERT INTO ${TABLE_KEY_VALUE} (key, data, created_at, updated_at)
  VALUES (?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
  ON CONFLICT(key)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const SELECT_KEY_VALUE_SQL = `
  SELECT data
  FROM ${TABLE_KEY_VALUE}
  WHERE key = ?
  LIMIT 1
`;

const DELETE_KEY_VALUE_SQL = `
  DELETE FROM ${TABLE_KEY_VALUE}
  WHERE key = ?
`;

const SELECT_ALL_CHARACTERS_SQL = `
  SELECT *
  FROM ${TABLE_CHARACTER}
`;

const SELECT_ALL_SCENARIO_CHARACTERS_SQL = `
  SELECT *
  FROM ${TABLE_SCENARIO_CHARACTER}
  WHERE scenario_id = ?
`;

const SELECT_SCENARIO_CHARACTER_BY_ID_SQL = `
  SELECT *
  FROM ${TABLE_SCENARIO_CHARACTER}
  WHERE id = ?;
`;

const SELECT_SCENARIO_BY_ID_SQL = `
  SELECT *
  FROM ${TABLE_SCENARIO}
  WHERE id = ?
  LIMIT 1
`;

const SELECT_CHARACTER_RELATIONSHIPS_BY_PAIRS_SQL = `
  SELECT cr.*
  FROM ${TABLE_CHARACTER_RELATIONSHIP} cr
  JOIN json_each(?) AS pairs
    ON cr.from_id = json_extract(pairs.value, '$[0]')
    AND cr.to_id = json_extract(pairs.value, '$[1]')
`;

const SELECT_ALL_CONVERSATIONS_SQL = `
  SELECT *
  FROM ${TABLE_CONVERSATION}
  WHERE scenario_id = ?
  ORDER BY updated_at DESC, id DESC
  LIMIT ? OFFSET ?
`;

const SELECT_CONVERSATION_BY_ID_SQL = `
  SELECT *
  FROM ${TABLE_CONVERSATION}
  WHERE id = ?
  LIMIT 1
`;

const UPSERT_SCENARIO_EVENT_SQL = `
  INSERT INTO ${TABLE_SCENARIO_EVENT_LOG} (id, scenario_id, event_type, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    scenario_id = excluded.scenario_id,
    event_type = excluded.event_type,
    updated_at = ${sqlDatetimeNow()}
`;

const SELECT_SCENARIO_EVENT_PAGE_SQL = `
  SELECT *
  FROM ${TABLE_SCENARIO_EVENT_LOG}
  WHERE scenario_id = ?
  ORDER BY rowid DESC
  LIMIT ? OFFSET ?
`;

const SELECT_MAP_BY_ID_SQL = `
  SELECT *
  FROM ${TABLE_MAP}
  WHERE id = ?
  LIMIT 1
`;

const SELECT_ALL_MAPS_SQL = `
  SELECT *
  FROM ${TABLE_MAP}
`;

const SELECT_SCENARIO_SUMMARIES_SQL = `
  SELECT
    s.data AS scenario_data,
    s.created_at,
    s.updated_at,
    m.data AS map_data,
    uc.data AS user_character_data
  FROM ${TABLE_SCENARIO} s
  LEFT JOIN ${TABLE_MAP} m ON m.id = json_extract(s.data, '$.mapId')
  LEFT JOIN ${TABLE_SCENARIO_CHARACTER} uc ON uc.id = json_extract(s.data, '$.userCharacterId')
`;

const DELETE_CHARACTER_BY_ID_SQL = `
  DELETE FROM ${TABLE_CHARACTER}
  WHERE id = ?
`;

const DELETE_SCENARIO_CHARACTER_BY_ID_SQL = `
  DELETE FROM ${TABLE_SCENARIO_CHARACTER}
  WHERE id = ?
`;

const DELETE_SCENARIO_BY_ID_SQL = `
  DELETE FROM ${TABLE_SCENARIO}
  WHERE id = ?
`;

const DELETE_MAP_BY_ID_SQL = `
  DELETE FROM ${TABLE_MAP}
  WHERE id = ?
`;

const baseRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const dataRowSchema = baseRowSchema.extend({
  data: z.string(),
});

type ConversationPageResult = {
  entries: StoredConversation[];
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ScenarioEventPageResult = {
  entries: ScenarioEvent[];
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

async function selectUntypedMultiQuery(statement: string, parameterGroups: unknown[][]) {
  if (parameterGroups.length === 0) {
    return [];
  }

  const response = await Api.dbAll(statement, parameterGroups);
  return response.results.flat();
}

async function selectTypedMultiQuery<TRowType>(
  statement: string,
  parameterGroups: unknown[][],
  rowSchema: z.ZodType<TRowType>
) {
  const rows = await selectUntypedMultiQuery(statement, parameterGroups);
  return rows.map((row) => rowSchema.parse(row));
}

async function selectTypedSingleRow<TRowType>(
  statement: string,
  parameters: unknown[],
  rowSchema: z.ZodType<TRowType>
) {
  const rows = await selectTypedMultiQuery(statement, [parameters], rowSchema);
  return rows[0];
}

async function selectDataRows<TDataType>(
  statement: string,
  parameterGroups: unknown[][],
  dataSchema: z.ZodType<TDataType>
) {
  const rows = await selectTypedMultiQuery(statement, parameterGroups, dataRowSchema);
  return rows.map((row) => ({
    ...dataSchema.parse(JSON.parse(row.data)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function selectSingleDataRow<TDataType>(
  statement: string,
  parameters: unknown[],
  dataSchema: z.ZodType<TDataType>
) {
  const rows = await selectDataRows(statement, [parameters], dataSchema);
  return rows[0];
}

async function dbRun(statement: string, parameterGroups: unknown[][]) {
  if (parameterGroups.length === 0) {
    return;
  }

  await Api.dbRun(statement, parameterGroups);
}

function encodeStoredData(data: unknown, schema: z.ZodType) {
  return JSON.stringify(schema.parse(data));
}

function coerceToPositiveInteger(value: number | undefined, fallback: number) {
  return Math.min(Math.max(1, Math.trunc(value ?? fallback)), Number.MAX_SAFE_INTEGER);
}

export async function loadScenarioSummaries(): Promise<ScenarioSummary[]> {
  const rowSchema = z.object({
    scenario_data: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    map_data: z.string().nullable(),
    user_character_data: z.string().nullable(),
  });

  const rows = await selectTypedMultiQuery(SELECT_SCENARIO_SUMMARIES_SQL, [[]], rowSchema);

  return rows.map((row) => {
    const scenario = {
      ...scenarioSchema.parse(JSON.parse(row.scenario_data)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const mapName = row.map_data ? worldMapSchema.parse(JSON.parse(row.map_data)).name : 'Deleted Map';
    const userChar = row.user_character_data
      ? characterSchema.parse(JSON.parse(row.user_character_data))
      : null;
    const userCharacterName = userChar
      ? `${userChar.firstName} ${userChar.lastName}`.trim()
      : 'Deleted Character';

    return { scenario, mapName, userCharacterName, createdAt: row.created_at, updatedAt: row.updated_at };
  });
}

async function storeCharacterRelationships(relationships: CharacterRelationship[]) {
  if (relationships.length === 0) return;
  const rows = relationships.map((relationship) => [
    relationship.id,
    relationship.fromId,
    relationship.toId,
    encodeStoredData(relationship, characterRelationshipSchema),
  ]);
  await dbRun(UPSERT_CHARACTER_RELATIONSHIP_SQL, [[JSON.stringify(rows)]]);
}

export async function storeCharacterRelationship(relationship: CharacterRelationship) {
  return storeCharacterRelationships([relationship]);
}

export async function loadCharacterRelationshipsByPairs(
  pairs: CharacterPair[]
): Promise<CharacterRelationship[]> {
  if (pairs.length === 0) return [];
  return selectDataRows(
    SELECT_CHARACTER_RELATIONSHIPS_BY_PAIRS_SQL,
    [[JSON.stringify(pairs.map((pair) => [pair.fromId, pair.toId]))]],
    characterRelationshipSchema
  );
}

export async function loadWeightedGossipTargetCharacterId(
  fromCharacterId: string,
  excludedToCharacterIds: string[],
  userCharacterId: string,
  userGossipChanceMultiplier: number,
  familiarityWeightMultiplier: number
) {
  const statement = `
    WITH candidate_relationships AS (
      SELECT
        to_id,
        COALESCE(CAST(json_extract(data, '$.familiarity') AS REAL), 0.0) AS familiarity
      FROM ${TABLE_CHARACTER_RELATIONSHIP}
      WHERE from_id = ?
        ${
          excludedToCharacterIds.length > 0
            ? `AND to_id NOT IN (${buildSqlPlaceholders(excludedToCharacterIds.length)})`
            : ''
        }
        AND TRIM(COALESCE(json_extract(data, '$.memory'), '')) <> ''
    ),
    weighted_draw AS (
      SELECT
        to_id,
        (
          (
            1.0
            + (? * ln(1.0 + MAX(0.0, familiarity)))
          )
          * CASE WHEN to_id = ? THEN ? ELSE 1.0 END
        ) AS adjusted_weight,
        MAX(1e-12, ABS(random()) / 9223372036854775807.0) AS u
      FROM candidate_relationships
    )
    SELECT to_id
    FROM weighted_draw
    WHERE adjusted_weight > 0
    ORDER BY (-ln(u) / adjusted_weight) ASC
    LIMIT 1
  `;

  const rowRecordParams: unknown[] = [fromCharacterId];
  const resultRow = await selectTypedSingleRow(
    statement,
    rowRecordParams.concat(excludedToCharacterIds, [
      familiarityWeightMultiplier,
      userCharacterId,
      userGossipChanceMultiplier,
    ]),
    z.object({
      to_id: z.string(),
    })
  );

  return resultRow?.to_id;
}

export async function storeGlobalCharacters(characters: Character[]) {
  if (characters.length === 0) return;
  await dbRun(UPSERT_CHARACTER_SQL, [
    [JSON.stringify(characters.map((c) => [c.id, encodeStoredData(c, characterSchema)]))],
  ]);
}

export async function storeScenarioCharacters(characters: Character[]) {
  if (characters.length === 0) return;
  await dbRun(UPSERT_SCENARIO_CHARACTER_SQL, [
    [
      JSON.stringify(
        characters.map((character) => [
          character.id,
          character.scenarioId,
          encodeStoredData(character, characterSchema),
        ])
      ),
    ],
  ]);
}

export async function storeScenarioCharacter(character: Character) {
  return storeScenarioCharacters([character]);
}

export async function loadGlobalCharacters() {
  return selectDataRows(SELECT_ALL_CHARACTERS_SQL, [[]], characterSchema);
}

export async function loadScenarioCharacters(scenarioId: string) {
  return selectDataRows(SELECT_ALL_SCENARIO_CHARACTERS_SQL, [[scenarioId]], characterSchema);
}

export async function loadScenarioCharactersByIds(ids: string[]) {
  return selectDataRows(
    SELECT_SCENARIO_CHARACTER_BY_ID_SQL,
    ids.map((id) => [id]),
    characterSchema
  );
}

export async function loadMaps() {
  return selectDataRows(SELECT_ALL_MAPS_SQL, [[]], worldMapSchema);
}

export async function loadMap(id: string) {
  return selectSingleDataRow(SELECT_MAP_BY_ID_SQL, [id], worldMapSchema);
}

export async function storeMaps(maps: WorldMap[]) {
  if (maps.length === 0) return;
  await dbRun(UPSERT_MAP_SQL, [
    [JSON.stringify(maps.map((map) => [map.id, encodeStoredData(map, worldMapSchema)]))],
  ]);
}

export async function storeMap(map: WorldMap) {
  return storeMaps([map]);
}

export async function deleteMap(id: string) {
  await dbRun(DELETE_MAP_BY_ID_SQL, [[id]]);
}

export async function deleteGlobalCharacter(id: string) {
  await dbRun(DELETE_CHARACTER_BY_ID_SQL, [[id]]);
}

export async function deleteScenarioCharacters(characterIds: string[]) {
  await dbRun(
    DELETE_SCENARIO_CHARACTER_BY_ID_SQL,
    characterIds.map((id) => [id])
  );
}

export async function deleteScenarioCharacter(characterId: string) {
  return deleteScenarioCharacters([characterId]);
}

export async function loadScenario(scenarioId: string) {
  return selectSingleDataRow(SELECT_SCENARIO_BY_ID_SQL, [scenarioId], scenarioSchema);
}

export async function storeScenario(scenario: Scenario) {
  return dbRun(UPSERT_SCENARIO_SQL, [[scenario.id, encodeStoredData(scenario, scenarioSchema)]]);
}

async function loadConversationPage(
  scenarioId: string,
  page: number,
  pageSize: number = 20
): Promise<ConversationPageResult> {
  const coercedPage = coerceToPositiveInteger(page, 1);
  const coercedPageSize = coerceToPositiveInteger(pageSize, 20);
  const offset = (coercedPage - 1) * coercedPageSize;

  const conversations = await selectDataRows(
    SELECT_ALL_CONVERSATIONS_SQL,
    [[scenarioId, coercedPageSize + 1, offset]],
    storedConversationSchema
  );

  return {
    entries: conversations.slice(0, coercedPageSize),
    page: coercedPage,
    hasPreviousPage: coercedPage > 1,
    hasNextPage: conversations.length > coercedPageSize,
  };
}

function buildParticipantConversationPageSql(participantCount: number): string {
  if (participantCount < 1) {
    throw new Error('Participant count must be at least 1.');
  }

  const baseAlias = 'cp_0';
  const joinLines = [
    `  FROM ${TABLE_CONVERSATION_PARTICIPANT} ${baseAlias}`,
    `  JOIN ${TABLE_CONVERSATION} c`,
    `    ON c.id = ${baseAlias}.conversation_id`,
  ];

  for (let index = 1; index < participantCount; index++) {
    const alias = `cp_${index}`;
    joinLines.push(
      `  JOIN ${TABLE_CONVERSATION_PARTICIPANT} ${alias}`,
      `    ON ${alias}.conversation_id = ${baseAlias}.conversation_id`
    );
  }

  const whereLines = [`  WHERE ${baseAlias}.character_id = ?`];
  for (let index = 1; index < participantCount; index++) {
    whereLines.push(`    AND cp_${index}.character_id = ?`);
  }

  return `
  SELECT c.*
${joinLines.join('\n')}
${whereLines.join('\n')}
  ORDER BY c.updated_at DESC, c.id DESC
  LIMIT ? OFFSET ?
`;
}

export async function loadConversationByParticipantsPage(
  scenarioId: string,
  participantIds: string[],
  page: number,
  pageSize: number = 20
): Promise<ConversationPageResult> {
  if (participantIds.length === 0) {
    return loadConversationPage(scenarioId, page, pageSize);
  }

  const coercedPage = coerceToPositiveInteger(page, 1);
  const coercedPageSize = coerceToPositiveInteger(pageSize, 20);
  const offset = (coercedPage - 1) * coercedPageSize;

  const sql = buildParticipantConversationPageSql(participantIds.length);
  const params = [...participantIds, coercedPageSize + 1, offset];
  const results = await selectDataRows(sql, [params], storedConversationSchema);

  return {
    entries: results.slice(0, coercedPageSize),
    page: coercedPage,
    hasPreviousPage: coercedPage > 1,
    hasNextPage: results.length > coercedPageSize,
  };
}

export async function loadConversationById(conversationId: string) {
  return selectSingleDataRow(SELECT_CONVERSATION_BY_ID_SQL, [conversationId], storedConversationSchema);
}

export async function storeConversation(scenarioId: string, entry: StoredConversation) {
  const parsedEntry = storedConversationSchema.parse(entry);
  await dbRun(UPSERT_CONVERSATION_SQL, [
    [parsedEntry.id, scenarioId, encodeStoredData(parsedEntry, storedConversationSchema)],
  ]);

  await dbRun(UPSERT_CONVERSATION_PARTICIPANT_SQL, [
    [
      JSON.stringify(
        parsedEntry.serializedTranscript.participants.map((participant) => [
          newId(),
          participant.id,
          parsedEntry.id,
        ])
      ),
    ],
  ]);
}

export async function storeScenarioEvent(scenarioId: string, event: ScenarioEvent) {
  await dbRun(UPSERT_SCENARIO_EVENT_SQL, [
    [event.id, scenarioId, event.eventType, encodeStoredData(event, scenarioEventSchema)],
  ]);
}

export async function loadScenarioEventPage(
  scenarioId: string,
  page: number,
  pageSize: number = 100
): Promise<ScenarioEventPageResult> {
  const coercedPage = coerceToPositiveInteger(page, 1);
  const coercedPageSize = coerceToPositiveInteger(pageSize, 100);
  const offset = (coercedPage - 1) * coercedPageSize;

  const entries = await selectDataRows(
    SELECT_SCENARIO_EVENT_PAGE_SQL,
    [[scenarioId, coercedPageSize + 1, offset]],
    scenarioEventSchema
  );

  return {
    entries: entries.slice(0, coercedPageSize),
    page: coercedPage,
    hasPreviousPage: coercedPage > 1,
    hasNextPage: entries.length > coercedPageSize,
  };
}

export async function deleteScenarioDatabase(scenarioId: string) {
  await dbRun(DELETE_SCENARIO_BY_ID_SQL, [[scenarioId]]);
}

export async function storeKeyValue<TValue>(key: string, value: TValue, schema: z.ZodType<TValue>) {
  await dbRun(UPSERT_KEY_VALUE_SQL, [[key, encodeStoredData(value, schema)]]);
}

export async function loadKeyValue<TValue>(
  key: string,
  schema: z.ZodType<TValue>
): Promise<TValue | undefined> {
  const row = await selectTypedSingleRow(SELECT_KEY_VALUE_SQL, [key], z.object({ data: z.string() }));
  return row ? schema.parse(JSON.parse(row.data)) : undefined;
}

export async function deleteKeyValue(key: string) {
  await dbRun(DELETE_KEY_VALUE_SQL, [[key]]);
}

const TABLE_USER_TEXT_FILES = 'user_text_files';

const UPSERT_USER_TEXT_FILE_SQL = `
  INSERT INTO ${TABLE_USER_TEXT_FILES} (id, group_key, file_name, file_content, created_at, updated_at)
  VALUES (?, ?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
  ON CONFLICT(id)
  DO UPDATE SET
    file_name = excluded.file_name,
    file_content = excluded.file_content,
    updated_at = ${sqlDatetimeNow()}
`;

const SELECT_USER_TEXT_FILES_BY_GROUP_SQL = `
  SELECT id, file_name, group_key, file_content
  FROM ${TABLE_USER_TEXT_FILES}
  WHERE group_key = ?
`;

const SELECT_USER_TEXT_FILE_CONTENT_SQL = `
  SELECT file_content
  FROM ${TABLE_USER_TEXT_FILES}
  WHERE group_key = ? AND id = ?
  LIMIT 1
`;

const DELETE_USER_TEXT_FILE_SQL = `
  DELETE FROM ${TABLE_USER_TEXT_FILES}
  WHERE id = ?
`;

export type UserTextFileSummary = { id: string; fileName: string; groupKey: string; fileContent: string };

export async function loadUserTextFiles(groupKey: string): Promise<UserTextFileSummary[]> {
  const rows = await selectTypedMultiQuery(
    SELECT_USER_TEXT_FILES_BY_GROUP_SQL,
    [[groupKey]],
    z.object({ id: z.string(), file_name: z.string(), group_key: z.string(), file_content: z.string() })
  );
  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    groupKey: row.group_key,
    fileContent: row.file_content,
  }));
}

export async function loadUserTextFileContent(groupKey: string, id: string): Promise<string | undefined> {
  const row = await selectTypedSingleRow(
    SELECT_USER_TEXT_FILE_CONTENT_SQL,
    [groupKey, id],
    z.object({ file_content: z.string() })
  );
  return row?.file_content;
}

export async function saveUserTextFile(file: {
  id: string;
  groupKey: string;
  fileName: string;
  fileContent: string;
}): Promise<void> {
  await dbRun(UPSERT_USER_TEXT_FILE_SQL, [[file.id, file.groupKey, file.fileName, file.fileContent]]);
}

export async function deleteUserTextFile(id: string): Promise<void> {
  await dbRun(DELETE_USER_TEXT_FILE_SQL, [[id]]);
}

const UPSERT_SCENARIO_CHARACTER_GROUP_SQL = `
  INSERT INTO ${TABLE_SCENARIO_CHARACTER_GROUP} (id, scenario_id, data, created_at, updated_at)
  SELECT
    json_extract(value, '$[0]'),
    json_extract(value, '$[1]'),
    json_extract(value, '$[2]'),
    ${sqlDatetimeNow()},
    ${sqlDatetimeNow()}
  FROM json_each(?)
  WHERE TRUE
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const SELECT_SCENARIO_CHARACTER_GROUPS_SQL = `
  SELECT *
  FROM ${TABLE_SCENARIO_CHARACTER_GROUP}
  WHERE scenario_id = ?
`;

const DELETE_SCENARIO_CHARACTER_GROUP_SQL = `
  DELETE FROM ${TABLE_SCENARIO_CHARACTER_GROUP}
  WHERE id = ?
`;

const UPSERT_GROUP_SCHEDULE_SQL = `
  INSERT INTO ${TABLE_SCENARIO_CHARACTER_GROUP_SCHEDULE} (id, scenario_id, group_id, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
  ON CONFLICT(id)
  DO UPDATE SET
    data = excluded.data,
    updated_at = ${sqlDatetimeNow()}
`;

const SELECT_GROUP_SCHEDULES_SQL = `
  SELECT *
  FROM ${TABLE_SCENARIO_CHARACTER_GROUP_SCHEDULE}
  WHERE scenario_id = ?
`;

const DELETE_GROUP_SCHEDULE_SQL = `
  DELETE FROM ${TABLE_SCENARIO_CHARACTER_GROUP_SCHEDULE}
  WHERE id = ?
`;

export async function storeScenarioCharacterGroups(groups: ScenarioCharacterGroup[]) {
  if (groups.length === 0) return;
  await dbRun(UPSERT_SCENARIO_CHARACTER_GROUP_SQL, [
    [
      JSON.stringify(
        groups.map((group) => [
          group.id,
          group.scenarioId,
          encodeStoredData(group, scenarioCharacterGroupSchema),
        ])
      ),
    ],
  ]);
}

export async function loadScenarioCharacterGroups(scenarioId: string) {
  return selectDataRows(SELECT_SCENARIO_CHARACTER_GROUPS_SQL, [[scenarioId]], scenarioCharacterGroupSchema);
}

export async function deleteScenarioCharacterGroup(id: string) {
  await dbRun(DELETE_SCENARIO_CHARACTER_GROUP_SQL, [[id]]);
}

export async function storeGroupSchedule(schedule: ScenarioCharacterGroupSchedule) {
  await dbRun(UPSERT_GROUP_SCHEDULE_SQL, [
    [
      schedule.id,
      schedule.scenarioId,
      schedule.groupId,
      encodeStoredData(schedule, scenarioCharacterGroupScheduleSchema),
    ],
  ]);
}

export async function loadGroupSchedules(scenarioId: string) {
  return selectDataRows(SELECT_GROUP_SCHEDULES_SQL, [[scenarioId]], scenarioCharacterGroupScheduleSchema);
}

export async function deleteGroupSchedule(id: string) {
  await dbRun(DELETE_GROUP_SCHEDULE_SQL, [[id]]);
}

export function createPersistedObject<
  TFieldsType extends {
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    id?: string | undefined;
    [key: string]: unknown;
  },
>(additionalFields: TFieldsType): RootPersistedObject & TFieldsType {
  const now = new Date();

  return {
    ...additionalFields,
    id: additionalFields.id ?? newId(),
    createdAt: additionalFields.createdAt ?? now.toISOString(),
    updatedAt: additionalFields.updatedAt ?? now.toISOString(),
  };
}

const databaseDebouncer = new ReadWriteDebouncer<any>();

export async function doAsDataWrite(
  func: () => Promise<void>,
  objectType: string,
  opts?: {
    debouncerKey: string;
  }
) {
  await runWithInteractiveRetry({
    operationType: `database.write.${objectType}`,
    hint: 'The backend server might not be running. Changes are failing to save. Data may be lost.',
    run: () => {
      if (opts?.debouncerKey) {
        return databaseDebouncer.write(opts.debouncerKey, func);
      } else {
        return func();
      }
    },
  });
}

export async function doAsDataRead<TReadType>(
  func: () => Promise<TReadType>,
  objectType: string,
  opts?: {
    debouncerKey: string;
  }
) {
  return runWithInteractiveRetry({
    operationType: `database.read.${objectType}`,
    hint: 'The backend server might not be running.',
    run: () => {
      if (opts?.debouncerKey) {
        return databaseDebouncer.read(opts.debouncerKey, func) as Promise<TReadType>;
      } else {
        return func();
      }
    },
  });
}
