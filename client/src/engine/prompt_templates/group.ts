import { createTemplateGroupSettingsBridge } from '../../state/template_group_settings_bridge.js';
import { characterGenerationTemplatesGroup } from './character_generation/group.js';
import { runtimeChatTemplatesGroup } from './chat/group.js';
import { DEFAULT_TEMPLATE_GROUP_DATA } from './default_template_group_data.js';
import { memoriesGroup } from './memories/group.js';
import { TemplateGroup } from './template_group.js';
import { PROMPT_TEMPLATES_ROOT_GROUP_ID } from './template_types.js';

export { PROMPT_TEMPLATES_ROOT_GROUP_ID, DEFAULT_TEMPLATE_GROUP_DATA };

export const promptTemplatesRootBridge = createTemplateGroupSettingsBridge(
  PROMPT_TEMPLATES_ROOT_GROUP_ID
);

export const promptTemplatesRootGroup = new TemplateGroup({
  groupId: PROMPT_TEMPLATES_ROOT_GROUP_ID,
  title: 'Prompt Templates',
  description: 'Edit prompt templates used for prompting your LLM.',
  settingsBridge: promptTemplatesRootBridge,
  childGroups: [runtimeChatTemplatesGroup, memoriesGroup, characterGenerationTemplatesGroup],
});
