import { z } from 'zod';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const rollingPairwiseMemoryRewriteChainSpec: PromptTemplateChainSpec<
  z.infer<typeof targetedConversationExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_pairwise_memory',
  defaultTitle: 'Pairwise Memory Rewrite',
  defaultDescription:
    "Prompts for re-writing a character's pairwise memory after each conversation, based on direct and offscreen evidence.",
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    {
      templateId: 'rolling_pairwise_memory_rewrite_system',
      name: 'Rolling Pairwise Memory Rewrite (System)',
      description: 'System prompt for distilling pairwise relationship memory from summaries and hearsay.',
      role: 'system',
      defaultTemplateString: `Your job is to read a list of past interaction summaries and use it to synthesize a consistent internal memory state for <%= it.focusedCharacter.firstName %> to bring into their future interactions with <%= it.targetCharacter.firstName %>. You will also have access to <%= it.focusedCharacter.firstName %>'s existing internal memory state, persona information, and immediate goal in their next interaction with <%= it.targetCharacter.firstName %>.

Consider not only what happened, but the order it happened in, and how it shows evolution or insights into <%= it.focusedCharacter.firstName %>'s relationship with <%= it.targetCharacter.firstName %> and their goals towards <%= it.targetCharacter.firstName %>.

The purpose of the new internal memory state will be to inform the behavior of a roleplayer who will roleplay as <%= it.focusedCharacter.firstName %> in future interactions with <%= it.targetCharacter.firstName %>. Consider what information the roleplayer should know in order to accurately simulate <%= it.focusedCharacter.firstName %> in future interactions with <%= it.targetCharacter.firstName %>.

The existing internal memory state that will be provided was previously generated based on an older version of the same rolling list of recent interaction summaries.

Rules:
- Prioritize actionable information that can be used to guide <%= it.focusedCharacter.firstName %>'s future behavior towards <%= it.targetCharacter.firstName %>.
- Reference <%= it.focusedCharacter.firstName %>'s persona to guide prioritization and emotional valence.
- Only include experientially earned information that is distinct from <%= it.focusedCharacter.firstName %>'s persona information (the roleplayer will be provided the persona information separately).
- Provide sufficient context and reasoning for any goals or intentions.
- Newer (bottom-most) conversation summaries should be weighted more heavily.
- Output only the new internal memory state (no more than 1000 words), nothing else.`,
    },
    {
      templateId: 'rolling_pairwise_memory_rewrite_user',
      name: 'Rolling Pairwise Memory Rewrite (User)',
      description: 'User prompt carrying existing memory and recent pairwise information stream.',
      role: 'user',
      defaultTemplateString: `<%= it.focusedCharacter.firstName %>'s persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

<%= it.focusedCharacter.firstName %>'s existing internal memory state towards <%= it.targetCharacter.firstName %> (this is what you need to output a new version of):
<existing_memory>
<%= it.targetCharacterRelationship.memory || (it.focusedCharacter.firstName + ' has no memories about ' + it.targetCharacter.firstName + ' yet.') %>

</existing_memory>

Recent summarized interactions with and information about <%= it.targetCharacter.firstName %> from <%= it.focusedCharacter.firstName %>'s perspective (oldest first):
<%= it.targetCharacterFormattedRollingMemoriesText %>


<%= it.focusedCharacter.firstName %> goal towards <%= it.targetCharacter.firstName %> in their next interaction:
<goal>
<%= it.targetCharacterRelationship.nextConversationGoal || 'No goal is set' %>

</goal>


Output the updated internal memory state for <%= it.focusedCharacter.firstName %> to bring into future interactions with <%= it.targetCharacter.firstName %>.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
