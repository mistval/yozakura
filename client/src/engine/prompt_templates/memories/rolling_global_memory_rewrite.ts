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
      description:
        'System prompt for distilling long-term global memories from conversation summaries.',
      role: 'system',
      defaultTemplateString: `Your job is to read a list of conversation summaries and use it to distill a block of memories for <%= it.focusedCharacter.firstName %>. You will also have access to <%= it.focusedCharacter.firstName %>'s existing memory state and persona.

Rules:
- Prioritize recurring and actionable information that can be used to guide <%= it.focusedCharacter.firstName %>'s future actions and decisions.
- Preserve still-important facts from existing memory state even if they are not in recent conversation summaries.
- Avoid repeating information from the character persona, as that would be redundant.
- Remove stale, redundant, or contradicted information. Newer memories should take precedence over older ones.
- Write in third person. Be specific and direct, leaving nothing to the imagination.
- Output only the rewritten global memory.`,
    },
    {
      templateId: 'rolling_global_memory_rewrite_user',
      name: 'Rolling Global Memory Rewrite (User)',
      description:
        'User prompt carrying persona, existing global memory, and conversation summaries.',
      role: 'user',
      defaultTemplateString: `<%= it.focusedCharacter.firstName %>'s persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

Current global memory:
<old_global_memory>
<%= it.focusedCharacter.globalMemories || (it.focusedCharacter.firstName + ' does not have any memories yet.') %>

</old_global_memory>

Rolling conversation summary history (oldest first):
<%= it.rollingConversationSummariesText %>


Output the updated memory now and nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
