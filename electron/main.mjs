import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { startServer } from '../server/dist/src/app.js';

const __dirname = import.meta.dirname;
const __filename = import.meta.filename;

let mainWindow = null;
let serverRuntime = null;
let isShuttingDown = false;
let pendingDeepLink = null;
let rendererReady = false;

const DEEP_LINK_PROTOCOL = 'yozakura';

function waitForServerListening(server) {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleListening = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      server.off('listening', handleListening);
      server.off('error', handleError);
    };

    server.on('listening', handleListening);
    server.on('error', handleError);
  });
}

function shouldOpenExternally(targetUrl, internalOrigins) {
  try {
    const parsed = new URL(targetUrl);

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return !internalOrigins.has(parsed.origin);
    }

    return parsed.protocol === 'mailto:' || parsed.protocol === 'tel:';
  } catch {
    return false;
  }
}

function attachExternalLinkHandlers(window, internalOrigins) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url, internalOrigins)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }

    return { action: 'allow' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (shouldOpenExternally(url, internalOrigins)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function resolveRuntimePaths() {
  if (app.isPackaged) {
    const installDir = path.dirname(app.getPath('exe'));
    return {
      dataDir: path.join(installDir, 'yozakura_data'),
      frontendDistDir: path.join(installDir, 'yozakura_client'),
    };
  }

  return {
    dataDir: path.join(__dirname, '..', 'data'),
    frontendDistDir: path.join(__dirname, '..', 'client', 'dist'),
  };
}

async function ensureEmbeddedServer() {
  if (serverRuntime) {
    return serverRuntime;
  }

  const { dataDir, frontendDistDir } = resolveRuntimePaths();
  const runtime = startServer({ dataDir, frontendDistDir, port: 0 });
  await waitForServerListening(runtime.server);

  const address = runtime.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Failed to resolve embedded server port');
  }

  serverRuntime = {
    ...runtime,
    port: address.port,
  };

  return serverRuntime;
}

async function createMainWindow() {
  const runtime = await ensureEmbeddedServer();
  const internalOrigins = new Set([`http://127.0.0.1:${runtime.port}`, `http://localhost:${runtime.port}`]);
  const appUrl = `http://127.0.0.1:${runtime.port}`;

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#0f1218',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  attachExternalLinkHandlers(window, internalOrigins);
  await window.loadURL(appUrl);

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      rendererReady = false;
    }
  });

  mainWindow = window;
}

async function shutdownEmbeddedServer() {
  if (!serverRuntime) {
    return;
  }

  const runtime = serverRuntime;
  serverRuntime = null;

  try {
    await runtime.close();
  } catch (error) {
    console.error('Failed to stop embedded server cleanly:', error);
  }
}

function registerDeepLinkProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
  }
}

function extractDeepLinkUrl(argv) {
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)) ?? null;
}

function parseDeepLink(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  const withoutScheme = rawUrl.replace(new RegExp(`^${DEEP_LINK_PROTOCOL}://`, 'i'), '');
  const queryIndex = withoutScheme.indexOf('?');
  const rawPath = queryIndex === -1 ? withoutScheme : withoutScheme.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : withoutScheme.slice(queryIndex + 1);
  const normalizedPath = rawPath.replace(/^\/+/, '');

  return {
    path: normalizedPath.length > 0 ? `/${normalizedPath}` : null,
    search,
  };
}

function flushPendingDeepLink() {
  if (!pendingDeepLink || !rendererReady || !mainWindow) {
    return;
  }

  mainWindow.webContents.send('yozakura:navigate', pendingDeepLink);
  pendingDeepLink = null;
}

function handleDeepLinkUrl(rawUrl) {
  const parsed = parseDeepLink(rawUrl);
  if (!parsed) {
    return;
  }

  pendingDeepLink = parsed;
  flushPendingDeepLink();
}

function focusMainWindow() {
  if (!mainWindow) {
    void createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    handleDeepLinkUrl(extractDeepLinkUrl(argv));
    focusMainWindow();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
  });

  ipcMain.on('yozakura:renderer-ready', () => {
    rendererReady = true;
    flushPendingDeepLink();
  });

  app
    .whenReady()
    .then(async () => {
      registerDeepLinkProtocol();
      await createMainWindow();
      handleDeepLinkUrl(extractDeepLinkUrl(process.argv));

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createMainWindow();
        }
      });
    })
    .catch((error) => {
      console.error('Failed to start Electron app:', error);
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isShuttingDown || !serverRuntime) {
    return;
  }

  event.preventDefault();
  isShuttingDown = true;

  shutdownEmbeddedServer().finally(() => {
    app.quit();
  });
});
