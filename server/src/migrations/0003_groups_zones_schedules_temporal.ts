import type { Migration } from '../types.js';

/**
 * Combined migration (dev-branch squash of former 0003, 0004, and 0005):
 *
 * 1. Delete stale `scenario_*_active_chat` key_value entries.
 * 2. Create tables/indexes/triggers for character groups, map zones, and
 *    group schedules; backfill `groupIds` defaults on character and
 *    scenario_character blobs.
 * 3. Backfill per-scenario temporal context configuration onto existing
 *    scenario blobs.
 *
 * Every statement is idempotent (IF NOT EXISTS / guarded UPDATEs / DELETE),
 * so re-running this migration on a database that already had the individual
 * migrations applied is safe.
 */

const DELETE_ACTIVE_CHAT_KEYS_SQL = `
  DELETE FROM key_value
  WHERE key LIKE 'scenario_%_active_chat';
`;

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS scenario_character_group (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scenario_character_group_scenario
    ON scenario_character_group(scenario_id);

  CREATE TABLE IF NOT EXISTS scenario_character_group_schedule (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    group_id TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES scenario_character_group(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scenario_event_log (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scenario_event_log_scenario ON scenario_event_log(scenario_id);
`;

const BACKFILL_GROUP_IDS_SQL = `
  UPDATE character SET data = json_set(data, '$.groupIds', json('[]'))
    WHERE json_extract(data, '$.groupIds') IS NULL;
  UPDATE scenario_character SET data = json_set(data, '$.groupIds', json('[]'))
    WHERE json_extract(data, '$.groupIds') IS NULL;
`;

const BACKFILL_TEMPORAL_CONTEXT_SQL = `
  UPDATE scenario
  SET data = json_set(
    data,
    '$.temporalContext',
    json_object(
      'selectedScriptId', 'new-york',
      'controlValues', json_object(
        'new-york', json_object('startDate', substr(created_at, 1, 10))
      )
    )
  )
  WHERE json_extract(data, '$.temporalContext') IS NULL;
`;

const BACKFILL_MAP_ZONES_SQL = `
  UPDATE map SET data = json_set(data, '$.zones', json('[]'))
    WHERE json_extract(data, '$.zones') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(DELETE_ACTIVE_CHAT_KEYS_SQL);
    db.exec(CREATE_SQL);
    db.exec(BACKFILL_GROUP_IDS_SQL);
    db.exec(BACKFILL_TEMPORAL_CONTEXT_SQL);
    db.exec(BACKFILL_MAP_ZONES_SQL);
  },
};
