import * as Api from './api.js';
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
import { newId } from '../util/id.js';
import { runWithInteractiveRetry } from '../engine/interative_retry.js';
import { ReadWriteDebouncer } from '../util/rw_debouncer.js';

function buildSqlPlaceholders(count: number): string {
  return Array(count).fill('?').join(', ');
}

function sqlDatetimeNow() {
  return `CONCAT(datetime('now'), 'Z')`;
}

function encodeStoredData(data: unknown, schema: z.ZodType) {
  return JSON.stringify(schema.parse(data));
}

function coerceToPositiveInteger(value: number | undefined, fallback: number) {
  return Math.min(Math.max(1, Math.trunc(value ?? fallback)), Number.MAX_SAFE_INTEGER);
}

const baseRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const dataRowSchema = baseRowSchema.extend({
  data: z.string(),
});

export type ConversationPageResult = {
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

export type UserTextFileSummary = {
  id: string;
  fileName: string;
  groupKey: string;
  fileContent: string;
};

function createSqlStatements(schema: string) {
  const table = (name: string) => `${schema}.${name}`;

  return {
    table,
    UPSERT_CHARACTER_SQL: `
      INSERT INTO ${table('character')} (id, data, created_at, updated_at)
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
    `,
    UPSERT_SCENARIO_CHARACTER_SQL: `
      INSERT INTO ${table('scenario_character')} (id, scenario_id, data, created_at, updated_at)
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
    `,
    UPSERT_SCENARIO_SQL: `
      INSERT INTO ${table('scenario')} (id, data, created_at, updated_at)
      VALUES (?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
      ON CONFLICT(id)
      DO UPDATE SET
        data = excluded.data,
        updated_at = ${sqlDatetimeNow()}
    `,
    UPSERT_CHARACTER_RELATIONSHIP_SQL: `
      INSERT INTO ${table('character_relationship')} (id, from_id, to_id, data, created_at, updated_at)
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
    `,
    UPSERT_CONVERSATION_SQL: `
      INSERT INTO ${table('conversation')} (id, scenario_id, data, created_at, updated_at)
      VALUES (?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
      ON CONFLICT(id)
      DO UPDATE SET
        data = excluded.data,
        scenario_id = excluded.scenario_id,
        updated_at = ${sqlDatetimeNow()}
    `,
    UPSERT_CONVERSATION_PARTICIPANT_SQL: `
      INSERT INTO ${table('conversation_participant')} (id, character_id, conversation_id, created_at, updated_at)
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
    `,
    UPSERT_MAP_SQL: `
      INSERT INTO ${table('map')} (id, data, created_at, updated_at)
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
    `,
    UPSERT_KEY_VALUE_SQL: `
      INSERT INTO ${table('key_value')} (key, data, created_at, updated_at)
      VALUES (?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
      ON CONFLICT(key)
      DO UPDATE SET
        data = excluded.data,
        updated_at = ${sqlDatetimeNow()}
    `,
    SELECT_KEY_VALUE_SQL: `
      SELECT data
      FROM ${table('key_value')}
      WHERE key = ?
      LIMIT 1
    `,
    DELETE_KEY_VALUE_SQL: `
      DELETE FROM ${table('key_value')}
      WHERE key = ?
    `,
    SELECT_ALL_CHARACTERS_SQL: `
      SELECT *
      FROM ${table('character')}
    `,
    SELECT_ALL_SCENARIO_CHARACTERS_SQL: `
      SELECT *
      FROM ${table('scenario_character')}
      WHERE scenario_id = ?
    `,
    SELECT_SCENARIO_CHARACTER_BY_ID_SQL: `
      SELECT *
      FROM ${table('scenario_character')}
      WHERE id = ?;
    `,
    SELECT_SCENARIO_BY_ID_SQL: `
      SELECT *
      FROM ${table('scenario')}
      WHERE id = ?
      LIMIT 1
    `,
    SELECT_CHARACTER_RELATIONSHIPS_BY_PAIRS_SQL: `
      SELECT cr.*
      FROM ${table('character_relationship')} cr
      JOIN json_each(?) AS pairs
        ON cr.from_id = json_extract(pairs.value, '$[0]')
        AND cr.to_id = json_extract(pairs.value, '$[1]')
    `,
    SELECT_ALL_CONVERSATIONS_SQL: `
      SELECT *
      FROM ${table('conversation')}
      WHERE scenario_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    SELECT_CONVERSATION_BY_ID_SQL: `
      SELECT *
      FROM ${table('conversation')}
      WHERE id = ?
      LIMIT 1
    `,
    UPSERT_SCENARIO_EVENT_SQL: `
      INSERT INTO ${table('scenario_event_log')} (id, scenario_id, event_type, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
      ON CONFLICT(id)
      DO UPDATE SET
        data = excluded.data,
        scenario_id = excluded.scenario_id,
        event_type = excluded.event_type,
        updated_at = ${sqlDatetimeNow()}
    `,
    SELECT_SCENARIO_EVENT_PAGE_SQL: `
      SELECT *
      FROM ${table('scenario_event_log')}
      WHERE scenario_id = ?
      ORDER BY rowid DESC
      LIMIT ? OFFSET ?
    `,
    SELECT_MAP_BY_ID_SQL: `
      SELECT *
      FROM ${table('map')}
      WHERE id = ?
      LIMIT 1
    `,
    SELECT_ALL_MAPS_SQL: `
      SELECT *
      FROM ${table('map')}
    `,
    SELECT_SCENARIO_SUMMARIES_SQL: `
      SELECT
        s.data AS scenario_data,
        s.created_at,
        s.updated_at,
        m.data AS map_data,
        uc.data AS user_character_data
      FROM ${table('scenario')} s
      LEFT JOIN ${table('map')} m ON m.id = json_extract(s.data, '$.mapId')
      LEFT JOIN ${table('scenario_character')} uc ON uc.id = json_extract(s.data, '$.userCharacterId')
    `,
    DELETE_CHARACTER_BY_ID_SQL: `
      DELETE FROM ${table('character')}
      WHERE id = ?
    `,
    DELETE_SCENARIO_CHARACTER_BY_ID_SQL: `
      DELETE FROM ${table('scenario_character')}
      WHERE id = ?
    `,
    DELETE_SCENARIO_BY_ID_SQL: `
      DELETE FROM ${table('scenario')}
      WHERE id = ?
    `,
    DELETE_MAP_BY_ID_SQL: `
      DELETE FROM ${table('map')}
      WHERE id = ?
    `,
    SELECT_USER_TEXT_FILES_BY_GROUP_SQL: `
      SELECT id, file_name, group_key, file_content
      FROM ${table('user_text_files')}
      WHERE group_key = ?
      ORDER BY file_name ASC
    `,
    SELECT_USER_TEXT_FILE_CONTENT_SQL: `
      SELECT file_content
      FROM ${table('user_text_files')}
      WHERE group_key = ? AND id = ?
      LIMIT 1
    `,
    UPSERT_USER_TEXT_FILE_SQL: `
      INSERT INTO ${table('user_text_files')} (id, group_key, file_name, file_content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
      ON CONFLICT(id)
      DO UPDATE SET
        group_key = excluded.group_key,
        file_name = excluded.file_name,
        file_content = excluded.file_content,
        updated_at = ${sqlDatetimeNow()}
    `,
    DELETE_USER_TEXT_FILE_SQL: `
      DELETE FROM ${table('user_text_files')}
      WHERE id = ?
    `,
    UPSERT_SCENARIO_CHARACTER_GROUP_SQL: `
      INSERT INTO ${table('scenario_character_group')} (id, scenario_id, data, created_at, updated_at)
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
    `,
    SELECT_SCENARIO_CHARACTER_GROUPS_SQL: `
      SELECT *
      FROM ${table('scenario_character_group')}
      WHERE scenario_id = ?
    `,
    DELETE_SCENARIO_CHARACTER_GROUP_SQL: `
      DELETE FROM ${table('scenario_character_group')}
      WHERE id = ?
    `,
    UPSERT_GROUP_SCHEDULE_SQL: `
      INSERT INTO ${table('scenario_character_group_schedule')} (id, scenario_id, group_id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ${sqlDatetimeNow()}, ${sqlDatetimeNow()})
      ON CONFLICT(id)
      DO UPDATE SET
        data = excluded.data,
        updated_at = ${sqlDatetimeNow()}
    `,
    SELECT_GROUP_SCHEDULES_SQL: `
      SELECT *
      FROM ${table('scenario_character_group_schedule')}
      WHERE scenario_id = ?
    `,
    DELETE_GROUP_SCHEDULE_SQL: `
      DELETE FROM ${table('scenario_character_group_schedule')}
      WHERE id = ?
    `,
  };
}

export class DatabaseClient {
  public readonly targetSchema: string;
  public readonly sql: ReturnType<typeof createSqlStatements>;

  constructor(targetSchema: string = 'main') {
    this.targetSchema = targetSchema;
    this.sql = createSqlStatements(targetSchema);
  }

  private async selectUntypedMultiQuery(statement: string, parameterGroups: unknown[][]) {
    if (parameterGroups.length === 0) {
      return [];
    }

    const response = await Api.dbAll(statement, parameterGroups);
    return response.results.flat();
  }

  private async selectTypedMultiQuery<TRowType>(
    statement: string,
    parameterGroups: unknown[][],
    rowSchema: z.ZodType<TRowType>
  ) {
    const rows = await this.selectUntypedMultiQuery(statement, parameterGroups);
    return rows.map((row) => rowSchema.parse(row));
  }

  private async selectTypedSingleRow<TRowType>(
    statement: string,
    parameters: unknown[],
    rowSchema: z.ZodType<TRowType>
  ) {
    const rows = await this.selectTypedMultiQuery(statement, [parameters], rowSchema);
    return rows[0];
  }

  private async selectDataRows<TDataType>(
    statement: string,
    parameterGroups: unknown[][],
    dataSchema: z.ZodType<TDataType>
  ) {
    const rows = await this.selectTypedMultiQuery(statement, parameterGroups, dataRowSchema);
    return rows.map((row) => ({
      ...dataSchema.parse(JSON.parse(row.data)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async selectSingleDataRow<TDataType>(
    statement: string,
    parameters: unknown[],
    dataSchema: z.ZodType<TDataType>
  ) {
    const rows = await this.selectDataRows(statement, [parameters], dataSchema);
    return rows[0];
  }

  private async dbRun(statement: string, parameterGroups: unknown[][]) {
    if (parameterGroups.length === 0) {
      return;
    }

    await Api.dbRun(statement, parameterGroups);
  }

  public async loadScenarioSummaries(): Promise<ScenarioSummary[]> {
    const rowSchema = z.object({
      scenario_data: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      map_data: z.string().nullable(),
      user_character_data: z.string().nullable(),
    });

    const rows = await this.selectTypedMultiQuery(this.sql.SELECT_SCENARIO_SUMMARIES_SQL, [[]], rowSchema);

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

  public async storeCharacterRelationships(relationships: CharacterRelationship[]) {
    if (relationships.length === 0) return;
    const rows = relationships.map((relationship) => [
      relationship.id,
      relationship.fromId,
      relationship.toId,
      encodeStoredData(relationship, characterRelationshipSchema),
    ]);
    await this.dbRun(this.sql.UPSERT_CHARACTER_RELATIONSHIP_SQL, [[JSON.stringify(rows)]]);
  }

  public async storeCharacterRelationship(relationship: CharacterRelationship) {
    return this.storeCharacterRelationships([relationship]);
  }

  public async loadCharacterRelationshipsByPairs(pairs: CharacterPair[]): Promise<CharacterRelationship[]> {
    if (pairs.length === 0) return [];
    return this.selectDataRows(
      this.sql.SELECT_CHARACTER_RELATIONSHIPS_BY_PAIRS_SQL,
      [[JSON.stringify(pairs.map((pair) => [pair.fromId, pair.toId]))]],
      characterRelationshipSchema
    );
  }

  public async loadWeightedGossipTargetCharacterId(
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
        FROM ${this.sql.table('character_relationship')}
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
    const resultRow = await this.selectTypedSingleRow(
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

  public async storeGlobalCharacters(characters: Character[]) {
    if (characters.length === 0) return;
    await this.dbRun(this.sql.UPSERT_CHARACTER_SQL, [
      [JSON.stringify(characters.map((c) => [c.id, encodeStoredData(c, characterSchema)]))],
    ]);
  }

  public async storeScenarioCharacters(characters: Character[]) {
    if (characters.length === 0) return;
    await this.dbRun(this.sql.UPSERT_SCENARIO_CHARACTER_SQL, [
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

  public async storeScenarioCharacter(character: Character) {
    return this.storeScenarioCharacters([character]);
  }

  public async loadGlobalCharacters() {
    return this.selectDataRows(this.sql.SELECT_ALL_CHARACTERS_SQL, [[]], characterSchema);
  }

  public async loadScenarioCharacters(scenarioId: string) {
    return this.selectDataRows(this.sql.SELECT_ALL_SCENARIO_CHARACTERS_SQL, [[scenarioId]], characterSchema);
  }

  public async loadScenarioCharactersByIds(ids: string[]) {
    return this.selectDataRows(
      this.sql.SELECT_SCENARIO_CHARACTER_BY_ID_SQL,
      ids.map((id) => [id]),
      characterSchema
    );
  }

  public async loadMaps() {
    return this.selectDataRows(this.sql.SELECT_ALL_MAPS_SQL, [[]], worldMapSchema);
  }

  public async loadMap(id: string) {
    return this.selectSingleDataRow(this.sql.SELECT_MAP_BY_ID_SQL, [id], worldMapSchema);
  }

  public async storeMaps(maps: WorldMap[]) {
    if (maps.length === 0) return;
    await this.dbRun(this.sql.UPSERT_MAP_SQL, [
      [JSON.stringify(maps.map((map) => [map.id, encodeStoredData(map, worldMapSchema)]))],
    ]);
  }

  public async storeMap(map: WorldMap) {
    return this.storeMaps([map]);
  }

  public async deleteMap(id: string) {
    await this.dbRun(this.sql.DELETE_MAP_BY_ID_SQL, [[id]]);
  }

  public async deleteGlobalCharacter(id: string) {
    await this.dbRun(this.sql.DELETE_CHARACTER_BY_ID_SQL, [[id]]);
  }

  public async deleteScenarioCharacters(characterIds: string[]) {
    await this.dbRun(
      this.sql.DELETE_SCENARIO_CHARACTER_BY_ID_SQL,
      characterIds.map((id) => [id])
    );
  }

  public async deleteScenarioCharacter(characterId: string) {
    return this.deleteScenarioCharacters([characterId]);
  }

  public async loadScenario(scenarioId: string) {
    return this.selectSingleDataRow(this.sql.SELECT_SCENARIO_BY_ID_SQL, [scenarioId], scenarioSchema);
  }

  public async storeScenario(scenario: Scenario) {
    return this.dbRun(this.sql.UPSERT_SCENARIO_SQL, [
      [scenario.id, encodeStoredData(scenario, scenarioSchema)],
    ]);
  }

  private async loadConversationPage(
    scenarioId: string,
    page: number,
    pageSize: number = 20
  ): Promise<ConversationPageResult> {
    const coercedPage = coerceToPositiveInteger(page, 1);
    const coercedPageSize = coerceToPositiveInteger(pageSize, 20);
    const offset = (coercedPage - 1) * coercedPageSize;

    const conversations = await this.selectDataRows(
      this.sql.SELECT_ALL_CONVERSATIONS_SQL,
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

  private buildParticipantConversationPageSql(participantCount: number): string {
    if (participantCount < 1) {
      throw new Error('Participant count must be at least 1.');
    }

    const baseAlias = 'cp_0';
    const joinLines = [
      `  FROM ${this.sql.table('conversation_participant')} ${baseAlias}`,
      `  JOIN ${this.sql.table('conversation')} c`,
      `    ON c.id = ${baseAlias}.conversation_id`,
    ];

    for (let index = 1; index < participantCount; index++) {
      const alias = `cp_${index}`;
      joinLines.push(
        `  JOIN ${this.sql.table('conversation_participant')} ${alias}`,
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

  public async loadConversationByParticipantsPage(
    scenarioId: string,
    participantIds: string[],
    page: number,
    pageSize: number = 20
  ): Promise<ConversationPageResult> {
    if (participantIds.length === 0) {
      return this.loadConversationPage(scenarioId, page, pageSize);
    }

    const coercedPage = coerceToPositiveInteger(page, 1);
    const coercedPageSize = coerceToPositiveInteger(pageSize, 20);
    const offset = (coercedPage - 1) * coercedPageSize;

    const sql = this.buildParticipantConversationPageSql(participantIds.length);
    const params = [...participantIds, coercedPageSize + 1, offset];
    const results = await this.selectDataRows(sql, [params], storedConversationSchema);

    return {
      entries: results.slice(0, coercedPageSize),
      page: coercedPage,
      hasPreviousPage: coercedPage > 1,
      hasNextPage: results.length > coercedPageSize,
    };
  }

  public async loadConversationById(conversationId: string) {
    return this.selectSingleDataRow(
      this.sql.SELECT_CONVERSATION_BY_ID_SQL,
      [conversationId],
      storedConversationSchema
    );
  }

  public async storeConversation(scenarioId: string, entry: StoredConversation) {
    const parsedEntry = storedConversationSchema.parse(entry);
    await this.dbRun(this.sql.UPSERT_CONVERSATION_SQL, [
      [parsedEntry.id, scenarioId, encodeStoredData(parsedEntry, storedConversationSchema)],
    ]);

    await this.dbRun(this.sql.UPSERT_CONVERSATION_PARTICIPANT_SQL, [
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

  public async storeScenarioEvent(scenarioId: string, event: ScenarioEvent) {
    await this.dbRun(this.sql.UPSERT_SCENARIO_EVENT_SQL, [
      [event.id, scenarioId, event.eventType, encodeStoredData(event, scenarioEventSchema)],
    ]);
  }

  public async loadScenarioEventPage(
    scenarioId: string,
    page: number = 0,
    pageSize: number = 50
  ): Promise<ScenarioEventPageResult> {
    const coercedPage = Math.max(0, Math.trunc(page));
    const coercedPageSize = coerceToPositiveInteger(pageSize, 50);
    const offset = coercedPage * coercedPageSize;

    const entries = await this.selectDataRows(
      this.sql.SELECT_SCENARIO_EVENT_PAGE_SQL,
      [[scenarioId, coercedPageSize + 1, offset]],
      scenarioEventSchema
    );

    return {
      entries: entries.slice(0, coercedPageSize),
      page: coercedPage,
      hasPreviousPage: coercedPage > 0,
      hasNextPage: entries.length > coercedPageSize,
    };
  }

  public async deleteScenarioDatabase(scenarioId: string) {
    await this.dbRun(this.sql.DELETE_SCENARIO_BY_ID_SQL, [[scenarioId]]);
  }

  public async storeKeyValue<TValue>(key: string, value: TValue, schema: z.ZodType<TValue>) {
    await this.dbRun(this.sql.UPSERT_KEY_VALUE_SQL, [[key, encodeStoredData(value, schema)]]);
  }

  public async loadKeyValue<TValue>(key: string, schema: z.ZodType<TValue>): Promise<TValue | undefined> {
    const row = await this.selectTypedSingleRow(
      this.sql.SELECT_KEY_VALUE_SQL,
      [key],
      z.object({ data: z.string() })
    );
    return row ? schema.parse(JSON.parse(row.data)) : undefined;
  }

  public async deleteKeyValue(key: string) {
    await this.dbRun(this.sql.DELETE_KEY_VALUE_SQL, [[key]]);
  }

  public async loadUserTextFiles(groupKey: string): Promise<UserTextFileSummary[]> {
    const rows = await this.selectTypedMultiQuery(
      this.sql.SELECT_USER_TEXT_FILES_BY_GROUP_SQL,
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

  public async loadUserTextFileContent(groupKey: string, id: string): Promise<string | undefined> {
    const row = await this.selectTypedSingleRow(
      this.sql.SELECT_USER_TEXT_FILE_CONTENT_SQL,
      [groupKey, id],
      z.object({ file_content: z.string() })
    );
    return row?.file_content;
  }

  public async saveUserTextFile(file: {
    id: string;
    groupKey: string;
    fileName: string;
    fileContent: string;
  }): Promise<void> {
    await this.dbRun(this.sql.UPSERT_USER_TEXT_FILE_SQL, [
      [file.id, file.groupKey, file.fileName, file.fileContent],
    ]);
  }

  public async deleteUserTextFile(id: string): Promise<void> {
    await this.dbRun(this.sql.DELETE_USER_TEXT_FILE_SQL, [[id]]);
  }

  public async storeScenarioCharacterGroups(groups: ScenarioCharacterGroup[]) {
    if (groups.length === 0) return;
    await this.dbRun(this.sql.UPSERT_SCENARIO_CHARACTER_GROUP_SQL, [
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

  public async loadScenarioCharacterGroups(scenarioId: string) {
    return this.selectDataRows(
      this.sql.SELECT_SCENARIO_CHARACTER_GROUPS_SQL,
      [[scenarioId]],
      scenarioCharacterGroupSchema
    );
  }

  public async deleteScenarioCharacterGroup(id: string) {
    await this.dbRun(this.sql.DELETE_SCENARIO_CHARACTER_GROUP_SQL, [[id]]);
  }

  public async storeGroupSchedule(schedule: ScenarioCharacterGroupSchedule) {
    await this.dbRun(this.sql.UPSERT_GROUP_SCHEDULE_SQL, [
      [
        schedule.id,
        schedule.scenarioId,
        schedule.groupId,
        encodeStoredData(schedule, scenarioCharacterGroupScheduleSchema),
      ],
    ]);
  }

  public async loadGroupSchedules(scenarioId: string) {
    return this.selectDataRows(
      this.sql.SELECT_GROUP_SCHEDULES_SQL,
      [[scenarioId]],
      scenarioCharacterGroupScheduleSchema
    );
  }

  public async deleteGroupSchedule(id: string) {
    await this.dbRun(this.sql.DELETE_GROUP_SCHEDULE_SQL, [[id]]);
  }
}

// Two shared instances: main and import_staging
export const mainDatabase = new DatabaseClient('main');
export const importStagingDatabase = new DatabaseClient('import_staging');

// Backwards-compatible top-level function exports delegating to mainDatabase
export const loadScenarioSummaries = () => mainDatabase.loadScenarioSummaries();
export const storeCharacterRelationships = (relationships: CharacterRelationship[]) =>
  mainDatabase.storeCharacterRelationships(relationships);
export const storeCharacterRelationship = (relationship: CharacterRelationship) =>
  mainDatabase.storeCharacterRelationship(relationship);
export const loadCharacterRelationshipsByPairs = (pairs: CharacterPair[]) =>
  mainDatabase.loadCharacterRelationshipsByPairs(pairs);
export const loadWeightedGossipTargetCharacterId = (
  fromCharacterId: string,
  excludedToCharacterIds: string[],
  userCharacterId: string,
  userGossipChanceMultiplier: number,
  familiarityWeightMultiplier: number
) =>
  mainDatabase.loadWeightedGossipTargetCharacterId(
    fromCharacterId,
    excludedToCharacterIds,
    userCharacterId,
    userGossipChanceMultiplier,
    familiarityWeightMultiplier
  );
export const storeGlobalCharacters = (characters: Character[]) =>
  mainDatabase.storeGlobalCharacters(characters);
export const storeScenarioCharacters = (characters: Character[]) =>
  mainDatabase.storeScenarioCharacters(characters);
export const storeScenarioCharacter = (character: Character) =>
  mainDatabase.storeScenarioCharacter(character);
export const loadGlobalCharacters = () => mainDatabase.loadGlobalCharacters();
export const loadScenarioCharacters = (scenarioId: string) => mainDatabase.loadScenarioCharacters(scenarioId);
export const loadScenarioCharactersByIds = (ids: string[]) => mainDatabase.loadScenarioCharactersByIds(ids);
export const loadMaps = () => mainDatabase.loadMaps();
export const loadMap = (id: string) => mainDatabase.loadMap(id);
export const storeMaps = (maps: WorldMap[]) => mainDatabase.storeMaps(maps);
export const storeMap = (map: WorldMap) => mainDatabase.storeMap(map);
export const deleteMap = (id: string) => mainDatabase.deleteMap(id);
export const deleteGlobalCharacter = (id: string) => mainDatabase.deleteGlobalCharacter(id);
export const deleteScenarioCharacters = (characterIds: string[]) =>
  mainDatabase.deleteScenarioCharacters(characterIds);
export const deleteScenarioCharacter = (characterId: string) =>
  mainDatabase.deleteScenarioCharacter(characterId);
export const loadScenario = (scenarioId: string) => mainDatabase.loadScenario(scenarioId);
export const storeScenario = (scenario: Scenario) => mainDatabase.storeScenario(scenario);
export const loadConversationByParticipantsPage = (
  scenarioId: string,
  participantIds: string[],
  page: number,
  pageSize = 50
) => mainDatabase.loadConversationByParticipantsPage(scenarioId, participantIds, page, pageSize);
export const loadConversationById = (conversationId: string) =>
  mainDatabase.loadConversationById(conversationId);
export const storeConversation = (scenarioId: string, entry: StoredConversation) =>
  mainDatabase.storeConversation(scenarioId, entry);
export const storeScenarioEvent = (scenarioId: string, event: ScenarioEvent) =>
  mainDatabase.storeScenarioEvent(scenarioId, event);
export const loadScenarioEventPage = (scenarioId: string, page = 0, pageSize = 50) =>
  mainDatabase.loadScenarioEventPage(scenarioId, page, pageSize);
export const deleteScenarioDatabase = (scenarioId: string) => mainDatabase.deleteScenarioDatabase(scenarioId);
export const storeKeyValue = <TValue>(key: string, value: TValue, schema: z.ZodType<TValue>) =>
  mainDatabase.storeKeyValue(key, value, schema);
export const loadKeyValue = <TValue>(key: string, schema: z.ZodType<TValue>) =>
  mainDatabase.loadKeyValue(key, schema);
export const deleteKeyValue = (key: string) => mainDatabase.deleteKeyValue(key);
export const loadUserTextFiles = (groupKey: string) => mainDatabase.loadUserTextFiles(groupKey);
export const loadUserTextFileContent = (groupKey: string, id: string) =>
  mainDatabase.loadUserTextFileContent(groupKey, id);
export const saveUserTextFile = (file: {
  id: string;
  groupKey: string;
  fileName: string;
  fileContent: string;
}) => mainDatabase.saveUserTextFile(file);
export const deleteUserTextFile = (id: string) => mainDatabase.deleteUserTextFile(id);
export const storeScenarioCharacterGroups = (groups: ScenarioCharacterGroup[]) =>
  mainDatabase.storeScenarioCharacterGroups(groups);
export const loadScenarioCharacterGroups = (scenarioId: string) =>
  mainDatabase.loadScenarioCharacterGroups(scenarioId);
export const deleteScenarioCharacterGroup = (id: string) => mainDatabase.deleteScenarioCharacterGroup(id);
export const storeGroupSchedule = (schedule: ScenarioCharacterGroupSchedule) =>
  mainDatabase.storeGroupSchedule(schedule);
export const loadGroupSchedules = (scenarioId: string) => mainDatabase.loadGroupSchedules(scenarioId);
export const deleteGroupSchedule = (id: string) => mainDatabase.deleteGroupSchedule(id);

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
