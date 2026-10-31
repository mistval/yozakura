import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import { guardPathWithinBase } from './pathGuard.js';
import { runMigrations } from '../migrator.js';
import { clearPreparedStatementCache } from './db.js';
import { applyIdMap } from '../id_map.js';

export type ManifestData = {
  exportName: string;
  dbUserVersion: number;
};

export type ImageManifestEntry =
  | {
      zipPath: string;
      kind: 'global_character_card';
    }
  | {
      zipPath: string;
      kind: 'scenario_character_card' | 'chat_image';
      scenarioId: string;
    };

function extractZip(zipPath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        return reject(err ?? new Error('Failed to open zip file'));
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        let destPath: string;
        try {
          destPath = guardPathWithinBase(targetDir, entry.fileName);
        } catch (guardErr) {
          zipfile.close();
          return reject(guardErr);
        }

        if (/\/$/.test(entry.fileName)) {
          // Directory entry
          fs.mkdirSync(destPath, { recursive: true });
          zipfile.readEntry();
        } else {
          // File entry
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr || !readStream) {
              zipfile.close();
              return reject(streamErr ?? new Error(`Failed to read zip entry: ${entry.fileName}`));
            }

            const writeStream = fs.createWriteStream(destPath);
            readStream.pipe(writeStream);

            writeStream.on('finish', () => {
              zipfile.readEntry();
            });

            writeStream.on('error', (writeErr) => {
              zipfile.close();
              reject(writeErr);
            });
            readStream.on('error', (readErr) => {
              zipfile.close();
              reject(readErr);
            });
          });
        }
      });

      zipfile.on('end', () => resolve());
      zipfile.on('error', (zipErr) => reject(zipErr));
    });
  });
}

export function detachImportStagingIfAttached(db: Database.Database, stagingDir?: string): void {
  const attached = db.pragma('database_list') as { seq: number; name: string; file: string }[];
  if (attached.some((d) => d.name === 'import_staging')) {
    clearPreparedStatementCache();
    db.exec('DETACH DATABASE import_staging');
  }

  if (stagingDir && fs.existsSync(stagingDir)) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Failed to clean up staging directory:', stagingDir, cleanupErr);
    }
  }
}

