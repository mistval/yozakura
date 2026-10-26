import {
  chainSpecsToGroupDefaultData,
  CHARACTER_GENERATION_TEMPLATES_GROUP_ID,
  MEMORIES_GROUP_ID,
  PROMPT_TEMPLATES_ROOT_GROUP_ID,
  RUNTIME_CHAT_TEMPLATES_GROUP_ID,
  type TemplateGroupData,
} from './template_types.js';
import { baseAppearanceGenerationChainSpec } from './character_generation/base_appearance_generation.js';
import { characterDescriptionGenerationChainSpec } from './character_generation/character_description_generation.js';
import { exampleDialogueChainSpec } from './character_generation/example_dialogue.js';
import { externalDescriptionGenerationChainSpec } from './character_generation/external_description_generation.js';
import { extractCharacterDescriptionChainSpec } from './character_generation/extract_character_description.js';
import { wardrobeGenerationChainSpec } from './character_generation/wardrobe_generation.js';
import { chatSceneImageChainSpec } from './chat/chat_scene_image.js';
import { chatSystemPromptChainSpec } from './chat/chat_system_prompt.js';
import { conversationEndJudgeChainSpec } from './chat/conversation_end_judge.js';
import { memoryRagPromptChainSpec } from './chat/memory_rag_prompt.js';
import { moderationNextSpeakerChainSpec } from './chat/moderation_next_speaker.js';
import { conversationRollingSummaryChainSpec } from './memories/conversation_rolling_summary.js';
import { nextConversationGoalUpdatesChainSpec } from './memories/next_conversation_goal_updates.js';
import { offscreenMemoryExtractionChainSpec } from './memories/offscreen_memory_extraction.js';
import { offscreenMemoryUpdateConversationGoalChainSpec } from './memories/offscreen_memory_update_conversation_goal.js';
import { relationshipDescriptorUpdateChainSpec } from './memories/relationship_descriptor_update.js';
import { rollingGlobalMemoryRewriteChainSpec } from './memories/rolling_global_memory_rewrite.js';
import { rollingPairwiseMemoryRewriteChainSpec } from './memories/rolling_pairwise_memory_rewrite.js';

export const characterGenerationChainSpecs = [
  extractCharacterDescriptionChainSpec,
  exampleDialogueChainSpec,
  characterDescriptionGenerationChainSpec,
  externalDescriptionGenerationChainSpec,
  baseAppearanceGenerationChainSpec,
  wardrobeGenerationChainSpec,
];

export const runtimeChatChainSpecs = [
  chatSystemPromptChainSpec,
  moderationNextSpeakerChainSpec,
  conversationEndJudgeChainSpec,
  chatSceneImageChainSpec,
  memoryRagPromptChainSpec,
];

export const memoriesChainSpecs = [
  conversationRollingSummaryChainSpec,
  rollingGlobalMemoryRewriteChainSpec,
  rollingPairwiseMemoryRewriteChainSpec,
  nextConversationGoalUpdatesChainSpec,
  relationshipDescriptorUpdateChainSpec,
  offscreenMemoryExtractionChainSpec,
  offscreenMemoryUpdateConversationGoalChainSpec,
];

export const DEFAULT_TEMPLATE_GROUP_DATA: TemplateGroupData = {
  [PROMPT_TEMPLATES_ROOT_GROUP_ID]: {
    templateChains: {},
  },
  [CHARACTER_GENERATION_TEMPLATES_GROUP_ID]: chainSpecsToGroupDefaultData(characterGenerationChainSpecs),
  [RUNTIME_CHAT_TEMPLATES_GROUP_ID]: chainSpecsToGroupDefaultData(runtimeChatChainSpecs),
  [MEMORIES_GROUP_ID]: chainSpecsToGroupDefaultData(memoriesChainSpecs),
};
