import type Database from 'better-sqlite3';
import type { Migration } from '../types.js';

const DAILY_AUTOSELECT_PREFIX = 'daily_autoselect:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function migrateCharacterData(parsed: Record<string, unknown>): boolean {
  if (!Array.isArray(parsed.wardrobes)) {
    return false;
  }

  let changed = false;
  for (const wardrobe of parsed.wardrobes) {
    if (isRecord(wardrobe) && !Array.isArray(wardrobe.tags)) {
      const autoSelectGroup =
        typeof wardrobe.autoSelectGroup === 'string' ? wardrobe.autoSelectGroup.trim() : '';
      wardrobe.tags = autoSelectGroup.length > 0 ? [`${DAILY_AUTOSELECT_PREFIX}${autoSelectGroup}`] : [];
      changed = true;
    }
  }

  return changed;
}

function migrateTable(db: Database.Database, tableName: string): void {
  const selectStmt = db.prepare(`SELECT id, data FROM ${tableName}`);
  const updateStmt = db.prepare(`UPDATE ${tableName} SET data = ? WHERE id = ?`);

  const rows = selectStmt.all() as Array<{ id: string; data: string }>;
  for (const row of rows) {
    const parsed = JSON.parse(row.data);
    if (isRecord(parsed) && migrateCharacterData(parsed)) {
      updateStmt.run(JSON.stringify(parsed), row.id);
    }
  }
}

export const migration: Migration = {
  doMigration(db) {
    db.exec(`DELETE FROM key_value WHERE key LIKE 'scenario_%_turn';`);
    migrateTable(db, 'character');
    migrateTable(db, 'scenario_character');
  },
};
