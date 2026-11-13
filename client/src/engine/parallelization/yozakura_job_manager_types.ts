export const DEFAULT_LLM_PARALLELISM_GROUP = 'default_llm';
export const IMAGE_GENERATION_PARALLELISM_GROUP = 'image_generation';

export const ChatJobTags = {
  chatJob: 'chat_job',
  abortOnPause: 'abort_on_pause',
  processingMemories: 'processing_memories',
  characterIsSpeaking: 'character_speaking',
  selectingSpeaker: 'selecting_speaker',
  judgingConversationEnd: 'judging_conversation_end',
  generatingImage: 'generating_image',
  generatingImagePrompt: 'generating_image_prompt',
  finalizingChat: 'finalizing_chat',
} as const;

export type ChatJobTag = (typeof ChatJobTags)[keyof typeof ChatJobTags];
