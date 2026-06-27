import { useScenarioStore } from '../../../state/scenario_store.js';
import { useTemporalContextStore } from '../../../state/temporal_context_store.js';
import {
  getTemporalScriptOptions,
  resolveTemporalScript,
} from '../../../engine/settings/settings_scripts/temporal/temporal_scripts.js';
import { getTemporalScriptDocumentation } from '../../../engine/settings/settings_scripts/temporal/temporal_script_documentation.js';
import { TEMPORAL_CONTEXT_SECTION_ID } from '../../../engine/settings/settings_scripts/temporal/temporal_script_types.js';
import type {
  ScriptSectionDescriptor,
  ScriptSelection,
} from '../../../engine/settings/settings_scripts/settings_script.js';

export const TEMPORAL_SCRIPT_DESCRIPTOR: ScriptSectionDescriptor = {
  sectionId: TEMPORAL_CONTEXT_SECTION_ID,
  builtinOptions: getTemporalScriptOptions(),
  resolveScript: resolveTemporalScript,
  getDocumentation: getTemporalScriptDocumentation,
  documentationTitle: 'Custom Temporal Context Script Documentation',
  enableCustom: true,
};

export function useTemporalScriptSelection(): ScriptSelection {
  const temporalSection = useScenarioStore((state) => state.activeScenario?.temporalContext);
  const setTemporalSelectedScriptId = useScenarioStore((state) => state.setTemporalSelectedScriptId);
  const setTemporalControlValue = useScenarioStore((state) => state.setTemporalControlValue);
  const resetTemporalControlValues = useScenarioStore((state) => state.resetTemporalControlValues);
  const recompute = useTemporalContextStore((state) => state.computeAndSet);

  const selectedScriptId = temporalSection?.selectedScriptId ?? '';
  return {
    selectedScriptId,
    controlValues: temporalSection?.controlValues[selectedScriptId] ?? {},
    onScriptSaved: () => {
      void recompute({ forceRecompute: true });
    },
    onSelectScript: (id) => {
      setTemporalSelectedScriptId(id);
      void recompute({ forceRecompute: true });
    },
    onSetControlValue: (controlId, value) => {
      setTemporalControlValue(selectedScriptId, controlId, value);
      void recompute({ forceRecompute: true });
    },
    onResetControlValues: () => {
      resetTemporalControlValues(selectedScriptId);
      void recompute({ forceRecompute: true });
    },
  };
}
