import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDatabase } from './database.js';
import { runMigrations } from './migrator.js';
import dbRouter from './routes/db.js';
import filesRouter from './routes/files.js';
import imageRouter from './routes/image.js';
import llmRouter from './routes/llm.js';

type CreateAppOptions = {
  dataDir?: string;
  frontendDistDir?: string;
};

type StartServerOptions = CreateAppOptions & {
  port?: number | string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data');
const DEFAULT_FRONTEND_DIST_DIR = path.resolve(__dirname, '..', 'client', 'dist');

export function createApp(options: CreateAppOptions = {}): Express {
  const dataDir = path.resolve(options.dataDir ?? process.env.YOZAKURA_DATA_DIR ?? DEFAULT_DATA_DIR);
  const staticDir = path.resolve(
    options.frontendDistDir ?? process.env.YOZAKURA_FRONTEND_DIST_DIR ?? DEFAULT_FRONTEND_DIST_DIR
  );
  const staticIndexPath = path.join(staticDir, 'index.html');

  fs.mkdirSync(staticDir, { recursive: true });

  const db = openDatabase(dataDir);
  runMigrations(db);

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', filesRouter(dataDir));
  app.use('/api', dbRouter(db));
  app.use('/api', llmRouter());
  app.use('/api', imageRouter(dataDir));

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

export function startServer(options: StartServerOptions = {}) {
  const app = createApp(options);
  const port = options.port ?? process.env.PORT ?? 3001;
  const server = app.listen(Number(port), () => {
    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Server listening on port ${resolvedPort}`);
  });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

  return { app, server, close };
}
