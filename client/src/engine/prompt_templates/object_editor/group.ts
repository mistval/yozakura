import { createTemplateGroupSettingsBridge } from '../../../state/template_group_settings_bridge.js';
import { PromptTemplateChain } from '../prompt_template_chain.js';
import { TemplateGroup } from '../template_group.js';
import { OBJECT_EDITOR_TEMPLATES_GROUP_ID } from '../template_types.js';
import { objectEditorPromptChainSpec } from './object_editor_prompt.js';

export { OBJECT_EDITOR_TEMPLATES_GROUP_ID };

export const objectEditorTemplatesBridge = createTemplateGroupSettingsBridge(
  OBJECT_EDITOR_TEMPLATES_GROUP_ID
);

export const objectEditorPromptChain = new PromptTemplateChain({
  ...objectEditorPromptChainSpec,
  groupSettingsBridge: objectEditorTemplatesBridge,
});

export const objectEditorTemplatesGroup = new TemplateGroup({
  groupId: OBJECT_EDITOR_TEMPLATES_GROUP_ID,
  title: 'Object Editor',
  description: 'Templates used by the AI Object Editor assistant.',
  settingsBridge: objectEditorTemplatesBridge,
  chains: [objectEditorPromptChain],
});
