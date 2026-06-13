import { safeParseJson } from '../../util/json.js';

function asMetaOptionsObject(source: string): Record<string, unknown> {
  const parsed = safeParseJson(source);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function readModelFromMetaOptions(source: string): string {
  const model = asMetaOptionsObject(source).model;
  return typeof model === 'string' ? model : '';
}

export function writeModelToMetaOptions(source: string, model: string): string {
  const next = { ...asMetaOptionsObject(source), model: model || undefined };

  return JSON.stringify(next, null, 2);
}
