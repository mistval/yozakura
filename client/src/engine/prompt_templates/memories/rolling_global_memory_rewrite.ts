import { z } from 'zod';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const rollingGlobalMemoryRewriteChainSpec: PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_global_memory',
  defaultTitle: 'Global Memory Rewrite',
  defaultDescription:
    "Prompts for re-writing a character's global memory after each conversation, based on summaries of previous conversations.",
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [
    {
      templateId: 'rolling_global_memory_rewrite_system',
      name: 'Rolling Global Memory Rewrite (System)',
      description: 'System prompt for distilling long-term global memories from conversation summaries.',
      role: 'system',
      defaultTemplateString: `Your job is to read a list of conversation summaries and use it to synthesize a consistent internal memory state for <%= it.focusedCharacter.firstName %>. You will also have access to <%= it.focusedCharacter.firstName %>'s existing internal memory state and persona information.

Consider not only what happened, but the order it happened in, and how it shows evolution or insights into <%= it.focusedCharacter.firstName %>, their relationships with other characters, and their goals and trajectory.

The purpose of the new internal memory state will be to inform the behavior of a roleplayer who will roleplay as <%= it.focusedCharacter.firstName %> going forward. Consider what information the roleplayer should know in order to accurately roleplay <%= it.focusedCharacter.firstName %> in their next interactions.

The existing internal memory state that will be provided was previously generated based on an older version of the same rolling list of recent conversation summaries.

Rules:
- Prioritize actionable information that can be used to guide <%= it.focusedCharacter.firstName %>'s future actions and decisions.
- Only include experientially earned information that is distinct from <%= it.focusedCharacter.firstName %>'s persona information (the roleplayer will be provided the static persona information separately).
- Include brief information about the most salient interpersonal developments/relationships, but avoid going into depth since pairwise interpersonal memories will be generated and included separately.
- Provide sufficient context and reasoning for any goals or intentions.
- Newer (bottom-most) conversation summaries should be weighted more heavily.
- Output only the updated global memory (no more than 1000 words), nothing else.`,
    },
    {
      templateId: 'rolling_global_memory_rewrite_user',
      name: 'Rolling Global Memory Rewrite (User)',
      description: 'User prompt carrying persona, existing global memory, and conversation summaries.',
      role: 'user',
      defaultTemplateString: `<%= it.focusedCharacter.firstName %>'s persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

Current internal memory state:
<old_internal_memory>
<%= it.focusedCharacter.globalMemories || (it.focusedCharacter.firstName + ' does not have any memories yet.') %>

</old_internal_memory>

Rolling conversation summary history (oldest first):
<%= it.rollingConversationSummariesText %>


Output the updated internal memory state now and nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
