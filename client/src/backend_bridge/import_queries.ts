import { z } from 'zod';
import type { DatabaseClient } from './database.js';
import type { SqlStatementEntry } from './import_api.js';
import { TABLE_COLUMNS, SQL_UTC_NOW, STRIP_MEMORIES_PATCH, STRIP_GROUPS_PATCH } from './export_queries.js';

export const SCENARIO_SCOPED_TABLES = [
  'scenario',
  'scenario_character',
  'character_relationship',
  'scenario_character_group',
  'scenario_character_group_schedule',
  'conversation',
  'conversation_participant',
] as const;

export type PrepareImportStagingParams = {
  db: DatabaseClient;
  exportName: string;
  selectedScenarioIds: string[];
  selectedScenarioMemoriesIds: string[];
  selectedScenarioGroupsIds: string[];
  copiedMapIds: string[];
  copiedGlobalCharIds: string[];
};

export async function prepareImportStaging(params: PrepareImportStagingParams): Promise<Map<string, string>> {
  const {
    db,
    exportName,
    selectedScenarioIds,
    selectedScenarioMemoriesIds,
    selectedScenarioGroupsIds,
    copiedMapIds,
    copiedGlobalCharIds,
  } = params;

  // 1. Create import_staging._id_map table
  await db.dbRun(`
    CREATE TABLE IF NOT EXISTS import_staging._id_map (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL
    );
  `);
  await db.dbRun('DELETE FROM import_staging._id_map;');

  // 2. Populate _id_map unconditionally for all scenario-scoped entities in staging
  for (const table of SCENARIO_SCOPED_TABLES) {
    await db.dbRun(`
      INSERT OR IGNORE INTO import_staging._id_map (old_id, new_id)
      SELECT id, lower(hex(randomblob(9)))
      FROM import_staging.${table};
    `);
  }

  // 3. Populate _id_map for Global Entities where Make a Copy was chosen
  if (copiedMapIds.length > 0) {
    await db.dbRun(
      `
        INSERT OR IGNORE INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.map
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(copiedMapIds)]]
    );

    // Append ' (Imported From <exportName>)' to copied maps
    const suffix = ` (Imported From ${exportName})`;
    await db.dbRun(
      `
        UPDATE import_staging.map
        SET data = json_set(data, '$.name', json_extract(data, '$.name') || ?)
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[suffix, JSON.stringify(copiedMapIds)]]
    );
  }

  const copiedCharIdToNewId = new Map<string, string>();
  if (copiedGlobalCharIds.length > 0) {
    await db.dbRun(
      `
        INSERT OR IGNORE INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.character
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(copiedGlobalCharIds)]]
    );

    await db.dbRun(
      `
        UPDATE import_staging.character
        SET data = json_set(
          data,
          '$.imagePath',
          CASE
            WHEN json_extract(data, '$.imagePath') LIKE '/api/files/character_cards/%'
            THEN '/api/files/character_cards/' || (SELECT new_id FROM import_staging._id_map WHERE old_id = character.id) || '.png'
            ELSE json_extract(data, '$.imagePath')
          END
        )
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(copiedGlobalCharIds)]]
    );

    const idMapRows = await db.dbAll<{ old_id: string; new_id: string }>(
      `SELECT old_id, new_id FROM import_staging._id_map WHERE old_id IN (SELECT value FROM json_each(?))`.trim(),
      [[JSON.stringify(copiedGlobalCharIds)]],
      z.object({ old_id: z.string(), new_id: z.string() })
    );
    for (const r of idMapRows) {
      copiedCharIdToNewId.set(r.old_id, r.new_id);
    }
  }

  // 4. Strip unchecked memories and groups from scenario_character data
  const scenariosWithoutMemories = selectedScenarioIds.filter(
    (id) => !selectedScenarioMemoriesIds.includes(id)
  );
  if (scenariosWithoutMemories.length > 0) {
    await db.dbRun(
      `
        UPDATE import_staging.scenario_character
        SET data = json_patch(data, '${STRIP_MEMORIES_PATCH}')
        WHERE scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(scenariosWithoutMemories)]]
    );
  }

  const scenariosWithoutGroups = selectedScenarioIds.filter((id) => !selectedScenarioGroupsIds.includes(id));
  if (scenariosWithoutGroups.length > 0) {
    await db.dbRun(
      `
        UPDATE import_staging.scenario_character
        SET data = json_patch(data, '${STRIP_GROUPS_PATCH}')
        WHERE scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(scenariosWithoutGroups)]]
    );
  }

  return copiedCharIdToNewId;
}

