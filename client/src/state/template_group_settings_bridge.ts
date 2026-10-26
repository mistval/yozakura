import { SettingsBridge } from '../engine/settings/settings_bridge.js';
import type { TemplateGroupSettingsData } from '../engine/prompt_templates/template_types.js';
import { DEFAULT_TEMPLATE_GROUP_DATA } from '../engine/prompt_templates/default_template_group_data.js';
import { useSettingsStore } from './settings_store.js';

const EMPTY_GROUP_DATA: TemplateGroupSettingsData = {
  templateChains: {},
};

export function createTemplateGroupSettingsBridge(
  groupId: string
): SettingsBridge<TemplateGroupSettingsData> {
  const defaultData = DEFAULT_TEMPLATE_GROUP_DATA[groupId] ?? EMPTY_GROUP_DATA;

  return new SettingsBridge<TemplateGroupSettingsData>({
    get: () => useSettingsStore.getState().templateGroupData[groupId] ?? defaultData,
    getDefault: () => defaultData,
    use: (selector = (v) => v as any) => {
      return useSettingsStore((state) =>
        selector(state.templateGroupData[groupId] ?? defaultData)
      );
    },
    set: (groupPatch) => {
      useSettingsStore.getState().setSettings({
        templateGroupData: {
          [groupId]: groupPatch,
        },
      });
    },
  });
}
