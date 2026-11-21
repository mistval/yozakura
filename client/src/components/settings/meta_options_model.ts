import { llmMetaOptionsObjectSchema } from '../../engine/settings/cascading_llm_configs.js';
import { safeParseJson } from '../../util/json.js';

function asMetaOptionsObject(source: string): Record<string, unknown> {
  const result = llmMetaOptionsObjectSchema.safeParse(safeParseJson(source));
  return result.success ? result.data : {};
}

export function readModelFromMetaOptions(source: string): string {
  const model = asMetaOptionsObject(source).model;
  return typeof model === 'string' ? model : '';
}

export function writeModelToMetaOptions(source: string, model: string): string {
  const next = { ...asMetaOptionsObject(source), model: model || undefined };

  return JSON.stringify(next, null, 2);
}
