import type { Migration } from '../types.js';

const BACKFILL_REMOTE_CHAT_MEDIUM_SQL = `
  UPDATE scenario
  SET data = json_set(data, '$.remoteChatMedium', 'text messaging')
  WHERE json_extract(data, '$.remoteChatMedium') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_REMOTE_CHAT_MEDIUM_SQL);
  },
};
