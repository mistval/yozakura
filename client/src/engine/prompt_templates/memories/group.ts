import { createTemplateGroupSettingsBridge } from '../../../state/template_group_settings_bridge.js';
import { PromptTemplateChain } from '../prompt_template_chain.js';
import { TemplateGroup } from '../template_group.js';
import { MEMORIES_GROUP_ID } from '../template_types.js';
import { conversationRollingSummaryChainSpec } from './conversation_rolling_summary.js';
import { nextConversationGoalUpdatesChainSpec } from './next_conversation_goal_updates.js';
import { offscreenMemoryExtractionChainSpec } from './offscreen_memory_extraction.js';
import { offscreenMemoryUpdateConversationGoalChainSpec } from './offscreen_memory_update_conversation_goal.js';
import { relationshipDescriptorUpdateChainSpec } from './relationship_descriptor_update.js';
import { rollingGlobalMemoryRewriteChainSpec } from './rolling_global_memory_rewrite.js';
import { rollingPairwiseMemoryRewriteChainSpec } from './rolling_pairwise_memory_rewrite.js';

export { MEMORIES_GROUP_ID };

export const memoriesGroupBridge = createTemplateGroupSettingsBridge(MEMORIES_GROUP_ID);

export const conversationRollingSummaryChain = new PromptTemplateChain({
  ...conversationRollingSummaryChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const rollingGlobalMemoryRewriteChain = new PromptTemplateChain({
  ...rollingGlobalMemoryRewriteChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const rollingPairwiseMemoryRewriteChain = new PromptTemplateChain({
  ...rollingPairwiseMemoryRewriteChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const nextConversationGoalUpdatesChain = new PromptTemplateChain({
  ...nextConversationGoalUpdatesChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const relationshipDescriptorUpdateChain = new PromptTemplateChain({
  ...relationshipDescriptorUpdateChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const offscreenMemoryExtractionChain = new PromptTemplateChain({
  ...offscreenMemoryExtractionChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const offscreenMemoryUpdateConversationGoalChain = new PromptTemplateChain({
  ...offscreenMemoryUpdateConversationGoalChainSpec,
  groupSettingsBridge: memoriesGroupBridge,
});

export const memoriesGroup = new TemplateGroup({
  groupId: MEMORIES_GROUP_ID,
  title: 'Memory Processing',
  description: 'Prompts for updating memories after each chat ends.',
  settingsBridge: memoriesGroupBridge,
  chains: [
    conversationRollingSummaryChain,
    rollingGlobalMemoryRewriteChain,
    rollingPairwiseMemoryRewriteChain,
    nextConversationGoalUpdatesChain,
    relationshipDescriptorUpdateChain,
    offscreenMemoryExtractionChain,
    offscreenMemoryUpdateConversationGoalChain,
  ],
});
