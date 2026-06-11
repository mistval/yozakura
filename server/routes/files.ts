import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import type { Router } from 'express';
import { resolveDiskPath } from './pathGuard.js';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function filesRouter(dataDir: string): Router {
  const router = express.Router();

  router.put('/files/*', async (req, res) => {
    try {
      const resolved = resolveDiskPath(req, dataDir);
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      await pipeline(req, createWriteStream(resolved));

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: toErrorMessage(error) });
    }
  });

  router.delete('/files/*', async (req, res) => {
    try {
      const resolved = resolveDiskPath(req, dataDir);
      await fs.rm(resolved, { recursive: true, force: true });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: toErrorMessage(error) });
    }
  });

  return router;
}
