import { getErrorMessage } from '../../../../errors/error_util.js';
import type { SettingsScriptSectionState } from '../settings_scripts_state.js';
import { baliTemporalScript } from './builtins/bali.js';
import { montpellierTemporalScript } from './builtins/montpellier.js';
import { newYorkTemporalScript } from './builtins/new_york.js';
import { saharaTemporalScript } from './builtins/sahara.js';
import { shizuokaTemporalScript } from './builtins/shizuoka.js';
import { stPetersburgTemporalScript } from './builtins/st_petersburg.js';
import { titanTemporalScript } from './builtins/titan.js';
import {
  DEFAULT_TEMPORAL_SCRIPT_ID,
  temporalContextSettingsScriptSchema,
  type TemporalContextBuiltInSettingsScript,
  type TemporalContextSettingsScript,
} from './temporal_script_types.js';

export function createDefaultTemporalSectionState(): SettingsScriptSectionState {
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  return {
    selectedScriptId: DEFAULT_TEMPORAL_SCRIPT_ID,
    controlValues: { [DEFAULT_TEMPORAL_SCRIPT_ID]: { startDate } },
  };
}

export const BUILTIN_TEMPORAL_SCRIPTS: TemporalContextBuiltInSettingsScript[] = [
  baliTemporalScript,
  newYorkTemporalScript,
  montpellierTemporalScript,
  saharaTemporalScript,
  shizuokaTemporalScript,
  stPetersburgTemporalScript,
  titanTemporalScript,
];

export function getBuiltinTemporalScript(scriptId: string): TemporalContextSettingsScript | undefined {
  return BUILTIN_TEMPORAL_SCRIPTS.find((script) => script.id === scriptId);
}

export function getTemporalScriptOptions(): Array<{ value: string; label: string }> {
  return BUILTIN_TEMPORAL_SCRIPTS.map((script) => ({ value: script.id, label: script.name }));
}

export function validateTemporalContextSettingsScript(candidate: unknown): TemporalContextSettingsScript {
  const parsed = temporalContextSettingsScriptSchema.parse(candidate);

  if (typeof parsed.getTemporalContext !== 'function') {
    throw new Error('A temporal context script must export a `getTemporalContext` function.');
  }

  if (parsed.controls !== undefined && typeof parsed.controls !== 'function') {
    throw new Error('`controls` must be a function.');
  }

  return parsed as TemporalContextSettingsScript;
}

export function evaluateCustomTemporalScript(source: string): TemporalContextSettingsScript {
  const factory = new Function(`return (${source});`);
  const candidate: unknown = factory();
  return validateTemporalContextSettingsScript(candidate);
}

export type ResolvedTemporalScript =
  | { ok: true; script: TemporalContextSettingsScript }
  | { ok: false; error: string };

export function resolveTemporalScript(selectedScriptId: string, source: string): ResolvedTemporalScript {
  const builtin = getBuiltinTemporalScript(selectedScriptId);
  if (builtin) {
    return { ok: true, script: builtin };
  }

  if (!source.trim()) {
    return { ok: false, error: 'Enter a custom script to configure the temporal context.' };
  }

  try {
    return { ok: true, script: evaluateCustomTemporalScript(source) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
