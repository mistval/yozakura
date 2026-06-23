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
import { TEMPORAL_CONTEXT_SECTION_ID } from '../engine/settings/settings_scripts/temporal/temporal_script_types.js';
import { useScenarioStore } from './scenario_store.js';

type TemporalContextStoreState = {
  displayHtml: string;
  plainText: string;
  dayIndex: number | undefined;
  recompute: () => Promise<void>;
  reset: () => void;
};

const EMPTY = { displayHtml: '', plainText: '', dayIndex: undefined };

export const useTemporalContextStore = create<TemporalContextStoreState>((set) => ({
  ...EMPTY,

  reset: () => set(EMPTY),

  recompute: async () => {
    const scenario = useScenarioStore.getState().activeScenario;
    if (!scenario) {
      set(EMPTY);
      return;
    }

    const section = scenario.temporalContext;
    const source = getBuiltinTemporalScript(section.selectedScriptId)
      ? ''
      : ((await loadCustomScriptSource(TEMPORAL_CONTEXT_SECTION_ID, section.selectedScriptId)) ?? '');

    const resolved = resolveTemporalScript(section.selectedScriptId, source);
    if (!resolved.ok) {
      set(EMPTY);
      return;
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

    try {
      const result = await resolved.script.getTemporalContext(controlValues, { scenario }, helpers);

      if (useScenarioStore.getState().activeScenario?.id !== scenario.id) {
        return;
      }

      set({ displayHtml: result.displayHtml, plainText: result.plainText, dayIndex: result.dayIndex });
    } catch {
      set(EMPTY);
    }
  },
}));
