import type { Migration } from '../types.js';

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

  CREATE TABLE IF NOT EXISTS map_zone (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    scenario_id TEXT,
    parent_zone_id TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z'))
  );

  CREATE INDEX IF NOT EXISTS idx_map_zone_map ON map_zone(map_id);
  CREATE INDEX IF NOT EXISTS idx_map_zone_scenario ON map_zone(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_map_zone_parent ON map_zone(parent_zone_id);

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

  CREATE TRIGGER IF NOT EXISTS trg_map_zone_cleanup_on_map_delete
  AFTER DELETE ON map BEGIN
    DELETE FROM map_zone WHERE map_id = OLD.id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_map_zone_cleanup_on_scenario_delete
  AFTER DELETE ON scenario BEGIN
    DELETE FROM map_zone WHERE scenario_id = OLD.id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_map_zone_cleanup_children
  AFTER DELETE ON map_zone BEGIN
    DELETE FROM map_zone WHERE parent_zone_id = OLD.id;
  END;
`;

const BACKFILL_SQL = `
  UPDATE character SET data = json_set(data, '$.groupIds', json('[]'))
    WHERE json_extract(data, '$.groupIds') IS NULL;
  UPDATE scenario_character SET data = json_set(data, '$.groupIds', json('[]'))
    WHERE json_extract(data, '$.groupIds') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(CREATE_SQL);
    db.exec(BACKFILL_SQL);
  },
};
