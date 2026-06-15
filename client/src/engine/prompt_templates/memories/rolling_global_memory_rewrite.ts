import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class RollingGlobalMemoryRewriteSystemTemplate extends PromptTemplateBase<
  z.infer<typeof focusedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Your job is to read a list of conversation summaries and use it to distill up to five paragraphs of memories for <%= it.focusedCharacter.firstName %>. You will also have access to <%= it.focusedCharacter.firstName %>'s existing memory state.

Rules:
- Prioritize recurring and actionable information that can be used to guide <%= it.focusedCharacter.firstName %>'s future actions and decisions.
- Preserve still-important facts from existing memory state even if they are not in recent conversation summaries.
- Remove stale, redundant, or contradicted information. Newer memories should take precedence over older ones.
- Write in third person. Be specific and direct, leaving nothing to the imagination.
- Output up to four paragraphs.
- Output only the rewritten global memory.`;
  public readonly contextSchema = focusedConversationExecutionContextSchema;

  public readonly templateName = 'Rolling Global Memory Rewrite (System)';
  public readonly templateDescription =
    'System prompt for distilling long-term global memories from conversation summaries.';
  public readonly templateId = 'rolling_global_memory_rewrite_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class RollingGlobalMemoryRewriteUserTemplate extends PromptTemplateBase<
  z.infer<typeof focusedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `<%= it.focusedCharacter.firstName %>'s persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

Current global memory:
<old_global_memory>
<%= it.focusedCharacter.globalMemories || (it.focusedCharacter.firstName + ' does not have any memories yet.') %>

</old_global_memory>

Rolling conversation summary history (oldest first):
<%= it.rollingConversationSummariesText %>


Rewrite the global memory now. Output the new global memory and nothing else.`;
  public readonly contextSchema = focusedConversationExecutionContextSchema;

  public readonly templateName = 'Rolling Global Memory Rewrite (User)';
  public readonly templateDescription =
    'User prompt carrying persona, existing global memory, and conversation summaries.';
  public readonly templateId = 'rolling_global_memory_rewrite_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const rollingGlobalMemoryRewriteSystemTemplate = new RollingGlobalMemoryRewriteSystemTemplate();
const rollingGlobalMemoryRewriteUserTemplate = new RollingGlobalMemoryRewriteUserTemplate();

export const rollingGlobalMemoryRewriteChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_global_memory',
  templateChainTitle: 'Global Memory Rewrite',
  templateChainDescription:
    "Prompts for re-writing a character's global memory after each conversation, based on summaries of previous conversations.",
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [
    { template: rollingGlobalMemoryRewriteSystemTemplate },
    { template: rollingGlobalMemoryRewriteUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof focusedConversationExecutionContextSchema>, string>(
    'async (response, it) => response',
    'gen_global_memory',
    z.string()
  ),
});
