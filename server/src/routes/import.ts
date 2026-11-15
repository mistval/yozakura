import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import PQueue from 'p-queue';
import { z } from 'zod';
import { guardPathWithinBase } from './pathGuard.js';
import { runMigrations } from '../migrator.js';
import { clearPreparedStatementCache } from './db.js';
import { applyIdMap } from '../id_map.js';

export const MAX_DB_ROW_LINE_CHARS = 10 * 1024 * 1024; // 10M characters

/** Extracts a ZIP archive into targetDir while rejecting symlinks and path traversal entries. */
async function extractArchiveSafely(zipFilePath: string, targetDir: string): Promise<void> {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const canonicalTargetDir = await fs.promises.realpath(targetDir);

  const zipfile = await yauzl.openPromise(zipFilePath, { lazyEntries: true });
  try {
    for await (const entry of zipfile.eachEntry()) {
      const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
      const isSymlink = (unixMode & 0o170000) === 0o120000;
      if (isSymlink) {
        throw new Error(`Forbidden symlink entry in import archive: "${entry.fileName}"`);
      }

      if (entry.fileName.startsWith('__MACOSX/')) {
        continue;
      }

      const destPath = guardPathWithinBase(canonicalTargetDir, entry.fileName);
      const madeBy = entry.versionMadeBy >> 8;
      const isDir =
        (unixMode & 0o170000) === 0o040000 ||
        entry.fileName.endsWith('/') ||
        (madeBy === 0 && entry.externalFileAttributes === 16);

      if (isDir) {
        await fs.promises.mkdir(destPath, { recursive: true });
        continue;
      }

      const destDir = path.dirname(destPath);
      await fs.promises.mkdir(destDir, { recursive: true });
      const canonicalDestDir = await fs.promises.realpath(destDir);
      if (
        canonicalDestDir !== canonicalTargetDir &&
        !canonicalDestDir.startsWith(canonicalTargetDir + path.sep)
      ) {
        throw new Error(
          `Out of bound path "${canonicalDestDir}" found while processing file ${entry.fileName}`
        );
      }

      const readStream = await zipfile.openReadStreamPromise(entry);
      await pipeline(readStream, fs.createWriteStream(destPath));
    }
  } finally {
    zipfile.close();
  }
}

async function copyValidatedImageFile(
  srcAbsPath: string,
  rawTargetRelPath: string,
  idMap: Map<string, string>,
  normalizedAllowedDirs: string[],
  allowedFileExtensions: string[],
  dataDir: string
): Promise<void> {
  const mappedRelPath = applyIdMap(rawTargetRelPath, idMap);
  const normMappedRel = path.normalize(mappedRelPath).replace(/\\/g, '/').replace(/^\/+/, '');

  const isAllowed = normalizedAllowedDirs.some((allowed) => normMappedRel.startsWith(allowed + '/'));
  if (!isAllowed) {
    throw new Error(
      `Forbidden image copy destination: "${normMappedRel}" is not within allowed directories (${normalizedAllowedDirs.join(', ')})`
    );
  }

  const srcExt = path.extname(srcAbsPath).toLowerCase();
  const targetExt = path.extname(normMappedRel).toLowerCase();
  if (!allowedFileExtensions.includes(srcExt) || !allowedFileExtensions.includes(targetExt)) {
    throw new Error(
      `Forbidden file extension in image copy: "${normMappedRel}" is not in allowed extensions (${allowedFileExtensions.join(', ')})`
    );
  }

  const targetAbsPath = guardPathWithinBase(dataDir, normMappedRel);
  await fs.promises.mkdir(path.dirname(targetAbsPath), { recursive: true });
  await fs.promises.copyFile(srcAbsPath, targetAbsPath);
}

export const manifestDataSchema = z.object({
  exportName: z.string().min(1),
  dbUserVersion: z.number().int().nonnegative(),
});
export type ManifestData = z.infer<typeof manifestDataSchema>;

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
  sqlStatements: z.array(sqlStatementEntrySchema),
  imageCopies: z.array(imageCopyEntrySchema),
  allowedImageDirectories: z.array(z.string().min(1)).optional().default(['character_cards', 'scenario']),
  allowedFileExtensions: z.array(z.string().min(1)).optional().default(['.png']),
});
export type CommitRequestBody = z.infer<typeof commitRequestBodySchema>;

export const stageJsonRequestSchema = z.object({
  prepackagedName: z.string().min(1).optional(),
  archivePath: z.string().min(1).optional(),
});
export type StageJsonRequest = z.infer<typeof stageJsonRequestSchema>;

