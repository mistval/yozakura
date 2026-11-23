import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const CLIENT_DIR = path.join(REPO_ROOT, 'client');

const isWindows = process.platform === 'win32';
const POSIX_FORCE_KILL_TIMEOUT_MS = 2500;

/** Resolves the JS executable entrypoint from a package's package.json `bin` field. */
function resolveBinScript(workspaceDir, packageName, binName = packageName) {
  const requireFromWorkspace = createRequire(path.join(workspaceDir, 'package.json'));
  const pkgJsonPath = requireFromWorkspace.resolve(`${packageName}/package.json`);
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const binRelPath = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binName];

  if (!binRelPath) {
    throw new Error(`Could not resolve binary "${binName}" from ${pkgJsonPath}`);
  }

  return path.resolve(path.dirname(pkgJsonPath), binRelPath);
}

/** Pipes a readable stream to a target writable stream, prepending a label to each line. */
function forwardPrefixedStream(stream, prefix, target) {
  let buffer = '';

  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      target.write(`${prefix}${line}\n`);
    }
  });

  stream.on('end', () => {
    if (buffer.length > 0) {
      target.write(`${prefix}${buffer}\n`);
      buffer = '';
    }
  });
}

function isChildAlive(child) {
  return Boolean(child.pid) && child.exitCode === null && child.signalCode === null;
}

function sendPosixSignal(child, signal) {
  if (!isChildAlive(child)) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (err) {
    if (err?.code === 'ESRCH') {
      return;
    }
    try {
      child.kill(signal);
    } catch {
      // Ignore if child already exited.
    }
  }
}

function killTreeSync(child, posixSignal = 'SIGKILL') {
  if (!isChildAlive(child)) {
    return;
  }

  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  sendPosixSignal(child, posixSignal);
}

const specs = [
  {
    name: 'server',
    prefix: '\x1b[36m[server]\x1b[0m ',
    cwd: SERVER_DIR,
    binPath: resolveBinScript(SERVER_DIR, 'tsx'),
    args: ['watch', 'index.ts'],
  },
  {
    name: 'client',
    prefix: '\x1b[35m[client]\x1b[0m ',
    cwd: CLIENT_DIR,
    binPath: resolveBinScript(CLIENT_DIR, 'vite'),
    args: [],
  },
];

const children = [];
const exitedPromises = [];
let shuttingDown = false;

function waitForChildrenExit(timeoutMs) {
  const pending = exitedPromises.filter((_, index) => isChildAlive(children[index]));
  if (pending.length === 0) {
    return Promise.resolve();
  }

  return Promise.race([
    Promise.allSettled(pending),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref();
    }),
  ]);
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    for (const child of children) {
      killTreeSync(child, 'SIGKILL');
    }
    process.exit(exitCode);
  }
  shuttingDown = true;

  if (isWindows) {
    for (const child of children) {
      killTreeSync(child);
    }
    process.exit(exitCode);
  }

  for (const child of children) {
    sendPosixSignal(child, 'SIGTERM');
  }

  await waitForChildrenExit(POSIX_FORCE_KILL_TIMEOUT_MS);

  for (const child of children) {
    killTreeSync(child, 'SIGKILL');
  }

  process.exit(exitCode);
}

for (const spec of specs) {
  const child = spawn(process.execPath, [spec.binPath, ...spec.args], {
    cwd: spec.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
    detached: !isWindows,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
    },
  });

  children.push(child);

  if (child.stdout) {
    forwardPrefixedStream(child.stdout, spec.prefix, process.stdout);
  }
  if (child.stderr) {
    forwardPrefixedStream(child.stderr, spec.prefix, process.stderr);
  }

  exitedPromises.push(
    new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        resolve();
        if (!shuttingDown) {
          void shutdown(code ?? (signal ? 1 : 0));
        }
      });
    })
  );

  child.once('error', (error) => {
    process.stderr.write(`${spec.prefix}Failed to start: ${error.message}\n`);
    if (!shuttingDown) {
      void shutdown(1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

if (isWindows) {
  process.on('SIGBREAK', () => {
    void shutdown(0);
  });
}

process.on('exit', () => {
  for (const child of children) {
    killTreeSync(child, 'SIGKILL');
  }
});
