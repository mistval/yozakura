import { TemplateGroup } from '../template_group';
import { offscreenMemoryExtractionChain } from './offscreen_memory_extraction';
import { offscreenMemoryUpdateConversationGoalChain } from './offscreen_memory_update_conversation_goal';
import { conversationRollingSummaryChain } from './conversation_rolling_summary';
import { rollingGlobalMemoryRewriteChain } from './rolling_global_memory_rewrite';
import { rollingPairwiseMemoryRewriteChain } from './rolling_pairwise_memory_rewrite';
import { nextConversationGoalUpdatesChain } from './next_conversation_goal_updates';
import { relationshipDescriptorUpdateChain } from './relationship_descriptor_update';

export const memoriesGroup = new TemplateGroup({
  groupId: 'memories',
  title: 'Memory Processing',
  description: 'Prompts for updating memories after each chat ends.',
  children: [
    conversationRollingSummaryChain,
    rollingGlobalMemoryRewriteChain,
    rollingPairwiseMemoryRewriteChain,
    nextConversationGoalUpdatesChain,
    relationshipDescriptorUpdateChain,
    offscreenMemoryExtractionChain,
    offscreenMemoryUpdateConversationGoalChain,
  ],
});
