import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { pipeline } from 'stream/promises';
import extract from 'extract-zip';
import PQueue from 'p-queue';
import { z } from 'zod';
import { guardPathWithinBase } from './pathGuard.js';
import { runMigrations } from '../migrator.js';
import { clearPreparedStatementCache } from './db.js';
import { applyIdMap } from '../id_map.js';

export const manifestDataSchema = z.object({
  exportName: z.string().min(1),
  dbUserVersion: z.number().int().nonnegative(),
});
export type ManifestData = z.infer<typeof manifestDataSchema>;

export const imageManifestEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    zipPath: z.string().min(1),
    kind: z.literal('global_character_card'),
  }),
  z.object({
    zipPath: z.string().min(1),
    kind: z.enum(['scenario_character_card', 'chat_image']),
    scenarioId: z.string().min(1),
  }),
]);
export type ImageManifestEntry = z.infer<typeof imageManifestEntrySchema>;

export const dbRowLineSchema = z.object({
  table: z.string().min(1),
  row: z.record(z.string(), z.unknown()),
});
export type DbRowLine = z.infer<typeof dbRowLineSchema>;

export const sqlStatementEntrySchema = z.union([
  z.string().min(1),
  z.object({
    statement: z.string().min(1),
    params: z.array(z.unknown()).optional().default([]),
  }),
]);
export type SqlStatementEntry = z.infer<typeof sqlStatementEntrySchema>;

export const imageCopyEntrySchema = z.object({
  zipPath: z.string().min(1),
  targetRelPath: z.string().min(1),
});
export type ImageCopyEntry = z.infer<typeof imageCopyEntrySchema>;

