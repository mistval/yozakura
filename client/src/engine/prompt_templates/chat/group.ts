import { TemplateGroup } from '../template_group';
import { moderationNextSpeakerTemplatesGroup } from './moderation_next_speaker';
import { memoryRagPromptTemplatesGroup } from './memory_rag_prompt';
import { chatSceneImageChainGroup } from './chat_scene_image';
import { chatSystemPromptChain } from './chat_system_prompt';

export const runtimeChatTemplatesGroup = new TemplateGroup({
  groupId: 'runtime_chat_templates',
  title: 'Conversation Templates',
  description: 'Templates used during conversations.',
  children: [
    chatSystemPromptChain,
    moderationNextSpeakerTemplatesGroup,
    chatSceneImageChainGroup,
    memoryRagPromptTemplatesGroup,
  ],
});
