import type { Migration } from '../types.js';

const BACKFILL_TURN_WARDROBE_AUTOSELECT_SQL = `
  UPDATE key_value
  SET data = json_set(data, '$.wardrobeAutoselectRan', json('true'))
  WHERE key LIKE 'scenario_%_turn'
    AND json_extract(data, '$.wardrobeAutoselectRan') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_TURN_WARDROBE_AUTOSELECT_SQL);
  },
};
