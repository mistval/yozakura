import type { Migration } from '../types.js';

const BACKFILL_SCENARIO_DEFAULTS_SQL = `
  UPDATE scenario
  SET data = json_set(data, '$.remoteChatMedium', 'text messaging')
  WHERE json_extract(data, '$.remoteChatMedium') IS NULL;

  UPDATE scenario
  SET data = json_set(data, '$.saveName', '')
  WHERE json_extract(data, '$.saveName') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_SCENARIO_DEFAULTS_SQL);
  },
};
