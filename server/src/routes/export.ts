import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ZipArchive } from 'archiver';
import PQueue from 'p-queue';
import { z } from 'zod';
import { guardPathWithinBase } from './pathGuard.js';

export const tableExportQuerySchema = z.object({
  table: z.string().min(1),
  statement: z.string().min(1),
  params: z.array(z.unknown()),
});
export type TableExportQuery = z.infer<typeof tableExportQuerySchema>;

export const imageCopyDescriptorSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('file'),
    sourceRelPath: z.string().min(1),
    kind: z.string().optional(),
  }),
  z.object({
    mode: z.literal('directory'),
    sourceRelDir: z.string().min(1),
    kind: z.string().optional(),
    scenarioId: z.string().optional(),
  }),
]);
export type ImageCopyDescriptor = z.infer<typeof imageCopyDescriptorSchema>;

export const prebuiltRowSchema = z.object({
  table: z.string().min(1),
  row: z.record(z.string(), z.unknown()),
});
export type PrebuiltRow = z.infer<typeof prebuiltRowSchema>;

export const exportRequestBodySchema = z.object({
  exportName: z.string().min(1),
  filename: z.string().min(1),
  overwrite: z.boolean().optional().default(false),
  queries: z.array(tableExportQuerySchema).optional().default([]),
  prebuiltRows: z.array(prebuiltRowSchema).optional().default([]),
  imageDescriptors: z.array(imageCopyDescriptorSchema).optional().default([]),
});
export type ExportRequestBody = z.infer<typeof exportRequestBodySchema>;

export function createZipBuffer(entries: { name: string; content: string | Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err: unknown) => reject(err));

    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }
    archive.finalize().catch((err: unknown) => reject(err));
  });
}

function zipDirectory(sourceDir: string, outZipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', (err: unknown) => reject(err));
    archive.on('error', (err: unknown) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize().catch((err: unknown) => reject(err));
  });
}

export default function exportRouter(dataDir: string, db: Database.Database): Router {
  const router = Router();

  router.post('/export', async (req: Request, res: Response): Promise<void> => {
    const parseResult = exportRequestBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid export request body', details: parseResult.error.format() });
      return;
    }

    const {
      exportName,
      filename,
      overwrite = false,
      queries = [],
      prebuiltRows = [],
      imageDescriptors = [],
    } = parseResult.data;

    if (!filename.endsWith('.yozakura_export.zip')) {
      res.status(400).json({ error: 'filename must end with .yozakura_export.zip' });
      return;
    }

    const dataExportsDir = path.resolve(dataDir, 'data_exports');
    fs.mkdirSync(dataExportsDir, { recursive: true });

    let targetZipPath: string;
    try {
      targetZipPath = guardPathWithinBase(dataExportsDir, filename);
    } catch {
      res.status(400).json({ error: 'Invalid export destination path' });
      return;
    }

    if (fs.existsSync(targetZipPath) && !overwrite) {
      res.status(409).json({ alreadyExists: true, message: `File already exists: ${filename}` });
      return;
    }

    const sessionId = crypto.randomUUID();
    const tempDir = path.resolve(dataDir, 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const workDir = path.resolve(tempDir, `export_${Date.now()}_${sessionId}`);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      // 1. Write manifest.json
      const dbUserVersion = Number(db.pragma('user_version', { simple: true }));
      const manifest = {
        exportName: exportName || 'Export',
        dbUserVersion,
      };
      fs.writeFileSync(path.join(workDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

      // 2. Stream db_rows.jsonl
      const dbRowsStream = fs.createWriteStream(path.join(workDir, 'db_rows.jsonl'), {
        flags: 'w',
        encoding: 'utf-8',
      });

      for (const query of queries) {
        if (!query.statement || typeof query.statement !== 'string') continue;
        const stmt = db.prepare(query.statement);
        const params = Array.isArray(query.params) ? query.params : [];

        for (const row of stmt.iterate(...params)) {
          const entry = JSON.stringify({ table: query.table, row });
          dbRowsStream.write(`${entry}\n`);
        }
      }

      for (const prebuilt of prebuiltRows) {
        const entry = JSON.stringify({ table: prebuilt.table, row: prebuilt.row });
        dbRowsStream.write(`${entry}\n`);
      }

      await new Promise<void>((resolve, reject) => {
        dbRowsStream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // 3. Process imageDescriptors (copy disk files into workDir with concurrency)
      const copyQueue = new PQueue({ concurrency: 10 });
      const copyTasks: Promise<void>[] = [];

      for (const descriptor of imageDescriptors) {
        if (descriptor.mode === 'file') {
          let srcPath: string;
          try {
            srcPath = guardPathWithinBase(dataDir, descriptor.sourceRelPath);
          } catch {
            continue; // Skip invalid or path-traversing paths
          }

          if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
            const relNormalized = descriptor.sourceRelPath.replace(/\\/g, '/');
            const destPath = path.resolve(workDir, relNormalized);
            copyTasks.push(
              copyQueue.add(async () => {
                await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                await fs.promises.copyFile(srcPath, destPath);
              })
            );
          }
        } else if (descriptor.mode === 'directory') {
          let srcDir: string;
          try {
            srcDir = guardPathWithinBase(dataDir, descriptor.sourceRelDir);
          } catch {
            continue;
          }

          if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
            const files = fs.readdirSync(srcDir);
            for (const file of files) {
              const fileSrc = path.join(srcDir, file);
              if (fs.statSync(fileSrc).isFile()) {
                const relNormalized = `${descriptor.sourceRelDir}/${file}`.replace(/\\/g, '/');
                const destPath = path.resolve(workDir, relNormalized);
                copyTasks.push(
                  copyQueue.add(async () => {
                    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                    await fs.promises.copyFile(fileSrc, destPath);
                  })
                );
              }
            }
          }
        }
      }

      try {
        await Promise.all(copyTasks);
      } catch (copyErr) {
        copyQueue.clear();
        throw copyErr;
      }

      // 4. Zip the working directory to targetZipPath
      await zipDirectory(workDir, targetZipPath);

      res.json({ ok: true, filePath: targetZipPath });
    } catch (error) {
      console.error('Error during data export:', error);
      res.status(500).json({ error: 'Failed to create export archive' });
    } finally {
      // Clean up temp working directory
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Failed to clean up temp export directory:', workDir, cleanupErr);
      }
    }
  });

  return router;
}
