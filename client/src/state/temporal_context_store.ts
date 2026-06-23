import { create } from 'zustand';
import { createProxiedFetch } from '../backend_bridge/proxied_fetch.js';
import { loadUserTextFileContent } from '../backend_bridge/database.js';
import type { SettingsScriptHelpers } from '../engine/settings/settings_scripts/settings_script.js';
import { createSeededRandom } from '../engine/settings/settings_scripts/seeded_random.js';
import { loadCustomScriptSource } from '../engine/settings/settings_scripts/custom_scripts.js';
import { makeTextFileGroupKey } from '../engine/settings/settings_scripts/settings_scripts_state.js';
import {
  resolveControls,
  resolveControlValues,
} from '../engine/settings/settings_scripts/settings_scripts_store.js';
import {
  getBuiltinTemporalScript,
  resolveTemporalScript,
} from '../engine/settings/settings_scripts/temporal/temporal_scripts.js';
import {
  TEMPORAL_CONTEXT_SECTION_ID,
  type TemporalContext,
} from '../engine/settings/settings_scripts/temporal/temporal_script_types.js';
import { useScenarioStore } from './scenario_store.js';
import { runWithInteractiveRetry } from '../engine/interative_retry.js';
import type { Scenario } from '../engine/types.js';

type TemporalContextStoreState = {
  displayHtml: string;
  plainText: string;
  dayIndex: number | undefined;
  compute: (scenario: Scenario) => Promise<TemporalContext | undefined>;
  computeAndSet: () => Promise<TemporalContextStoreState>;
  reset: () => void;
};

const EMPTY = { displayHtml: '', plainText: '', dayIndex: undefined };

export const useTemporalContextStore = create<TemporalContextStoreState>((set, get) => ({
  ...EMPTY,

  reset: () => set(EMPTY),

  compute: async (scenario: Scenario) => {
    const section = scenario.temporalContext;
    const source = getBuiltinTemporalScript(section.selectedScriptId)
      ? ''
      : ((await loadCustomScriptSource(TEMPORAL_CONTEXT_SECTION_ID, section.selectedScriptId)) ?? '');

    const resolved = resolveTemporalScript(section.selectedScriptId, source);
    if (!resolved.ok) {
      return undefined;
    }

    const stored = section.controlValues[section.selectedScriptId] ?? {};
    const controls = resolveControls(resolved.script.controls, { controlValues: stored, buttonData: {} });
    const controlValues = resolveControlValues(controls, stored);

    const helpers: SettingsScriptHelpers = {
      proxiedFetch: createProxiedFetch(undefined),
      abortSignal: undefined,
      loadUserTextFile: (controlId, fileId) =>
        loadUserTextFileContent(
          makeTextFileGroupKey(TEMPORAL_CONTEXT_SECTION_ID, section.selectedScriptId, controlId),
          fileId
        ),
      createSeededRandom,
    };

    return runWithInteractiveRetry({
      operationType: 'temporal_context.compute',
      run: async () => {
        const result = await resolved.script.getTemporalContext(controlValues, { scenario }, helpers);
        return result;
      },
    });
  },

  computeAndSet: async () => {
    const scenario = useScenarioStore.getState().activeScenario;
    if (!scenario) {
      set(EMPTY);
      return get();
    }

    const result = await get().compute(scenario);
    const newScenario = useScenarioStore.getState().activeScenario;
    if (!result || newScenario?.id !== scenario.id) {
      set(EMPTY);
      return get();
    }

    set({ displayHtml: result.displayHtml, plainText: result.plainText, dayIndex: result.dayIndex });
    return get();
  },
}));
