import z from 'zod';
import type {
  SettingsControlValues,
  SettingsScriptControlsDefinition,
  SettingsScriptHelpers,
} from '../settings_script.js';

export const TEMPORAL_CONTEXT_SECTION_ID = 'temporalContext';
export const DEFAULT_TEMPORAL_SCRIPT_ID = 'bali-weather';

export type TemporalContextRequest = { scenario: { turnNumber: number; id: string } };

export type TemporalContext = {
  displayHtml: string;
  plainText: string;
  dayIndex?: number | undefined;
};

export const temporalContextSettingsScriptSchema = z.object({
  name: z.string().meta({
    description: 'The display name of the temporal context provider (e.g. "New York").',
  }),
  description: z.string().optional().meta({
    description:
      'A short human-readable description of what this temporal context provider does. Shown in the settings UI.',
  }),
  controls: z.any().optional().meta({
    description:
      'A function `(context) => controls[]` returning the controls to render in the settings UI. The user-entered value of each control is passed to getTemporalContext keyed by control id.',
  }),
  getTemporalContext: z.any().meta({
    description:
      'Async function `(controlValues, request, helpers)` returning `{ displayHtml, plainText, dayIndex? }`. `request` is `{ turnNumber }`. `displayHtml` is shown in the scenario header (may contain HTML). `plainText` is injected into prompts. `dayIndex` is an integer that increments once per in-world day; when it changes, characters re-roll their daily auto-select wardrobes. `helpers` is `{ proxiedFetch, abortSignal, createSeededRandom }`; `createSeededRandom(seed)` returns a deterministic `() => number` in [0, 1) so the same input always produces the same output.',
  }),
});

export const temporalContextSettingsScriptJSONSchema = temporalContextSettingsScriptSchema.toJSONSchema();

export type TemporalContextSettingsScript = z.infer<typeof temporalContextSettingsScriptSchema> & {
  controls?: SettingsScriptControlsDefinition | undefined;
  getTemporalContext: (
    controlValues: SettingsControlValues,
    request: TemporalContextRequest,
    helpers: SettingsScriptHelpers
  ) => Promise<TemporalContext>;
};

export type TemporalContextBuiltInSettingsScript = TemporalContextSettingsScript & {
  id: string;
};
