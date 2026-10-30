import { z } from 'zod';
import { importStagingDatabase, DatabaseClient } from '../../backend_bridge/database.js';
import * as Files from '../../backend_bridge/files.js';
import type {
  ImportCommitPayload,
  SqlStatementEntry,
  StagedImageEntry,
} from '../../backend_bridge/import_api.js';
import type { Character } from '../../engine/types.js';
import type { ConflictAction } from './importConflictResolver.js';
import {
  SQL_UTC_NOW,
  TABLE_COLUMNS,
  STRIP_MEMORIES_PATCH,
  STRIP_GROUPS_PATCH,
} from './importExportCommon.js';

export type BuildCommitPayloadOptions = {
  sessionId: string;
  exportName: string;
  selectedScenarioIds: string[];
  selectedScenarioCharactersIds?: string[];
  selectedScenarioGroupsIds: string[];
  selectedScenarioSchedulesIds?: string[];
  selectedScenarioMemoriesIds: string[];
  selectedScenarioConversationsIds?: string[];
  selectedScenarioTurnIds?: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
  conflictResolutions: Record<string, ConflictAction>;
  stagedImages: StagedImageEntry[];
  stagedGlobalCharacters?: Character[];
  stagingDb?: DatabaseClient;
};

export async function prepareStagingAndBuildCommitPayload(
  options: BuildCommitPayloadOptions
): Promise<ImportCommitPayload> {
  const {
    sessionId,
    exportName,
    selectedScenarioIds,
    selectedScenarioCharactersIds = selectedScenarioIds,
    selectedScenarioGroupsIds,
    selectedScenarioSchedulesIds = selectedScenarioGroupsIds,
    selectedScenarioMemoriesIds,
    selectedScenarioConversationsIds = selectedScenarioIds,
    selectedScenarioTurnIds = selectedScenarioIds,
    selectedMapIds,
    selectedGlobalCharacterIds,
    conflictResolutions,
    stagedImages,
    stagedGlobalCharacters,
    stagingDb,
  } = options;

  const effectiveMemoriesScenIds = selectedScenarioMemoriesIds.filter((id) =>
    selectedScenarioCharactersIds.includes(id)
  );
  const effectiveTurnScenIds = selectedScenarioTurnIds.filter((id) =>
    selectedScenarioCharactersIds.includes(id)
  );
  const effectiveSchedulesScenIds = selectedScenarioSchedulesIds.filter((id) =>
    selectedScenarioGroupsIds.includes(id)
  );

  const db = stagingDb ?? importStagingDatabase;
  const globalCharacters = stagedGlobalCharacters ?? (await db.loadGlobalCharacters());

  // 1. Create import_staging._id_map table
  await db.dbRun(`
    CREATE TABLE IF NOT EXISTS import_staging._id_map (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL
    );
  `);
  await db.dbRun('DELETE FROM import_staging._id_map;');

  // 2. Populate _id_map for scenario-scoped entities
  if (selectedScenarioIds.length > 0) {
    const scenJson = JSON.stringify(selectedScenarioIds);

    // Scenarios
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.scenario
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[scenJson]]
    );
  }

  // Scenario characters
  if (selectedScenarioCharactersIds.length > 0) {
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(selectedScenarioCharactersIds)]]
    );
  }

  // Conversations & participants
  if (selectedScenarioConversationsIds.length > 0) {
    const convScenJson = JSON.stringify(selectedScenarioConversationsIds);
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.conversation
        WHERE scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[convScenJson]]
    );

    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT cp.id, lower(hex(randomblob(9)))
        FROM import_staging.conversation_participant cp
        JOIN import_staging.conversation c ON cp.conversation_id = c.id
        WHERE c.scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[convScenJson]]
    );
  }

  // Character relationships (for scenarios where memories and characters are selected)
  if (effectiveMemoriesScenIds.length > 0) {
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT cr.id, lower(hex(randomblob(9)))
        FROM import_staging.character_relationship cr
        JOIN import_staging.scenario_character sc ON cr.from_id = sc.id
        WHERE sc.scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(effectiveMemoriesScenIds)]]
    );
  }

  // Character groups
  if (selectedScenarioGroupsIds.length > 0) {
    const groupsJson = JSON.stringify(selectedScenarioGroupsIds);
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.scenario_character_group
        WHERE scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[groupsJson]]
    );
  }

  // Group schedules (for scenarios where groups and schedules are selected)
  if (effectiveSchedulesScenIds.length > 0) {
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.scenario_character_group_schedule
        WHERE scenario_id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(effectiveSchedulesScenIds)]]
    );
  }

  // 3. Populate _id_map for Global Entities where Make a Copy was chosen
  const copiedMapIds = selectedMapIds.filter((id) => conflictResolutions[id] === 'copy');
  if (copiedMapIds.length > 0) {
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
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

  const copiedGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] === 'copy');
  const copiedCharIdToNewId = new Map<string, string>();
  if (copiedGlobalCharIds.length > 0) {
    await db.dbRun(
      `
        INSERT INTO import_staging._id_map (old_id, new_id)
        SELECT id, lower(hex(randomblob(9)))
        FROM import_staging.character
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[JSON.stringify(copiedGlobalCharIds)]]
    );

    const renameSuffix = ` (Imported From ${exportName})`;
    await db.dbRun(
      `
        UPDATE import_staging.character
        SET data = json_set(
          json_set(data, '$.firstName', json_extract(data, '$.firstName') || ?),
          '$.imagePath',
          CASE
            WHEN json_extract(data, '$.imagePath') LIKE '/api/files/character_cards/%'
            THEN '/api/files/character_cards/' || (SELECT new_id FROM import_staging._id_map WHERE old_id = character.id) || '.png'
            ELSE json_extract(data, '$.imagePath')
          END
        )
        WHERE id IN (SELECT value FROM json_each(?));
      `.trim(),
      [[renameSuffix, JSON.stringify(copiedGlobalCharIds)]]
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

  // 5. Generate ordered sqlStatements
  const sqlStatements: SqlStatementEntry[] = [];

  // Maps (skip any with 'skip' action)
  const activeMapIds = selectedMapIds.filter((id) => conflictResolutions[id] !== 'skip');
  if (activeMapIds.length > 0) {
    sqlStatements.push({
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
    });
  }

  // Global Characters (skip any with 'skip' action)
  const activeGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] !== 'skip');
  if (activeGlobalCharIds.length > 0) {
    sqlStatements.push({
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
    });
  }

  // Scenarios and child rows
  if (selectedScenarioIds.length > 0) {
    const scenJson = JSON.stringify(selectedScenarioIds);

    // scenario (if scenario characters are omitted, reset userCharacterId to empty)
    sqlStatements.push({
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
      params: [JSON.stringify(selectedScenarioCharactersIds), scenJson],
    });

    // scenario_character
    if (selectedScenarioCharactersIds.length > 0) {
      sqlStatements.push({
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
      });
    }
  }

  // character_relationship (for scenarios where memories and characters are selected)
  if (effectiveMemoriesScenIds.length > 0) {
    const memScenJson = JSON.stringify(effectiveMemoriesScenIds);
    sqlStatements.push({
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
      params: [memScenJson],
    });
  }

  // scenario_character_group (for scenarios where groups are selected)
  if (selectedScenarioGroupsIds.length > 0) {
    const grpScenJson = JSON.stringify(selectedScenarioGroupsIds);
    sqlStatements.push({
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
      params: [grpScenJson],
    });
  }

  // scenario_character_group_schedule (for scenarios where groups and schedules are selected)
  if (effectiveSchedulesScenIds.length > 0) {
    const schedScenJson = JSON.stringify(effectiveSchedulesScenIds);
    sqlStatements.push({
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
      params: [schedScenJson],
    });
  }

  // Historical conversation logs
  if (selectedScenarioConversationsIds.length > 0) {
    const convScenJson = JSON.stringify(selectedScenarioConversationsIds);

    // conversation
    sqlStatements.push({
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
    });

    // conversation_participant
    sqlStatements.push({
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
    });
  }

  // scenario turn state in key_value (for scenarios where characters and turn are selected)
  if (effectiveTurnScenIds.length > 0) {
    const turnScenJson = JSON.stringify(effectiveTurnScenIds);
    sqlStatements.push({
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
      params: [turnScenJson],
    });
  }

  // 6. Filter imageCopies from stagedImages using character objects as source of truth
  const zipPathToGlobalChar = new Map<string, Character>();
  for (const char of globalCharacters) {
    const zipPath = Files.getCharacterZipImagePath(char);
    if (zipPath) {
      zipPathToGlobalChar.set(zipPath, char);
    }
  }

  const imageCopies: Array<{ zipPath: string; targetRelPath: string }> = [];

  for (const entry of stagedImages) {
    if (entry.kind === 'global_character_card') {
      const char = zipPathToGlobalChar.get(entry.zipPath);
      if (!char || !selectedGlobalCharacterIds.includes(char.id)) {
        continue;
      }
      if (conflictResolutions[char.id] === 'skip') {
        continue;
      }

      let targetRelPath = entry.zipPath;
      if (conflictResolutions[char.id] === 'copy') {
        const newId = copiedCharIdToNewId.get(char.id);
        if (newId) {
          targetRelPath = `character_cards/${newId}.png`;
        }
      }

      imageCopies.push({
        zipPath: entry.zipPath,
        targetRelPath,
      });
    } else if (entry.kind === 'scenario_character_card') {
      if (!selectedScenarioCharactersIds.includes(entry.scenarioId)) {
        continue;
      }
      imageCopies.push({
        zipPath: entry.zipPath,
        targetRelPath: entry.zipPath,
      });
    } else if (entry.kind === 'chat_image') {
      if (!selectedScenarioConversationsIds.includes(entry.scenarioId)) {
        continue;
      }
      imageCopies.push({
        zipPath: entry.zipPath,
        targetRelPath: entry.zipPath,
      });
    }
  }

  return {
    sessionId,
    sqlStatements,
    imageCopies,
  };
}
