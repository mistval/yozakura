import path from 'path';
import express from 'express';

function toAbsolutePath(targetPath: string): string {
  return path.resolve(targetPath);
}

export function resolvePathWithinBase(baseDir: string, unsafePath = '') {
  const resolvedBase = toAbsolutePath(baseDir);
  const resolvedTarget = toAbsolutePath(path.resolve(resolvedBase, unsafePath));

  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal rejected');
  }

  return {
    resolvedBase,
    resolvedTarget,
  };
}

export function guardPathWithinBase(baseDir: string, unsafePath: unknown): string {
  if (typeof unsafePath !== 'string' || !unsafePath.trim()) {
    throw new Error('path must be a non-empty string');
  }

  const { resolvedBase, resolvedTarget } = resolvePathWithinBase(baseDir, unsafePath.trim());
  if (resolvedTarget === resolvedBase) {
    throw new Error('Refusing to operate on data root');
  }

  return resolvedTarget;
}

export function resolveDiskPath(req: express.Request, dataDir: string): string {
  const wildcardParam = req.params[0];
  const relPath = Array.isArray(wildcardParam) ? (wildcardParam[0] ?? '') : (wildcardParam ?? '');
  const resolved = guardPathWithinBase(dataDir, relPath);
  return resolved;
}
