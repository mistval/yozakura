import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * Opens (creating the file and parent directory if needed) the application
 * SQLite database and applies the connection-level pragmas that every part of
 * the server relies on.
 */
export function openDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'app.sqlite');
  const db = new Database(dbPath);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  return db;
}
