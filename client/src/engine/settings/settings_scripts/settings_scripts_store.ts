import { useSettingsStore } from '../../../state/settings_store.js';
import type {
  ControlsContext,
  SettingsControlValues,
  SettingsScriptControl,
  SettingsScriptControlsDefinition,
} from './settings_script.js';
import type { SettingsScriptSectionState } from './settings_scripts_state.js';

const EMPTY_SECTION_STATE: SettingsScriptSectionState = {
  selectedScriptId: '',
  controlValues: {},
};

export function useSettingsScriptSection(sectionId: string): SettingsScriptSectionState {
  return useSettingsStore((s) => s.settingsScripts[sectionId] ?? EMPTY_SECTION_STATE);
}

export function getSettingsScriptSection(sectionId: string): SettingsScriptSectionState {
  return useSettingsStore.getState().settingsScripts[sectionId] ?? EMPTY_SECTION_STATE;
}

export function setSelectedScriptId(sectionId: string, scriptId: string): void {
  useSettingsStore.getState().setSettings({
    settingsScripts: { [sectionId]: { selectedScriptId: scriptId } },
  });
}

export function setControlValue(sectionId: string, scriptId: string, controlId: string, value: string): void {
  useSettingsStore.getState().setSettings({
    settingsScripts: { [sectionId]: { controlValues: { [scriptId]: { [controlId]: value } } } },
  });
}

export function resetScriptControlValues(sectionId: string, scriptId: string): void {
  useSettingsStore.getState().setSettings({
    settingsScripts: { [sectionId]: { controlValues: { [scriptId]: null } } },
  });
}

export function getControlDefault(control: SettingsScriptControl): string {
  if (control.type === 'button') {
    return '';
  }

  if (control.type === 'dropdown_select') {
    return control.default ?? control.options[0]?.value ?? '';
  }

  return control.default ?? '';
}

export function resolveControlValues(
  controls: SettingsScriptControl[] | undefined,
  storedValues: Record<string, string> | undefined
): SettingsControlValues {
  const values: SettingsControlValues = {};
  for (const control of controls ?? []) {
    if (control.type === 'button') {
      continue;
    }

    values[control.id] = storedValues?.[control.id] ?? getControlDefault(control);
  }
  return values;
}

export function resolveControls(
  controls: SettingsScriptControlsDefinition | undefined,
  context: ControlsContext
): SettingsScriptControl[] {
  if (!controls) {
    return [];
  }
  try {
    return controls(context) ?? [];
  } catch {
    return [];
  }
}
