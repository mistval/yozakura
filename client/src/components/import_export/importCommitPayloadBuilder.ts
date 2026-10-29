import { importStagingDatabase } from '../../backend_bridge/database.js';
import type { ImportCommitPayload, StagedImageEntry } from '../../backend_bridge/import_api.js';
import type { ConflictAction } from './importConflictResolver.js';

export type BuildCommitPayloadOptions = {
  sessionId: string;
  exportName: string;
  selectedScenarioIds: string[];
  selectedScenarioMemoriesIds: string[];
  selectedScenarioGroupsIds: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
  conflictResolutions: Record<string, ConflictAction>;
  stagedImages: StagedImageEntry[];
};

export async function prepareStagingAndBuildCommitPayload(
  options: BuildCommitPayloadOptions
): Promise<ImportCommitPayload> {
  const {
    sessionId,
    exportName,
    selectedScenarioIds,
    selectedScenarioMemoriesIds,
    selectedScenarioGroupsIds,
    selectedMapIds,
    selectedGlobalCharacterIds,
    conflictResolutions,
    stagedImages,
  } = options;

  // 1. Create import_staging._id_map table
  await importStagingDatabase.dbRun(
    'CREATE TABLE IF NOT EXISTS import_staging._id_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);'
  );
  await importStagingDatabase.dbRun('DELETE FROM import_staging._id_map;');

  // 2. Populate _id_map for scenario-scoped entities
  if (selectedScenarioIds.length > 0) {
    const scenJson = JSON.stringify(selectedScenarioIds);

    // Scenarios
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.scenario WHERE id IN (SELECT value FROM json_each(?));',
      [[scenJson]]
    );

    // Scenario characters
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.scenario_character WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[scenJson]]
    );

    // Conversations
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.conversation WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[scenJson]]
    );

    // Conversation participants
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.conversation_participant WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[scenJson]]
    );

    // Event logs
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.scenario_event_log WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[scenJson]]
    );
  }

  // Character relationships (for scenarios where memories are selected)
  if (selectedScenarioMemoriesIds.length > 0) {
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.character_relationship WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[JSON.stringify(selectedScenarioMemoriesIds)]]
    );
  }

  // Character groups and schedules (for scenarios where groups are selected)
  if (selectedScenarioGroupsIds.length > 0) {
    const groupsJson = JSON.stringify(selectedScenarioGroupsIds);
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.scenario_character_group WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[groupsJson]]
    );
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.scenario_character_group_schedule WHERE scenario_id IN (SELECT value FROM json_each(?));',
      [[groupsJson]]
    );
  }

  // 3. Populate _id_map for Global Entities where Make a Copy was chosen
  const copiedMapIds = selectedMapIds.filter((id) => conflictResolutions[id] === 'copy');
  if (copiedMapIds.length > 0) {
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.map WHERE id IN (SELECT value FROM json_each(?));',
      [[JSON.stringify(copiedMapIds)]]
    );

    // Append ' (Imported From <exportName>)' to copied maps
    const suffix = ` (Imported From ${exportName})`;
    await importStagingDatabase.dbRun(
      "UPDATE import_staging.map SET data = json_set(data, '$.name', json_extract(data, '$.name') || ?) WHERE id IN (SELECT value FROM json_each(?));",
      [[suffix], [JSON.stringify(copiedMapIds)]]
    );
  }

  const copiedGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] === 'copy');
  if (copiedGlobalCharIds.length > 0) {
    await importStagingDatabase.dbRun(
      'INSERT INTO import_staging._id_map (old_id, new_id) SELECT id, lower(hex(randomblob(9))) FROM import_staging.character WHERE id IN (SELECT value FROM json_each(?));',
      [[JSON.stringify(copiedGlobalCharIds)]]
    );
  }

  // 4. Update ?v= on overwritten global characters with portraits
  const overwrittenGlobalCharIds = selectedGlobalCharacterIds.filter(
    (id) => conflictResolutions[id] === 'overwrite'
  );
  if (overwrittenGlobalCharIds.length > 0) {
    const timestamp = Date.now().toString();
    await importStagingDatabase.dbRun(
      `UPDATE import_staging.character
       SET data = json_set(
         data,
         '$.imagePath',
         CASE
           WHEN instr(json_extract(data, '$.imagePath'), '?') > 0
           THEN substr(json_extract(data, '$.imagePath'), 1, instr(json_extract(data, '$.imagePath'), '?') - 1) || '?v=' || ?
           ELSE json_extract(data, '$.imagePath') || '?v=' || ?
         END
       )
       WHERE id IN (SELECT value FROM json_each(?))
         AND json_extract(data, '$.imagePath') LIKE '/api/files/%';`,
      [[timestamp], [timestamp], [JSON.stringify(overwrittenGlobalCharIds)]]
    );
  }

  // 5. Strip unchecked memories and groups from scenario_character data
  const scenariosWithoutMemories = selectedScenarioIds.filter(
    (id) => !selectedScenarioMemoriesIds.includes(id)
  );
  if (scenariosWithoutMemories.length > 0) {
    await importStagingDatabase.dbRun(
      `UPDATE import_staging.scenario_character
       SET data = json_set(
         json_set(
           json_set(data, '$.globalMemories', json('[]')),
           '$.rollingConversationSummaries', json('[]')
         ),
         '$.nextConversationWithCharacterId', json('null')
       )
       WHERE scenario_id IN (SELECT value FROM json_each(?));`,
      [[JSON.stringify(scenariosWithoutMemories)]]
    );
  }

  const scenariosWithoutGroups = selectedScenarioIds.filter((id) => !selectedScenarioGroupsIds.includes(id));
  if (scenariosWithoutGroups.length > 0) {
    await importStagingDatabase.dbRun(
      `UPDATE import_staging.scenario_character
       SET data = json_set(data, '$.groupIds', json('[]'))
       WHERE scenario_id IN (SELECT value FROM json_each(?));`,
      [[JSON.stringify(scenariosWithoutGroups)]]
    );
  }

  // 6. Generate ordered sqlStatements
  const sqlStatements: string[] = [];

  // Maps (skip any with 'skip' action)
  const activeMapIds = selectedMapIds.filter((id) => conflictResolutions[id] !== 'skip');
  if (activeMapIds.length > 0) {
    const activeMapJson = JSON.stringify(activeMapIds).replace(/'/g, "''");
    sqlStatements.push(
      `
      INSERT INTO main.map (id, created_at, updated_at, data)
      SELECT
        COALESCE(m.new_id, s.id),
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.map s
      LEFT JOIN import_staging._id_map m ON s.id = m.old_id
      WHERE s.id IN (SELECT value FROM json_each('${activeMapJson}'))
      ON CONFLICT(id) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        data = excluded.data;
    `.trim()
    );
  }

  // Global Characters (skip any with 'skip' action)
  const activeGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] !== 'skip');
  if (activeGlobalCharIds.length > 0) {
    const activeCharJson = JSON.stringify(activeGlobalCharIds).replace(/'/g, "''");
    sqlStatements.push(
      `
      INSERT INTO main.character (id, created_at, updated_at, data)
      SELECT
        COALESCE(m.new_id, s.id),
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.character s
      LEFT JOIN import_staging._id_map m ON s.id = m.old_id
      WHERE s.id IN (SELECT value FROM json_each('${activeCharJson}'))
      ON CONFLICT(id) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        data = excluded.data;
    `.trim()
    );
  }

  // Scenarios and child rows
  if (selectedScenarioIds.length > 0) {
    const scenJson = JSON.stringify(selectedScenarioIds).replace(/'/g, "''");

    // scenario
    sqlStatements.push(
      `
      INSERT INTO main.scenario (id, created_at, updated_at, data)
      SELECT
        m.new_id,
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.scenario s
      JOIN import_staging._id_map m ON s.id = m.old_id
      WHERE s.id IN (SELECT value FROM json_each('${scenJson}'));
    `.trim()
    );

    // scenario_character
    sqlStatements.push(
      `
      INSERT INTO main.scenario_character (id, scenario_id, created_at, updated_at, data)
      SELECT
        m.new_id,
        sm.new_id,
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.scenario_character s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${scenJson}'));
    `.trim()
    );
  }

  // character_relationship (for scenarios where memories are selected)
  if (selectedScenarioMemoriesIds.length > 0) {
    const memScenJson = JSON.stringify(selectedScenarioMemoriesIds).replace(/'/g, "''");
    sqlStatements.push(
      `
      INSERT INTO main.character_relationship (id, scenario_id, from_id, to_id, created_at, updated_at, data)
      SELECT
        m.new_id,
        sm.new_id,
        COALESCE(from_m.new_id, s.from_id),
        COALESCE(to_m.new_id, s.to_id),
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.character_relationship s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      LEFT JOIN import_staging._id_map from_m ON s.from_id = from_m.old_id
      LEFT JOIN import_staging._id_map to_m ON s.to_id = to_m.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${memScenJson}'));
    `.trim()
    );
  }

  // scenario_character_group & schedule (for scenarios where groups are selected)
  if (selectedScenarioGroupsIds.length > 0) {
    const grpScenJson = JSON.stringify(selectedScenarioGroupsIds).replace(/'/g, "''");
    sqlStatements.push(
      `
      INSERT INTO main.scenario_character_group (id, scenario_id, created_at, updated_at, data)
      SELECT
        m.new_id,
        sm.new_id,
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.scenario_character_group s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${grpScenJson}'));
    `.trim()
    );

    sqlStatements.push(
      `
      INSERT INTO main.scenario_character_group_schedule (id, scenario_id, group_id, created_at, updated_at, data)
      SELECT
        m.new_id,
        sm.new_id,
        gm.new_id,
        s.created_at,
        CURRENT_TIMESTAMP,
        apply_id_map(s.data)
      FROM import_staging.scenario_character_group_schedule s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      JOIN import_staging._id_map gm ON s.group_id = gm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${grpScenJson}'));
    `.trim()
    );
  }

  // Historical log tables (chronological rowid order preserved)
  if (selectedScenarioIds.length > 0) {
    const scenJson = JSON.stringify(selectedScenarioIds).replace(/'/g, "''");

    // conversation
    sqlStatements.push(
      `
      INSERT INTO main.conversation (id, scenario_id, created_at, updated_at, data)
      SELECT
        m.new_id,
        sm.new_id,
        s.created_at,
        s.updated_at,
        apply_id_map(s.data)
      FROM import_staging.conversation s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${scenJson}'))
      ORDER BY s.rowid ASC;
    `.trim()
    );

    // conversation_participant
    sqlStatements.push(
      `
      INSERT INTO main.conversation_participant (id, scenario_id, conversation_id, character_id, created_at, updated_at)
      SELECT
        m.new_id,
        sm.new_id,
        cm.new_id,
        COALESCE(char_m.new_id, s.character_id),
        s.created_at,
        s.updated_at
      FROM import_staging.conversation_participant s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      JOIN import_staging._id_map cm ON s.conversation_id = cm.old_id
      LEFT JOIN import_staging._id_map char_m ON s.character_id = char_m.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${scenJson}'))
      ORDER BY s.rowid ASC;
    `.trim()
    );

    // scenario_event_log
    sqlStatements.push(
      `
      INSERT INTO main.scenario_event_log (id, scenario_id, character_id, created_at, updated_at, data)
      SELECT
        m.new_id,
        sm.new_id,
        COALESCE(char_m.new_id, s.character_id),
        s.created_at,
        s.updated_at,
        apply_id_map(s.data)
      FROM import_staging.scenario_event_log s
      JOIN import_staging._id_map m ON s.id = m.old_id
      JOIN import_staging._id_map sm ON s.scenario_id = sm.old_id
      LEFT JOIN import_staging._id_map char_m ON s.character_id = char_m.old_id
      WHERE s.scenario_id IN (SELECT value FROM json_each('${scenJson}'))
      ORDER BY s.rowid ASC;
    `.trim()
    );
  }

  // 7. Filter imageCopies from stagedImages
  const imageCopies: Array<{ zipPath: string; targetRelPath: string }> = [];

  for (const entry of stagedImages) {
    if (entry.kind === 'global_character_card') {
      // Find character id from zipPath: "images/character_cards/<charId>.png"
      const match = /^images\/character_cards\/([^/]+)\.png$/.exec(entry.zipPath);
      const charId = match ? match[1] : '';
      if (!charId || !selectedGlobalCharacterIds.includes(charId)) {
        continue;
      }
      if (conflictResolutions[charId] === 'skip') {
        continue;
      }
      imageCopies.push({
        zipPath: entry.zipPath,
        targetRelPath: entry.zipPath.replace(/^images\//, ''),
      });
    } else if (entry.kind === 'scenario_character_card' || entry.kind === 'chat_image') {
      if (!selectedScenarioIds.includes(entry.scenarioId)) {
        continue;
      }
      imageCopies.push({
        zipPath: entry.zipPath,
        targetRelPath: entry.zipPath.replace(/^images\/scenarios\//, 'scenario/'),
      });
    }
  }

  return {
    sessionId,
    sqlStatements,
    imageCopies,
  };
}