export function resolvePrepackagedArchivePath(name: string): string {
  if (name === 'demo') {
    const candidates = [
      path.resolve(import.meta.dirname, '../../demo_data.yozakura_export.zip'),
      path.resolve(import.meta.dirname, '../../../demo_data.yozakura_export.zip'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`Prepackaged archive "${name}" not found. Searched: ${candidates.join(', ')}`);
  }
  throw new Error(`Unknown prepackaged archive "${name}"`);
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
  const stagingDir = path.resolve(dataDir, 'temp', 'import_staging');

  router.post('/import/stage', async (req: Request, res: Response): Promise<void> => {
    // 1. Detach prior staging DB and clean up prior staging folder
    detachImportStagingIfAttached(db, stagingDir);

    fs.mkdirSync(stagingDir, { recursive: true });

    const zipFilePath = path.join(stagingDir, 'upload.zip');
    const unpackedDir = path.join(stagingDir, 'unpacked');
    fs.mkdirSync(unpackedDir, { recursive: true });

    let stagingDb: Database.Database | undefined = undefined;

    try {
      // 2. Obtain zip archive: from JSON prepackaged/path or raw upload stream
      if (req.is('json')) {
        const jsonResult = stageJsonRequestSchema.safeParse(req.body);
        if (!jsonResult.success) {
          res.status(400).json({ error: 'Invalid stage request body', details: jsonResult.error.format() });
          return;
        }

        const { prepackagedName, archivePath } = jsonResult.data;
        let sourceZipPath: string;

        if (prepackagedName) {
          sourceZipPath = resolvePrepackagedArchivePath(prepackagedName);
        } else if (archivePath) {
          sourceZipPath = guardPathWithinBase(dataDir, archivePath);
        } else {
          res.status(400).json({
            error: 'Either prepackagedName or archivePath must be provided in JSON request',
          });
          return;
        }

        if (!fs.existsSync(sourceZipPath)) {
          res.status(404).json({ error: `Archive file not found: ${sourceZipPath}` });
          return;
        }

        fs.copyFileSync(sourceZipPath, zipFilePath);
      } else {
        await pipeline(req, fs.createWriteStream(zipFilePath));
      }

      // 3. Extract the archive safely using yauzl (reject any symlink or traversal entries)
      await extractArchiveSafely(zipFilePath, unpackedDir);

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
          if (line.length > MAX_DB_ROW_LINE_CHARS) {
            throw new Error(
              `Corrupt export archive: line in db_rows.jsonl exceeds maximum allowed size (${MAX_DB_ROW_LINE_CHARS} characters)`
            );
          }
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
        manifest,
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

    const { sqlStatements, imageCopies, allowedImageDirectories, allowedFileExtensions } = parseResult.data;

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

      // 3. Normalize allowedImageDirectories, then validate and copy image files asynchronously
      const normalizedAllowedDirs = allowedImageDirectories.map((d) => {
        const norm = path
          .normalize(d)
          .replace(/\\/g, '/')
          .replace(/^\/+|\/+$/g, '');
        if (norm === '..' || norm.startsWith('../') || norm === '') {
          throw new Error(`Invalid allowed image directory: "${d}"`);
        }
        return norm;
      });

      const unpackedDir = path.join(stagingDir, 'unpacked');
      const scanQueue = new PQueue({ concurrency: 10 });
      const copyQueue = new PQueue({ concurrency: 10 });
      const copyTasks: Promise<void>[] = [];

      const scanTasks = imageCopies.map((item) =>
        scanQueue.add(async () => {
          const sourceAbsPath = guardPathWithinBase(unpackedDir, item.zipPath);
          let stat: fs.Stats;
          try {
            stat = await fs.promises.lstat(sourceAbsPath);
          } catch (err) {
            if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
              return;
            }
            throw err;
          }

          if (stat.isSymbolicLink()) {
            throw new Error(`Forbidden symlink image copy source: "${item.zipPath}"`);
          }

          if (stat.isDirectory()) {
            const entries = await fs.promises.readdir(sourceAbsPath, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isFile()) {
                throw new Error(
                  `Forbidden entry in image directory "${item.zipPath}": "${entry.name}" is not a regular file`
                );
              }
              const fileSrc = path.join(sourceAbsPath, entry.name);
              const targetRel = `${item.targetRelPath}/${entry.name}`;
              copyTasks.push(
                copyQueue.add(() =>
                  copyValidatedImageFile(
                    fileSrc,
                    targetRel,
                    idMap,
                    normalizedAllowedDirs,
                    allowedFileExtensions,
                    dataDir
                  )
                )
              );
            }
          } else if (stat.isFile()) {
            copyTasks.push(
              copyQueue.add(() =>
                copyValidatedImageFile(
                  sourceAbsPath,
                  item.targetRelPath,
                  idMap,
                  normalizedAllowedDirs,
                  allowedFileExtensions,
                  dataDir
                )
              )
            );
          } else {
            throw new Error(
              `Forbidden image copy source: "${item.zipPath}" is neither a regular file nor a directory`
            );
          }
        })
      );

      try {
        await Promise.all(scanTasks);
        await Promise.all(copyTasks);
      } catch (copyErr) {
        scanQueue.clear();
        copyQueue.clear();
        await Promise.allSettled([...scanTasks, ...copyTasks]);
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
