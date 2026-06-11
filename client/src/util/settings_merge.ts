import merge from 'deepmerge';
import { diff } from 'deep-object-diff';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K] | null
    : T[K] extends Record<string, unknown>
      ? DeepPartial<T[K]> | null
      : T[K] | null;
};

const MERGE_OPTIONS = {
  arrayMerge: (_existing: unknown[], incoming: unknown[]) => incoming,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyNullDeletions(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === null) {
      delete target[key];
      continue;
    }

    const targetValue = target[key];
    if (isRecord(patchValue) && isRecord(targetValue)) {
      applyNullDeletions(targetValue, patchValue);
    }
  }
}

function sanitizeDiffForStorage(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    sanitized[key] = sanitizeDiffForStorage(child);
  }

  return sanitized;
}

export function applyPatch<T extends Record<string, unknown>>(current: T, patch: DeepPartial<T>): T {
  const merged = merge(current, patch as Partial<T>, MERGE_OPTIONS) as T;
  applyNullDeletions(merged, patch);

  return merged;
}

export function computeOverrides<T extends Record<string, unknown>>(defaults: T, current: T): DeepPartial<T> {
  return sanitizeDiffForStorage(diff(defaults, current)) as DeepPartial<T>;
}

export function applyOverrides<T extends Record<string, unknown>>(defaults: T, overrides: DeepPartial<T>): T {
  const merged = merge(defaults, overrides as Partial<T>, MERGE_OPTIONS) as T;
  applyNullDeletions(merged, overrides);

  return merged;
}

export function loadStoredRecord(
  storageKey: string,
  storage: Pick<Storage, 'getItem'> = localStorage
): Record<string, unknown> {
  const stored = storage.getItem(storageKey);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}
