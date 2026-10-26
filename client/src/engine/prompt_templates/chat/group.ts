import { createTemplateGroupSettingsBridge } from '../../../state/template_group_settings_bridge.js';
import { PromptTemplateChain } from '../prompt_template_chain.js';
import { TemplateGroup } from '../template_group.js';
import { RUNTIME_CHAT_TEMPLATES_GROUP_ID } from '../template_types.js';
import { chatSceneImageChainSpec } from './chat_scene_image.js';
import { chatSystemPromptChainSpec } from './chat_system_prompt.js';
import { conversationEndJudgeChainSpec } from './conversation_end_judge.js';
import { memoryRagPromptChainSpec } from './memory_rag_prompt.js';
import { moderationNextSpeakerChainSpec } from './moderation_next_speaker.js';

export { RUNTIME_CHAT_TEMPLATES_GROUP_ID };

export const runtimeChatTemplatesBridge = createTemplateGroupSettingsBridge(
  RUNTIME_CHAT_TEMPLATES_GROUP_ID
);

export const chatSystemPromptChain = new PromptTemplateChain({
  ...chatSystemPromptChainSpec,
  groupSettingsBridge: runtimeChatTemplatesBridge,
});

export const moderationNextSpeakerTemplatesChain = new PromptTemplateChain({
  ...moderationNextSpeakerChainSpec,
  groupSettingsBridge: runtimeChatTemplatesBridge,
});

export const conversationEndJudgeTemplatesChain = new PromptTemplateChain({
  ...conversationEndJudgeChainSpec,
  groupSettingsBridge: runtimeChatTemplatesBridge,
});

export const chatSceneImageChain = new PromptTemplateChain({
  ...chatSceneImageChainSpec,
  groupSettingsBridge: runtimeChatTemplatesBridge,
});

export const memoryRagPromptTemplatesChain = new PromptTemplateChain({
  ...memoryRagPromptChainSpec,
  groupSettingsBridge: runtimeChatTemplatesBridge,
});

export const runtimeChatTemplatesGroup = new TemplateGroup({
  groupId: RUNTIME_CHAT_TEMPLATES_GROUP_ID,
  title: 'Conversation Templates',
  description: 'Templates used during conversations.',
  settingsBridge: runtimeChatTemplatesBridge,
  chains: [
    chatSystemPromptChain,
    moderationNextSpeakerTemplatesChain,
    conversationEndJudgeTemplatesChain,
    chatSceneImageChain,
    memoryRagPromptTemplatesChain,
  ],
});
