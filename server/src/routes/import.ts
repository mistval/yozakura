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

export function detachImportStagingIfAttached(db: Database.Database, tempImportDir?: string): void {
  const attached = db.pragma('database_list') as { seq: number; name: string; file: string }[];
  if (attached.some((d) => d.name === 'import_staging')) {
    clearPreparedStatementCache();
    db.exec('DETACH DATABASE import_staging');
  }

  if (tempImportDir && fs.existsSync(tempImportDir)) {
    try {
      fs.rmSync(tempImportDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Failed to clean up temp import directory:', tempImportDir, cleanupErr);
    }
  }
}

export default function importRouter(dataDir: string, db: Database.Database): Router {
  const router = Router();
  const tempImportBaseDir = path.resolve(dataDir, 'temp_import');

  router.post('/import/stage', async (req: Request, res: Response): Promise<void> => {
    // 1. Detach prior staging DB and clean up prior temp import folder
    detachImportStagingIfAttached(db, tempImportBaseDir);

    const sessionId = crypto.randomUUID();
    const stagingDir = path.join(tempImportBaseDir, sessionId);
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
      runMigrations(stagingDb, { dataDir: stagingDir }, manifest.dbUserVersion);

      // 7. Generically truncate all user tables
      stagingDb.pragma('foreign_keys = OFF');
      const tables = stagingDb
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
      for (const { name } of tables) {
        stagingDb.prepare(`DELETE FROM "${name}"`).run();
      }
      stagingDb.pragma('foreign_keys = ON');

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
            const cols = Object.keys(row);
            if (cols.length === 0) continue;
            const placeholders = cols.map(() => '?').join(', ');
            const stmt = stagingDb!.prepare(
              `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
            );
            stmt.run(...Object.values(row));
          }
        });

        insertAll();
      }

      // 9. Run remaining migrations (manifest.dbUserVersion -> latest)
      runMigrations(stagingDb, { dataDir: stagingDir });

      // 10. Close standalone handle
      stagingDb.close();
      stagingDb = null;

      // 11. Early ATTACH to main database connection
      db.exec(`ATTACH DATABASE '${stagingSqlitePath.replace(/'/g, "''")}' AS import_staging`);

      // 12. Parse images.jsonl if present
      const images: ImageManifestEntry[] = [];
      const imagesManifestPath = path.join(unpackedDir, 'images.jsonl');
      if (fs.existsSync(imagesManifestPath)) {
        const imagesContent = fs.readFileSync(imagesManifestPath, 'utf-8');
        const lines = imagesContent.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            images.push(JSON.parse(line));
          } catch {
            // Ignore
          }
        }
      }

      res.json({
        ok: true,
        manifest,
        images,
      });
    } catch (error) {
      console.error('Error staging import archive:', error);
      if (stagingDb) {
        try {
          stagingDb.close();
        } catch {}
      }
      detachImportStagingIfAttached(db, tempImportBaseDir);
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Failed to stage import archive' });
    }
  });

  router.post('/import/cancel', (_req: Request, res: Response) => {
    detachImportStagingIfAttached(db, tempImportBaseDir);
    res.json({ ok: true });
  });

  return router;
}
