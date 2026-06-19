import type { Migration } from '../types.js';

const DELETE_ACTIVE_CHAT_KEYS_SQL = `
  DELETE FROM key_value
  WHERE key LIKE 'scenario_%_active_chat';
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(DELETE_ACTIVE_CHAT_KEYS_SQL);
  },
};
