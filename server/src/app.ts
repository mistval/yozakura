import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import Database from 'better-sqlite3';

export type { Database };
import { openDatabase } from './database.js';
import { runMigrations } from './migrator.js';
import dbRouter from './routes/db.js';
import filesRouter from './routes/files.js';
import proxyRouter from './routes/proxy.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';

export type CreateAppOptions = {
  dataDir?: string;
  frontendDistDir?: string;
  db?: Database.Database;
};

export type StartServerOptions = CreateAppOptions & {
  port?: number | string;
  host?: string;
};

export type StartedServer = {
  app: Express;
  server: Server;
  close: () => Promise<void>;
  db: Database.Database;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_DATA_DIR = ['yozakura_data', 'data'].map((dir) => path.resolve(REPO_ROOT, dir)).join(',');
const DEFAULT_FRONTEND_DIST_DIR = path.resolve(REPO_ROOT, 'client', 'dist');

function resolveDataDir(dataDirOption?: string): string {
  const spec = dataDirOption ?? process.env.YOZAKURA_DATA_DIR ?? DEFAULT_DATA_DIR;
  const candidates = spec
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));

  const [firstCandidate] = candidates;
  if (!firstCandidate) {
    throw new Error('Data directory configuration is empty');
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? firstCandidate;
}

const SESSION_ID_HEADER = 'x-yozakura-session-id';
const SESSION_SUPERSEDED_HEADER = 'X-Yozakura-Session-Superseded';

function createSingleActiveSessionMiddleware() {
  let activeSessionId: string | undefined;
  const seenSessionIds = new Set<string>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }

    const sessionId = req.get(SESSION_ID_HEADER)?.trim();
    if (!sessionId) {
      next();
      return;
    }

    if (sessionId === activeSessionId) {
      next();
      return;
    }

    if (!seenSessionIds.has(sessionId)) {
      seenSessionIds.add(sessionId);
      activeSessionId = sessionId;
      next();
      return;
    }

    res.setHeader(SESSION_SUPERSEDED_HEADER, '1');
    res.status(409).json({
      code: 'SESSION_SUPERSEDED',
      error: 'You seem to be using Yozakura elsewhere.',
    });
  };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const corsOrigin = process.env.YOZAKURA_CORS_ALLOWED_ORIGINS?.trim()
    ? process.env.YOZAKURA_CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : undefined;

  const dataDir = resolveDataDir(options.dataDir);
  const staticDir = path.resolve(
    options.frontendDistDir ?? process.env.YOZAKURA_FRONTEND_DIST_DIR ?? DEFAULT_FRONTEND_DIST_DIR
  );
  const staticIndexPath = path.join(staticDir, 'index.html');

  fs.mkdirSync(staticDir, { recursive: true });

  const db = options.db ?? openDatabase(dataDir);
  runMigrations(db, { dataDir });

  const tempDir = path.resolve(dataDir, 'temp');
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('Failed to clean up temp directory on startup:', tempDir, err);
    }
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const app = express();
  if (corsOrigin) {
    console.log('Configuration allowed custom CORS origins:', corsOrigin.toString());
    app.use(cors({ origin: corsOrigin }));
  }

  app.use('/api', createSingleActiveSessionMiddleware());
  app.use('/api', proxyRouter());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', filesRouter(dataDir));
  app.use('/api', dbRouter(db));
  app.use('/api', exportRouter(dataDir, db));
  app.use('/api', importRouter(dataDir, db));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use(express.static(staticDir));
  app.use('/api/files', express.static(dataDir));

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (req.path.startsWith('/api')) {
      return next();
    }

    if (!fs.existsSync(staticIndexPath)) {
      return next();
    }

    return res.sendFile(staticIndexPath);
  });

  return app;
}

export function startServer(options: StartServerOptions = {}): StartedServer {
  const dataDir = resolveDataDir(options.dataDir);
  const db = options.db ?? openDatabase(dataDir);
  const app = createApp({ ...options, dataDir, db });
  const port = options.port ?? process.env.PORT ?? 3001;
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const server = app.listen(Number(port), host, () => {
    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Server listening on port ${resolvedPort}`);
  });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        try {
          db.close();
        } catch {
          // ignore if already closed
        }
        resolve();
        return;
      }

      const forceCloseTimer = setTimeout(() => {
        console.warn('HTTP server close timed out; forcibly closing remaining connections.');
        server.closeAllConnections();
      }, 1500);

      server.close((error) => {
        clearTimeout(forceCloseTimer);

        try {
          db.close();
        } catch (dbError) {
          if (!error) {
            reject(dbError);
            return;
          }
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      server.closeIdleConnections();
    });

  return { app, server, close, db };
}
