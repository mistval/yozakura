import type { Migration } from '../types.js';

const BACKFILL_SCENARIO_TURN_OFFSET_SQL = `
  UPDATE scenario
  SET data = json_set(data, '$.turnOffset', 0)
  WHERE json_extract(data, '$.turnOffset') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_SCENARIO_TURN_OFFSET_SQL);
  },
};
