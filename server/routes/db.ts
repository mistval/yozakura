import express from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import type { Router } from 'express';
import z from 'zod';
import assert from 'assert';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'app.sqlite');
  const db = new Database(dbPath);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  return db;
}

const execSchema = z.object({
  sql: z.string(),
});

const allSchema = z.object({
  statement: z.string(),
  parameterGroups: z.array(z.array(z.unknown())),
});

export default function dbRouter(dataDir: string): Router {
  const router = express.Router();

  const db = ensureDatabase(dataDir);

  const preparedStatementCache = new LRUCache<string, Database.Statement>({
    max: 1000,
  });

  function getPreparedStatement(statementText: string): Database.Statement {
    const cached = preparedStatementCache.get(statementText);
    if (cached) {
      return cached;
    }

    const prepared = db.prepare(statementText);
    preparedStatementCache.set(statementText, prepared);
    return prepared;
  }

  router.post('/db/exec', async (req, res) => {
    try {
      db.exec(execSchema.parse(req.body).sql);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: toErrorMessage(error) });
    }
  });

  router.post('/db/all', async (req, res) => {
    try {
      const parsed = allSchema.parse(req.body);
      const statement = getPreparedStatement(parsed.statement);

      if (parsed.parameterGroups.length === 1) {
        const firstGroup = parsed.parameterGroups[0];
        assert(
          firstGroup,
          'we just checked the array length and it said it was one. but now theres no zeroth element. big thonk.'
        );

        return res.json({ results: [statement.all(...firstGroup)] });
      }

      const runInTransaction = db.transaction((groups: unknown[][]) =>
        groups.map((group) => statement.all(...group))
      );
      const results = runInTransaction(parsed.parameterGroups);
      return res.json({ results });
    } catch (error) {
      return res.status(400).json({ error: toErrorMessage(error) });
    }
  });

  router.post('/db/run', async (req, res) => {
    try {
      const parsed = allSchema.parse(req.body);
      const statement = getPreparedStatement(parsed.statement);

      if (parsed.parameterGroups.length === 1) {
        const firstGroup = parsed.parameterGroups[0];
        assert(firstGroup);
        statement.run(...firstGroup);
        return res.json({});
      }

      const runInTransaction = db.transaction((groups: unknown[][]) =>
        groups.map((group) => statement.run(...group))
      );

      runInTransaction(parsed.parameterGroups);
      return res.json({});
    } catch (error) {
      return res.status(400).json({ error: toErrorMessage(error) });
    }
  });

  return router;
}
