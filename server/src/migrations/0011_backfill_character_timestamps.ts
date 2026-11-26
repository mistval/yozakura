import type { Migration } from '../types.js';

const BACKFILL_CHARACTER_TIMESTAMPS_SQL = `
  UPDATE character
  SET data = json_set(data, '$.createdAt', created_at)
  WHERE data ->> 'createdAt' = '';

  UPDATE scenario_character
  SET data = json_set(data, '$.createdAt', created_at)
  WHERE data ->> 'createdAt' = '';
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_CHARACTER_TIMESTAMPS_SQL);
  },
};
