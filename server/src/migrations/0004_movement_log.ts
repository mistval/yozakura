import type { Migration } from '../types.js';

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS movement_log (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_movement_log_scenario ON movement_log(scenario_id);
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(CREATE_SQL);
  },
};