export const commitRequestBodySchema = z.object({
  sessionId: z.string().optional(),
  sqlStatements: z.array(sqlStatementEntrySchema),
  imageCopies: z.array(imageCopyEntrySchema),
  allowedImageDirectories: z.array(z.string().min(1)).optional().default(['character_cards', 'scenario']),
});
export type CommitRequestBody = z.infer<typeof commitRequestBodySchema>;

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
  const stagingDir = path.resolve(dataDir, 'temp', 'import_staging');

  router.post('/import/stage', async (req: Request, res: Response): Promise<void> => {
    // 1. Detach prior staging DB and clean up prior staging folder
    detachImportStagingIfAttached(db, stagingDir);

    const sessionId = crypto.randomUUID();
    fs.mkdirSync(stagingDir, { recursive: true });

    const zipFilePath = path.join(stagingDir, 'upload.zip');
    const unpackedDir = path.join(stagingDir, 'unpacked');
    fs.mkdirSync(unpackedDir, { recursive: true });

    let stagingDb: Database.Database | undefined = undefined;

    try {
      // 2. Stream uploaded file directly to disk
      await pipeline(req, fs.createWriteStream(zipFilePath));

      // 3. Extract the archive safely using extract-zip
      await extract(zipFilePath, { dir: path.resolve(unpackedDir) });

      // 4. Validate manifest.json with Zod
      const manifestPath = path.join(unpackedDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        res.status(400).json({ error: 'Invalid Yozakura export archive: manifest.json is missing' });
        return;
      }

      let manifestRaw: unknown;
      try {
        const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        manifestRaw = JSON.parse(manifestContent);
      } catch (jsonErr) {
        res.status(400).json({ error: 'Corrupt manifest.json in export archive' });
        return;
      }

      const manifestResult = manifestDataSchema.safeParse(manifestRaw);
      if (!manifestResult.success) {
        res.status(400).json({
          error: 'Invalid manifest format in export archive',
          details: manifestResult.error.format(),
        });
        return;
      }
      const manifest = manifestResult.data;

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

      // 8. Stream db_rows.jsonl into stagingDb in batches of 1000 rows
      const dbRowsPath = path.join(unpackedDir, 'db_rows.jsonl');
      if (fs.existsSync(dbRowsPath)) {
        const fileStream = fs.createReadStream(dbRowsPath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        const BATCH_SIZE = 1000;
        let batch: DbRowLine[] = [];

        const insertBatch = stagingDb.transaction((rows: DbRowLine[]) => {
          for (const { table, row } of rows) {
            const stmt = insertStatementsByTable.get(table);
            const cols = tableColumns.get(table);
            if (!stmt || !cols) continue;

            const values = cols.map((col) => row[col] ?? null);
            stmt.run(...values);
          }
        });

        for await (const line of rl) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let rawParsed: unknown;
          try {
            rawParsed = JSON.parse(trimmed);
          } catch (parseErr) {
            throw new Error(
              `Corrupt export archive: malformed JSON line in db_rows.jsonl: ${
                parseErr instanceof Error ? parseErr.message : String(parseErr)
              }`
            );
          }

          const validatedRow = dbRowLineSchema.safeParse(rawParsed);
          if (!validatedRow.success) {
            throw new Error(
              `Corrupt export archive: invalid row structure in db_rows.jsonl: ${validatedRow.error.message}`
            );
          }

          batch.push(validatedRow.data);
          if (batch.length >= BATCH_SIZE) {
            insertBatch(batch);
            batch = [];
          }
        }

        if (batch.length > 0) {
          insertBatch(batch);
          batch = [];
        }
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
      stagingDb = undefined;

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
        stagingDb = undefined;
      }
      detachImportStagingIfAttached(db, stagingDir);
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Failed to stage import archive' });
    }
  });

  router.post('/import/commit', async (req: Request, res: Response): Promise<void> => {
    const parseResult = commitRequestBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid commit request body', details: parseResult.error.format() });
      return;
    }

    const { sqlStatements, imageCopies, allowedImageDirectories } = parseResult.data;

    if (!fs.existsSync(stagingDir)) {
      res.status(400).json({ error: 'No active import staging session found' });
      return;
    }

    const attached = db.pragma('database_list') as { seq: number; name: string; file: string }[];
    if (!attached.some((d) => d.name === 'import_staging')) {
      res.status(400).json({ error: 'Staging database is not attached' });
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

      // 3. Normalize allowedImageDirectories and validate image copy targets
      const normalizedAllowedDirs = allowedImageDirectories.map((d) => {
        const norm = path.normalize(d).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (norm === '..' || norm.startsWith('../') || norm === '') {
          throw new Error(`Invalid allowed image directory: "${d}"`);
        }
        return norm;
      });

      const unpackedDir = path.join(stagingDir, 'unpacked');
      const copyQueue = new PQueue({ concurrency: 10 });
      const copyTasks: Promise<void>[] = [];

      for (const item of imageCopies) {
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
              const rawRel = `${item.targetRelPath}/${file}`;
              const mappedRelPath = applyIdMap(rawRel, idMap);
              const normMappedRel = path.normalize(mappedRelPath).replace(/\\/g, '/').replace(/^\/+/, '');

              const isAllowed = normalizedAllowedDirs.some(
                (allowed) => normMappedRel === allowed || normMappedRel.startsWith(allowed + '/')
              );
              if (!isAllowed) {
                throw new Error(
                  `Forbidden image copy destination: "${normMappedRel}" is not within allowed directories (${normalizedAllowedDirs.join(', ')})`
                );
              }

              const targetAbsPath = guardPathWithinBase(dataDir, normMappedRel);
              copyTasks.push(
                copyQueue.add(async () => {
                  await fs.promises.mkdir(path.dirname(targetAbsPath), { recursive: true });
                  await fs.promises.copyFile(fileSrc, targetAbsPath);
                })
              );
            }
          }
        } else if (stat.isFile()) {
          const mappedRelPath = applyIdMap(item.targetRelPath, idMap);
          const normMappedRel = path.normalize(mappedRelPath).replace(/\\/g, '/').replace(/^\/+/, '');

          const isAllowed = normalizedAllowedDirs.some(
            (allowed) => normMappedRel === allowed || normMappedRel.startsWith(allowed + '/')
          );
          if (!isAllowed) {
            throw new Error(
              `Forbidden image copy destination: "${normMappedRel}" is not within allowed directories (${normalizedAllowedDirs.join(', ')})`
            );
          }

          const targetAbsPath = guardPathWithinBase(dataDir, normMappedRel);
          copyTasks.push(
            copyQueue.add(async () => {
              await fs.promises.mkdir(path.dirname(targetAbsPath), { recursive: true });
              await fs.promises.copyFile(sourceAbsPath, targetAbsPath);
            })
          );
        }
      }

      try {
        await Promise.all(copyTasks);
      } catch (copyErr) {
        copyQueue.clear();
        throw copyErr;
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