export type BuildImportCommitStatementsParams = {
  activeMapIds: string[];
  activeGlobalCharIds: string[];
  selectedScenarioIds: string[];
  selectedScenarioCharactersIds: string[];
  effectiveMemoriesScenIds: string[];
  selectedScenarioGroupsIds: string[];
  effectiveSchedulesScenIds: string[];
  selectedScenarioConversationsIds: string[];
  effectiveTurnScenIds: string[];
};

export function buildMapCommitStatement(activeMapIds: string[]): SqlStatementEntry | undefined {
  if (activeMapIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.map (${TABLE_COLUMNS.map.join(', ')})
      SELECT
        COALESCE(m.new_id, s.id),
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.map s
      LEFT JOIN import_staging._id_map m ON s.id = m.old_id
      WHERE s.id IN (SELECT value FROM json_each(?))
      ON CONFLICT(id) DO UPDATE SET
        updated_at = ${SQL_UTC_NOW},
        data = excluded.data;
    `.trim(),
    params: [JSON.stringify(activeMapIds)],
  };
}

export function buildGlobalCharacterCommitStatement(
  activeGlobalCharIds: string[]
): SqlStatementEntry | undefined {
  if (activeGlobalCharIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.character (${TABLE_COLUMNS.character.join(', ')})
      SELECT
        COALESCE(m.new_id, s.id),
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.character s
      LEFT JOIN import_staging._id_map m ON s.id = m.old_id
      WHERE s.id IN (SELECT value FROM json_each(?))
      ON CONFLICT(id) DO UPDATE SET
        updated_at = ${SQL_UTC_NOW},
        data = excluded.data;
    `.trim(),
    params: [JSON.stringify(activeGlobalCharIds)],
  };
}

export function buildScenarioCommitStatement(
  selectedScenarioIds: string[],
  selectedScenarioCharactersIds: string[]
): SqlStatementEntry | undefined {
  if (selectedScenarioIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.scenario (${TABLE_COLUMNS.scenario.join(', ')})
      SELECT
        m.new_id,
        s.created_at,
        ${SQL_UTC_NOW},
        CASE
          WHEN s.id IN (SELECT value FROM json_each(?)) THEN apply_id_map(s.data)
          ELSE json_set(apply_id_map(s.data), '$.userCharacterId', '')
        END
      FROM import_staging.scenario s
      JOIN import_staging._id_map m ON s.id = m.old_id
      WHERE s.id IN (SELECT value FROM json_each(?));
    `.trim(),
    params: [JSON.stringify(selectedScenarioCharactersIds), JSON.stringify(selectedScenarioIds)],
  };
}

export function buildScenarioCharacterCommitStatement(
  selectedScenarioCharactersIds: string[]
): SqlStatementEntry | undefined {
  if (selectedScenarioCharactersIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.scenario_character (${TABLE_COLUMNS.scenario_character.join(', ')})
      SELECT
        m.new_id,
        sm.new_id,
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.scenario_character s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each(?));
    `.trim(),
    params: [JSON.stringify(selectedScenarioCharactersIds)],
  };
}

export function buildCharacterRelationshipCommitStatement(
  effectiveMemoriesScenIds: string[]
): SqlStatementEntry | undefined {
  if (effectiveMemoriesScenIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.character_relationship (${TABLE_COLUMNS.character_relationship.join(', ')})
      SELECT
        m.new_id,
        COALESCE(from_m.new_id, s.from_id),
        COALESCE(to_m.new_id, s.to_id),
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.character_relationship s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging.scenario_character sc ON s.from_id = sc.id
      LEFT JOIN import_staging._id_map from_m ON s.from_id = from_m.old_id
      LEFT JOIN import_staging._id_map to_m ON s.to_id = to_m.old_id
      WHERE sc.scenario_id IN (SELECT value FROM json_each(?));
    `.trim(),
    params: [JSON.stringify(effectiveMemoriesScenIds)],
  };
}

export function buildScenarioGroupCommitStatement(
  selectedScenarioGroupsIds: string[]
): SqlStatementEntry | undefined {
  if (selectedScenarioGroupsIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.scenario_character_group (${TABLE_COLUMNS.scenario_character_group.join(', ')})
      SELECT
        m.new_id,
        sm.new_id,
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.scenario_character_group s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each(?));
    `.trim(),
    params: [JSON.stringify(selectedScenarioGroupsIds)],
  };
}

