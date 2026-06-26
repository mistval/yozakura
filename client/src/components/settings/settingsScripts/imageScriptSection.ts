import {
  getImageScriptOptions,
  resolveImageScript,
} from '../../../engine/settings/settings_scripts/image/image_scripts.js';
import { getImageScriptDocumentation } from '../../../engine/settings/settings_scripts/image/image_script_documentation.js';
import {
  resetScriptControlValues,
  setControlValue,
  setSelectedScriptId,
  useSettingsScriptSection,
} from '../../../engine/settings/settings_scripts/settings_scripts_store.js';
import { IMAGE_GENERATION_SECTION_ID } from '../../../engine/settings/settings_scripts/settings_scripts_state.js';
import type {
  ScriptSectionDescriptor,
  ScriptSelection,
} from '../../../engine/settings/settings_scripts/settings_script.js';

export const IMAGE_SCRIPT_DESCRIPTOR: ScriptSectionDescriptor = {
  sectionId: IMAGE_GENERATION_SECTION_ID,
  builtinOptions: getImageScriptOptions(),
  resolveScript: resolveImageScript,
  getDocumentation: getImageScriptDocumentation,
  documentationTitle: 'Custom Image Generation Script Documentation',
  selectLabel: 'Image Generation Provider',
  postSelectOpenHelpHtml: `Didn't see your provider?
    <a
      href="https://mistval.github.io/yozakura/docs/image-providers"
      target="_blank"
      rel="noreferrer"
      class="underline hover:text-primary"
    >Check here</a>.`,
};

export function useImageScriptSelection(): ScriptSelection {
  const section = useSettingsScriptSection(IMAGE_GENERATION_SECTION_ID);
  return {
    selectedScriptId: section.selectedScriptId,
    controlValues: section.controlValues[section.selectedScriptId] ?? {},
    onScriptSaved: () => {},
    onSelectScript: (id) => setSelectedScriptId(IMAGE_GENERATION_SECTION_ID, id),
    onSetControlValue: (controlId, value) =>
      setControlValue(IMAGE_GENERATION_SECTION_ID, section.selectedScriptId, controlId, value),
    onResetControlValues: () =>
      resetScriptControlValues(IMAGE_GENERATION_SECTION_ID, section.selectedScriptId),
  };
}
