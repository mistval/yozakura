import _ from 'lodash';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K] | null
    : T[K] extends Record<string, unknown>
      ? DeepPartial<T[K]> | null
      : T[K] | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyMergePatchValue(target: unknown, patch: unknown): unknown {
  if (!isRecord(patch)) return patch;

  const result: Record<string, unknown> = isRecord(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (value === null || value === undefined) {
      delete result[key];
    } else {
      result[key] = applyMergePatchValue(result[key], value);
    }
  }
  return result;
}

function computeMergePatch(
  defaults: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(defaults), ...Object.keys(current)])) {
    const defaultVal = Object.hasOwn(defaults, key) ? defaults[key] : undefined;
    const currentVal = Object.hasOwn(current, key) ? current[key] : undefined;
    if (defaultVal === undefined && currentVal === undefined) continue;
    if (currentVal === undefined) {
      patch[key] = null;
    } else if (isRecord(defaultVal) && isRecord(currentVal)) {
      const child = computeMergePatch(defaultVal, currentVal);
      if (Object.keys(child).length > 0) patch[key] = child;
    } else if (!_.isEqual(defaultVal, currentVal)) {
      patch[key] = isRecord(currentVal) ? applyMergePatchValue({}, currentVal) : currentVal;
    }
  }
  return patch;
}

export function buildObjectReplacementPatch<T extends Record<string, unknown>>(
  prev: T | undefined,
  next: T
): DeepPartial<T> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(prev ?? {})) {
    if (!Object.hasOwn(next, key) || next[key] === undefined) patch[key] = null;
  }
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) patch[key] = value;
  }
  return patch as DeepPartial<T>;
}

export function applyPatch<T extends Record<string, unknown>>(current: T, patch: DeepPartial<T>): T {
  return applyMergePatchValue(current, patch) as T;
}

export function computeOverrides<T extends Record<string, unknown>>(defaults: T, current: T): DeepPartial<T> {
  return computeMergePatch(defaults, current) as DeepPartial<T>;
}

export const applyOverrides = applyPatch;
