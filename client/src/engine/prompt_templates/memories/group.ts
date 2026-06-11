import { TemplateGroup } from '../template_group';
import { offscreenMemoryExtractionChainGroup } from './offscreen_memory_extraction';
import { offscreenMemoryUpdateConversationGoalChainGroup } from './offscreen_memory_update_conversation_goal';
import { conversationRollingSummaryChainGroup } from './conversation_rolling_summary';
import { rollingGlobalMemoryRewriteChainGroup } from './rolling_global_memory_rewrite';
import { rollingPairwiseMemoryRewriteChainGroup } from './rolling_pairwise_memory_rewrite';
import { nextConversationGoalUpdatesChainGroup } from './next_conversation_goal_updates';
import { relationshipDescriptorUpdateChainGroup } from './relationship_descriptor_update';

export const memoriesGroup = new TemplateGroup({
  groupId: 'memories',
  title: 'Memory Processing',
  description: 'Prompts for updating memories after each chat ends.',
  children: [
    conversationRollingSummaryChainGroup,
    rollingGlobalMemoryRewriteChainGroup,
    rollingPairwiseMemoryRewriteChainGroup,
    nextConversationGoalUpdatesChainGroup,
    relationshipDescriptorUpdateChainGroup,
    offscreenMemoryExtractionChainGroup,
    offscreenMemoryUpdateConversationGoalChainGroup,
  ],
});