export default function importRouter(dataDir: string, db: Database.Database): Router {
  const router = Router();
  const stagingDir = path.resolve(dataDir, 'import_staging');

  router.post('/import/stage', async (req: Request, res: Response): Promise<void> => {
    // 1. Detach prior staging DB and clean up prior staging folder
    detachImportStagingIfAttached(db, stagingDir);

    const sessionId = crypto.randomUUID();
    fs.mkdirSync(stagingDir, { recursive: true });

    const zipFilePath = path.join(stagingDir, 'upload.zip');
    const unpackedDir = path.join(stagingDir, 'unpacked');
    fs.mkdirSync(unpackedDir, { recursive: true });

    let stagingDb: Database.Database | null = null;

    try {
      // 2. Stream uploaded file directly to disk
      await pipeline(req, fs.createWriteStream(zipFilePath));

      // 3. Extract the archive safely
      await extractZip(zipFilePath, unpackedDir);

      // 4. Validate manifest.json
      const manifestPath = path.join(unpackedDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        res.status(400).json({ error: 'Invalid Yozakura export archive: manifest.json is missing' });
        return;
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as ManifestData;
      if (typeof manifest.dbUserVersion !== 'number' || !manifest.exportName) {
        res.status(400).json({ error: 'Invalid manifest format in export archive' });
        return;
      }

      const currentDbVersion = Number(db.pragma('user_version', { simple: true }));
      if (manifest.dbUserVersion > currentDbVersion) {
        res.status(400).json({
          error: `Archive version (${manifest.dbUserVersion}) is newer than current application database version (${currentDbVersion})`,
        });
        return;
      }

      // 5. Open standalone temporary SQLite database in stagingDir
      const stagingSqlitePath = path.join(stagingDir, 'import_staging.sqlite');
      stagingDb = new BetterSqlite3(stagingSqlitePath);
      stagingDb.pragma('foreign_keys = ON');
      stagingDb.pragma('journal_mode = WAL');
      stagingDb.pragma('synchronous = NORMAL');

      // 6. Run migrations 0 -> manifest.dbUserVersion
      runMigrations(stagingDb, { dataDir: unpackedDir }, manifest.dbUserVersion);

      // 7. Generically truncate all user tables
      stagingDb.pragma('foreign_keys = OFF');
      const tables = stagingDb
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
      for (const { name } of tables) {
        stagingDb.prepare(`DELETE FROM "${name}"`).run();
      }

      // Pre-compile insert statements and cache column lists once per table using SQLite's schema
      const tableColumns = new Map<string, string[]>();
      const insertStatementsByTable = new Map<string, Database.Statement>();

      for (const { name: tableName } of tables) {
        const columnRows = stagingDb.pragma(`table_info("${tableName}")`) as Array<{ name: string }>;
        const colNames = columnRows.map((c) => c.name);
        tableColumns.set(tableName, colNames);

        const placeholders = colNames.map(() => '?').join(', ');
        const quotedCols = colNames.map((c) => `"${c}"`).join(', ');

        const stmt = stagingDb.prepare(`INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`);
        insertStatementsByTable.set(tableName, stmt);
      }

      // 8. Stream db_rows.jsonl into stagingDb
      const dbRowsPath = path.join(unpackedDir, 'db_rows.jsonl');
      if (fs.existsSync(dbRowsPath)) {
        const fileStream = fs.createReadStream(dbRowsPath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        const rowsToInsert: { table: string; row: Record<string, unknown> }[] = [];
        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            rowsToInsert.push(JSON.parse(line));
          } catch {
            // Ignore malformed individual lines
          }
        }

        const insertAll = stagingDb.transaction(() => {
          for (const { table, row } of rowsToInsert) {
            const stmt = insertStatementsByTable.get(table);
            const cols = tableColumns.get(table);
            if (!stmt || !cols) continue;

            const values = cols.map((col) => row[col] ?? null);
            stmt.run(...values);
          }
        });

        insertAll();
      }

      // Re-enable foreign keys and verify integrity of staged data
      stagingDb.pragma('foreign_keys = ON');
      const fkViolations = stagingDb.pragma('foreign_key_check') as unknown[];
      if (Array.isArray(fkViolations) && fkViolations.length > 0) {
        throw new Error(`Import archive failed foreign_key_check with ${fkViolations.length} violations`);
      }

      // 9. Run remaining migrations (manifest.dbUserVersion -> latest)
      runMigrations(stagingDb, { dataDir: unpackedDir });

      // 10. Close standalone handle
      stagingDb.close();
      stagingDb = null;

      // 11. Early ATTACH to main database connection
      db.exec(`ATTACH DATABASE '${stagingSqlitePath.replace(/'/g, "''")}' AS import_staging`);

      // 12. Staging complete
      res.json({
        ok: true,
        sessionId,
        manifest,
        images: [],
      });
    } catch (error) {
      console.error('Error staging import archive:', error);
      if (stagingDb) {
        try {
          stagingDb.close();
        } catch {}
      }
      detachImportStagingIfAttached(db, stagingDir);
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Failed to stage import archive' });
    }
  });

  router.post('/import/commit', async (req: Request, res: Response): Promise<void> => {
    const { sqlStatements, imageCopies } = req.body ?? {};

    if (!fs.existsSync(stagingDir)) {
      res.status(400).json({ error: 'No active import staging session found' });
      return;
    }

    const attached = db.pragma('database_list') as { seq: number; name: string; file: string }[];
    if (!attached.some((d) => d.name === 'import_staging')) {
      res.status(400).json({ error: 'Staging database is not attached' });
      return;
    }

    if (!Array.isArray(sqlStatements)) {
      res.status(400).json({ error: 'sqlStatements must be an array' });
      return;
    }

    if (!Array.isArray(imageCopies)) {
      res.status(400).json({ error: 'imageCopies must be an array' });
      return;
    }

    try {
      // 1. Pre-import backup of main database (single overwritten backup file)
      const backupDir = path.resolve(dataDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const backupFilename = 'app_pre_import.sqlite';
      const backupPath = path.join(backupDir, backupFilename);
      await db.backup(backupPath);

      // 2. Load idMap from import_staging._id_map and register apply_id_map scalar function
      let idMap = new Map<string, string>();
      try {
        const idMapRows = db.prepare('SELECT old_id, new_id FROM import_staging._id_map').all() as Array<{
          old_id: string;
          new_id: string;
        }>;
        idMap = new Map(idMapRows.map((r) => [r.old_id, r.new_id]));
      } catch {
        // _id_map table does not exist if no ID remappings were performed
      }

      db.function('apply_id_map', (val: unknown) => {
        if (typeof val !== 'string') return val;
        return applyIdMap(val, idMap);
      });

      // 3. Copy & Rename image assets on disk first so failure leaves DB untouched
      const unpackedDir = path.join(stagingDir, 'unpacked');
      for (const item of imageCopies) {
        if (!item || typeof item.zipPath !== 'string' || typeof item.targetRelPath !== 'string') {
          continue;
        }
        const sourceAbsPath = guardPathWithinBase(unpackedDir, item.zipPath);
        if (!fs.existsSync(sourceAbsPath)) {
          continue;
        }

        const stat = fs.statSync(sourceAbsPath);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(sourceAbsPath);
          for (const file of files) {
            const fileSrc = path.join(sourceAbsPath, file);
            if (fs.statSync(fileSrc).isFile()) {
              const mappedRelPath = applyIdMap(`${item.targetRelPath}/${file}`, idMap);
              const targetAbsPath = guardPathWithinBase(dataDir, mappedRelPath);
              fs.mkdirSync(path.dirname(targetAbsPath), { recursive: true });
              fs.copyFileSync(fileSrc, targetAbsPath);
            }
          }
        } else if (stat.isFile()) {
          const mappedRelPath = applyIdMap(item.targetRelPath, idMap);
          const targetAbsPath = guardPathWithinBase(dataDir, mappedRelPath);
          fs.mkdirSync(path.dirname(targetAbsPath), { recursive: true });
          fs.copyFileSync(sourceAbsPath, targetAbsPath);
        }
      }

      // 4. Atomic Multi-Table Copy inside a single transaction
      const commitTx = db.transaction(() => {
        for (const entry of sqlStatements) {
          if (typeof entry === 'string') {
            const sql = entry.trim();
            if (sql) {
              db.prepare(sql).run();
            }
          } else if (entry && typeof entry === 'object' && typeof entry.statement === 'string') {
            const sql = entry.statement.trim();
            if (sql) {
              const params = Array.isArray(entry.params) ? entry.params : [];
              db.prepare(sql).run(...params);
            }
          }
        }
      });
      commitTx();

      // 5. Clean up & Detach
      detachImportStagingIfAttached(db, stagingDir);

      res.json({ ok: true, backupFilename });
    } catch (error) {
      console.error('Error committing import:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to commit import transaction',
      });
    }
  });

  router.post('/import/cancel', (_req: Request, res: Response) => {
    detachImportStagingIfAttached(db, stagingDir);
    res.json({ ok: true });
  });

  return router;
}
