import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class RollingPairwiseMemoryRewriteSystemTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Your job is to read a list of past interaction summaries and use it to synthesize a consistent internal memory state for <%= it.focusedCharacter.firstName %> to bring into their future interactions with <%= it.targetCharacter.firstName %>. You will also have access to <%= it.focusedCharacter.firstName %>'s existing internal memory state, persona information, and immediate goal in their next interaction with <%= it.targetCharacter.firstName %>.

Consider not only what happened, but the order it happened in, and how it shows evolution or insights into <%= it.focusedCharacter.firstName %>'s relationship with <%= it.targetCharacter.firstName %> and their goals towards <%= it.targetCharacter.firstName %>.

The purpose of the new internal memory state will be to inform the behavior of a roleplayer who will roleplay as <%= it.focusedCharacter.firstName %> in future interactions with <%= it.targetCharacter.firstName %>. Consider what information the roleplayer should know in order to accurately roleplay as <%= it.focusedCharacter.firstName %> in future interactions with <%= it.targetCharacter.firstName %>.

The existing internal memory state that will be provided was previously generated based on an older version of the same rolling list of recent interaction summaries.

Rules:
- Prioritize actionable information that can be used to guide <%= it.focusedCharacter.firstName %>'s future behavior towards <%= it.targetCharacter.firstName %>.
- Reference <%= it.focusedCharacter.firstName %>'s persona to guide prioritization and emotional valence.
- Only include experientially earned information that is distinct from <%= it.focusedCharacter.firstName %>'s persona information (the roleplayer will be provided the persona information separately).
- Provide sufficient context and reasoning for any goals or intentions.
- Newer (bottom-most) conversation summaries should be weighted more heavily.
- Output only the new internal memory state, nothing else.`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Rolling Pairwise Memory Rewrite (System)';
  public readonly templateDescription =
    'System prompt for distilling pairwise relationship memory from summaries and hearsay.';
  public readonly templateId = 'rolling_pairwise_memory_rewrite_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class RollingPairwiseMemoryRewriteUserTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `<%= it.focusedCharacter.firstName %>'s persona:
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


Output the updated internal memory state for <%= it.focusedCharacter.firstName %> to bring into future interactions with <%= it.targetCharacter.firstName %>.`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Rolling Pairwise Memory Rewrite (User)';
  public readonly templateDescription =
    'User prompt carrying existing memory and recent pairwise information stream.';
  public readonly templateId = 'rolling_pairwise_memory_rewrite_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const rollingPairwiseMemoryRewriteSystemTemplate = new RollingPairwiseMemoryRewriteSystemTemplate();
const rollingPairwiseMemoryRewriteUserTemplate = new RollingPairwiseMemoryRewriteUserTemplate();

export const rollingPairwiseMemoryRewriteChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_pairwise_memory',
  templateChainTitle: 'Pairwise Memory Rewrite',
  templateChainDescription:
    "Prompts for re-writing a character's pairwise memory after each conversation, based on direct and offscreen evidence.",
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    { template: rollingPairwiseMemoryRewriteSystemTemplate },
    { template: rollingPairwiseMemoryRewriteUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof targetedConversationExecutionContextSchema>, string>(
    'async (response, it) => response',
    'gen_pairwise_memory_parser',
    z.string()
  ),
});
