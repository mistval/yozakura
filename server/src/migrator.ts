import type Database from 'better-sqlite3';
import { migration as migration0000InitialSchema } from './migrations/0000_initial_schema.js';
import { migration as migration0001ImageSettingsScripts } from './migrations/0001_image_settings_scripts.js';
import { migration as migration0002UserTextFiles } from './migrations/0002_user_text_files.js';
import { migration as migration0003GroupsZonesSchedulesTemporal } from './migrations/0003_groups_zones_schedules_temporal.js';
import type { Migration } from './types.js';

/**
 * The ordered, append-only list of migrations. The array index of a migration
 * is its version: a database at `PRAGMA user_version = N` still needs the
 * migration at index `N` applied, after which `user_version` becomes `N + 1`.
 *
 * Never reorder or remove entries; only append new migrations to the end.
 */
const migrations: Migration[] = [
  migration0000InitialSchema,
  migration0001ImageSettingsScripts,
  migration0002UserTextFiles,
  migration0003GroupsZonesSchedulesTemporal,
];

function getUserVersion(db: Database.Database): number {
  return Number(db.pragma('user_version', { simple: true }));
}

export function runMigrations(db: Database.Database): void {
  while (true) {
    const version = getUserVersion(db);
    const migration = migrations[version];

    if (!migration) {
      return;
    }

    const applyMigration = db.transaction(() => {
      const versionInTransaction = getUserVersion(db);
      if (versionInTransaction !== version) {
        throw new Error(
          `user_version changed from ${version} to ${versionInTransaction} before the migration could run`
        );
      }

      migration.doMigration(db);
      db.pragma(`user_version = ${version + 1}`);
    });

    try {
      applyMigration.immediate();
    } catch (error) {
      throw new Error(`Migration ${version} failed: ${(error as Error).message}`, { cause: error });
    }
  }
}
