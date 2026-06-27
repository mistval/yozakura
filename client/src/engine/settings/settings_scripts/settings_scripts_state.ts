import z from 'zod';

export const IMAGE_GENERATION_SECTION_ID = 'imageGeneration';
export const DEFAULT_IMAGE_SCRIPT_ID = 'automatic1111';

export function makeTextFileGroupKey(sectionId: string, scriptId: string, controlId: string): string {
  return `${sectionId}::${scriptId}::${controlId}`;
}

export function customScriptGroupKey(sectionId: string): string {
  return `customScript::${sectionId}`;
}

export const settingsScriptSectionStateSchema = z.object({
  selectedScriptId: z.string(),
  controlValues: z.record(z.string(), z.record(z.string(), z.string())),
});

export type SettingsScriptSectionState = z.infer<typeof settingsScriptSectionStateSchema>;

export const settingsScriptsStateSchema = z.record(z.string(), settingsScriptSectionStateSchema);

export type SettingsScriptsState = z.infer<typeof settingsScriptsStateSchema>;

export const DEFAULT_SETTINGS_SCRIPTS_STATE: SettingsScriptsState = {
  [IMAGE_GENERATION_SECTION_ID]: {
    selectedScriptId: DEFAULT_IMAGE_SCRIPT_ID,
    controlValues: {},
  },
};
