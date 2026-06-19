import type { Migration } from '../types.js';

// The active chat is now persisted together with the turn state under a different key. Old
// standalone active-chat rows are incompatible and not worth migrating, so drop them.
const DELETE_ACTIVE_CHAT_KEYS_SQL = `
  DELETE FROM key_value
  WHERE key LIKE 'scenario_%_active_chat';
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(DELETE_ACTIVE_CHAT_KEYS_SQL);
  },
};
