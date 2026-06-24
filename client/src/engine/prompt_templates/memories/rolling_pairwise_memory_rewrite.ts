import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class RollingPairwiseMemoryRewriteSystemTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You will be given the following types of information:
1. An existing consolidated summary of <%= it.focusedCharacter.firstName %>'s memories towards <%= it.targetCharacter.firstName %> (if any).
2. A list of summaries of recent conversations that have taken place between <%= it.focusedCharacter.firstName %> and <%= it.targetCharacter.firstName %> (if any).
3. A list of secondhand information that <%= it.focusedCharacter.firstName %> has heard about <%= it.targetCharacter.firstName %> (if any).
4. A goal for <%= it.focusedCharacter.firstName %> in their next interaction with <%= it.targetCharacter.firstName %> (if any) 

Your job is to use the available information to update <%= it.focusedCharacter.firstName %>'s consolidated memory about <%= it.targetCharacter.firstName %>. The existing consolidated memory is now stale and needs updating to include newer details.

Rules:
- Your goal is to crystallize the current state of <%= it.focusedCharacter.firstName %>'s relationship with <%= it.targetCharacter.firstName %> based on the provided logs.
- First, prioritize information that is relevant to <%= it.focusedCharacter.firstName %>'s goal in their next interaction with <%= it.targetCharacter.firstName %> (if any), without restating the goal.
- Second, prioritize <%= it.focusedCharacter.firstName %>'s broader goals and intentions towards <%= it.targetCharacter.firstName %>, relationship status, memories, and emotional trajectory relevant to the relationship.
- From the existing consolidated memory, keep important details that remain plausible, even if they are not substantiated in the most recent conversation summaries.
- Write in third person. Be specific and direct.
- Output only the updated memory.`;
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
  public readonly defaultTemplateString = `<%= it.focusedCharacter.firstName %>'s existing consolidated memory about <%= it.targetCharacter.firstName %>:
<existing_memory>
<%= it.targetCharacterRelationship.memory || (it.focusedCharacter.firstName + ' has no memories about ' + it.targetCharacter.firstName + ' yet.') %>

</existing_memory>

Recent specific interactions with and information about <%= it.targetCharacter.firstName %> that <%= it.focusedCharacter.firstName %> remembers (oldest first):
<%= it.targetCharacterFormattedRollingMemoriesText %>


<%= it.focusedCharacter.firstName %> goal towards <%= it.targetCharacter.firstName %> in their next interaction:
<goal>
<%= it.targetCharacterRelationship.nextConversationGoal || 'No goal is set' %>

</goal>


Output the updated memory now, prioritizing more recent information.`;
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
