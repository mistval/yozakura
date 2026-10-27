import { createTemplateGroupSettingsBridge } from '../../../state/template_group_settings_bridge.js';
import { PromptTemplateChain } from '../prompt_template_chain.js';
import { TemplateGroup } from '../template_group.js';
import {
  CHAT_SCENE_IMAGE_TEMPLATES_GROUP_ID,
  RUNTIME_CHAT_TEMPLATES_GROUP_ID,
  type TemplateGroupSettingsData,
} from '../template_types.js';
import {
  chatSceneImageSceneryChainSpec,
  chatSceneImageSpeakerCloseUpChainSpec,
  createChatSceneImageChainSpec,
  DEFAULT_CHAT_SCENE_IMAGE_CHAIN_ID,
} from './chat_scene_image.js';
import { chatSystemPromptChainSpec } from './chat_system_prompt.js';
import { conversationEndJudgeChainSpec } from './conversation_end_judge.js';
import { memoryRagPromptChainSpec } from './memory_rag_prompt.js';
import { moderationNextSpeakerChainSpec } from './moderation_next_speaker.js';
import { newId } from '../../../util/id.js';
import type { SettingsBridge } from '../../settings/settings_bridge.js';

export { CHAT_SCENE_IMAGE_TEMPLATES_GROUP_ID, RUNTIME_CHAT_TEMPLATES_GROUP_ID };

export const runtimeChatTemplatesBridge = createTemplateGroupSettingsBridge(RUNTIME_CHAT_TEMPLATES_GROUP_ID);

export const chatSceneImageTemplatesBridge = createTemplateGroupSettingsBridge(
  CHAT_SCENE_IMAGE_TEMPLATES_GROUP_ID
);

export const instantiateChatSceneImageChain = ({
  chainId = `${DEFAULT_CHAT_SCENE_IMAGE_CHAIN_ID}.${newId()}`,
  groupSettingsBridge,
}: {
  chainId?: string;
  groupSettingsBridge: SettingsBridge<TemplateGroupSettingsData>;
}) =>
  new PromptTemplateChain({
    ...createChatSceneImageChainSpec(chainId),
    groupSettingsBridge,
  });

export const chatSceneImageChain = instantiateChatSceneImageChain({
  chainId: DEFAULT_CHAT_SCENE_IMAGE_CHAIN_ID,
  groupSettingsBridge: chatSceneImageTemplatesBridge,
});

export const chatSceneImageSpeakerCloseUpChain = new PromptTemplateChain({
  ...chatSceneImageSpeakerCloseUpChainSpec,
  groupSettingsBridge: chatSceneImageTemplatesBridge,
});

export const chatSceneImageSceneryChain = new PromptTemplateChain({
  ...chatSceneImageSceneryChainSpec,
  groupSettingsBridge: chatSceneImageTemplatesBridge,
});

export const chatSceneImageTemplatesGroup = new TemplateGroup({
  groupId: CHAT_SCENE_IMAGE_TEMPLATES_GROUP_ID,
  title: 'Chat Scene Image Generation',
  description: 'Templates used to generate scene image prompts during conversations.',
  settingsBridge: chatSceneImageTemplatesBridge,
  chains: [chatSceneImageChain, chatSceneImageSpeakerCloseUpChain, chatSceneImageSceneryChain],
  chainInstantiator: instantiateChatSceneImageChain,
});

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

export const memoryRagPromptTemplatesChain = new PromptTemplateChain({
  ...memoryRagPromptChainSpec,
  groupSettingsBridge: runtimeChatTemplatesBridge,
});

export const runtimeChatTemplatesGroup = new TemplateGroup({
  groupId: RUNTIME_CHAT_TEMPLATES_GROUP_ID,
  title: 'Conversation Templates',
  description: 'Templates used during conversations.',
  settingsBridge: runtimeChatTemplatesBridge,
  childGroups: [chatSceneImageTemplatesGroup],
  chains: [
    chatSystemPromptChain,
    moderationNextSpeakerTemplatesChain,
    conversationEndJudgeTemplatesChain,
    memoryRagPromptTemplatesChain,
  ],
});