export function buildScenarioGroupScheduleCommitStatement(
  effectiveSchedulesScenIds: string[]
): SqlStatementEntry | undefined {
  if (effectiveSchedulesScenIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.scenario_character_group_schedule (${TABLE_COLUMNS.scenario_character_group_schedule.join(', ')})
      SELECT
        m.new_id,
        sm.new_id,
        gm.new_id,
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.scenario_character_group_schedule s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      JOIN import_staging._id_map gm ON s.group_id = gm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each(?));
    `.trim(),
    params: [JSON.stringify(effectiveSchedulesScenIds)],
  };
}

export function buildConversationCommitStatements(
  selectedScenarioConversationsIds: string[]
): SqlStatementEntry[] {
  if (selectedScenarioConversationsIds.length === 0) return [];
  const convScenJson = JSON.stringify(selectedScenarioConversationsIds);
  return [
    {
      statement: `
        INSERT INTO main.conversation (${TABLE_COLUMNS.conversation.join(', ')})
        SELECT
          m.new_id,
          sm.new_id,
          s.created_at,
          s.updated_at,
          apply_id_map(s.data)
        FROM import_staging.conversation s
        JOIN import_staging._id_map m ON s.id = m.old_id
        JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
        WHERE s.scenario_id IN (SELECT value FROM json_each(?))
        ORDER BY s.rowid ASC;
      `.trim(),
      params: [convScenJson],
    },
    {
      statement: `
        INSERT INTO main.conversation_participant (${TABLE_COLUMNS.conversation_participant.join(', ')})
        SELECT
          m.new_id,
          cm.new_id,
          COALESCE(char_m.new_id, s.character_id),
          s.created_at,
          s.updated_at
        FROM import_staging.conversation_participant s
        JOIN import_staging._id_map m ON s.id = m.old_id
        JOIN import_staging._id_map cm ON s.conversation_id = cm.old_id
        JOIN import_staging.conversation c ON s.conversation_id = c.id
        LEFT JOIN import_staging._id_map char_m ON s.character_id = char_m.old_id
        WHERE c.scenario_id IN (SELECT value FROM json_each(?))
        ORDER BY s.rowid ASC;
      `.trim(),
      params: [convScenJson],
    },
  ];
}

export function buildTurnKeyValueCommitStatement(
  effectiveTurnScenIds: string[]
): SqlStatementEntry | undefined {
  if (effectiveTurnScenIds.length === 0) return undefined;
  return {
    statement: `
      INSERT INTO main.key_value (${TABLE_COLUMNS.key_value.join(', ')})
      SELECT
        'scenario_' || sm.new_id || '_turn',
        s.created_at,
        ${SQL_UTC_NOW},
        apply_id_map(s.data)
      FROM import_staging.key_value s
      JOIN import_staging._id_map sm ON s.key = 'scenario_' || sm.old_id || '_turn'
      WHERE sm.old_id IN (SELECT value FROM json_each(?))
      ON CONFLICT(key) DO UPDATE SET
        data = excluded.data,
        updated_at = ${SQL_UTC_NOW};
    `.trim(),
    params: [JSON.stringify(effectiveTurnScenIds)],
  };
}

export function buildImportCommitStatements(params: BuildImportCommitStatementsParams): SqlStatementEntry[] {
  const sqlStatements: SqlStatementEntry[] = [];

  const mapStmt = buildMapCommitStatement(params.activeMapIds);
  if (mapStmt) sqlStatements.push(mapStmt);

  const charStmt = buildGlobalCharacterCommitStatement(params.activeGlobalCharIds);
  if (charStmt) sqlStatements.push(charStmt);

  if (params.selectedScenarioIds.length > 0) {
    const scenStmt = buildScenarioCommitStatement(
      params.selectedScenarioIds,
      params.selectedScenarioCharactersIds
    );
    if (scenStmt) sqlStatements.push(scenStmt);

    const scenCharStmt = buildScenarioCharacterCommitStatement(params.selectedScenarioCharactersIds);
    if (scenCharStmt) sqlStatements.push(scenCharStmt);
  }

  const relStmt = buildCharacterRelationshipCommitStatement(params.effectiveMemoriesScenIds);
  if (relStmt) sqlStatements.push(relStmt);

  const grpStmt = buildScenarioGroupCommitStatement(params.selectedScenarioGroupsIds);
  if (grpStmt) sqlStatements.push(grpStmt);

  const schedStmt = buildScenarioGroupScheduleCommitStatement(params.effectiveSchedulesScenIds);
  if (schedStmt) sqlStatements.push(schedStmt);

  sqlStatements.push(...buildConversationCommitStatements(params.selectedScenarioConversationsIds));

  const turnStmt = buildTurnKeyValueCommitStatement(params.effectiveTurnScenIds);
  if (turnStmt) sqlStatements.push(turnStmt);

  return sqlStatements;
}
