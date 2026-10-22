import { TemplateGroup } from '../template_group';
import { moderationNextSpeakerTemplatesChain } from './moderation_next_speaker';
import { conversationEndJudgeTemplatesChain } from './conversation_end_judge';
import { memoryRagPromptTemplatesChain } from './memory_rag_prompt';
import { chatSceneImageChain } from './chat_scene_image';
import { chatSystemPromptChain } from './chat_system_prompt';

export const runtimeChatTemplatesGroup = new TemplateGroup({
  groupId: 'runtime_chat_templates',
  title: 'Conversation Templates',
  description: 'Templates used during conversations.',
  children: [
    chatSystemPromptChain,
    moderationNextSpeakerTemplatesChain,
    conversationEndJudgeTemplatesChain,
    chatSceneImageChain,
    memoryRagPromptTemplatesChain,
  ],
});
