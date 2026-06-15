import type Database from 'better-sqlite3';

export type Migration = {
  /**
   * Applies a single forward migration. Runs inside a transaction that also
   * bumps `PRAGMA user_version`, so an implementation should only perform the
   * schema/data changes and let the migrator handle versioning and commits.
   *
   * Must be synchronous: better-sqlite3 transactions cannot span awaits.
   */
  doMigration: (db: Database.Database) => void;
};
