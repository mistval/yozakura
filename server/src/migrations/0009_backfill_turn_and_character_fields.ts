import type { Migration } from '../types.js';

const BACKFILL_TURN_AND_CHARACTER_FIELDS_SQL = `
  UPDATE key_value
  SET data = json_set(data, '$.wardrobeAutoselectRan', json('true'))
  WHERE key LIKE 'scenario_%_turn'
    AND json_extract(data, '$.wardrobeAutoselectRan') IS NULL;

  UPDATE scenario
  SET data = json_set(data, '$.turnOffset', 0)
  WHERE json_extract(data, '$.turnOffset') IS NULL;

  UPDATE character
  SET data = json_set(data, '$.createdAt', created_at)
  WHERE data ->> 'createdAt' = '';

  UPDATE scenario_character
  SET data = json_set(data, '$.createdAt', created_at)
  WHERE data ->> 'createdAt' = '';
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_TURN_AND_CHARACTER_FIELDS_SQL);
  },
};
