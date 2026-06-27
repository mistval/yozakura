import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { offscreenMemoryUpdateConversationGoalContextSchema } from '../prompt_template_context_fields';

class OffscreenMemoryUpdateConversationGoalSystemTemplate extends PromptTemplateBase<
  z.infer<typeof offscreenMemoryUpdateConversationGoalContextSchema>
> {
  public readonly defaultTemplateString = `Your job is to decide whether newly learned information should change <%= it.focusedCharacter.firstName %>'s next conversation goal with <%= it.targetCharacter.firstName %>. You will be given <%= it.focusedCharacter.firstName %>'s current memories of <%= it.targetCharacter.firstName %>, their existing goal towards them (if any), and one new piece of information that <%= it.focusedCharacter.firstName %> just learned regarding <%= it.targetCharacter.firstName %>.

If the new piece of information suggests a more important goal for <%= it.focusedCharacter.firstName %> to pursue with <%= it.targetCharacter.firstName %>, you should write a new goal. Otherwise, you should keep the old goal.

If you decide to keep the old goal:
- Output only "KEEP_OLD_GOAL" exactly.

If you decide to write a new goal for <%= it.focusedCharacter.firstName %> to pursue with <%= it.targetCharacter.firstName %>:
- Write a goal that provides strong narrative momentum.
- Prioritize taking decisive action rather than just planning.
- Be specific and provide sufficient context.
- Output only the updated goal and nothing else`;
  public readonly contextSchema = offscreenMemoryUpdateConversationGoalContextSchema;

  public readonly templateName = 'Offscreen Conversation Goal Update (System)';
  public readonly templateDescription =
    'System prompt for deciding whether to update next conversation topic.';
  public readonly templateId = 'offscreen_memory_update_conversation_goal_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class OffscreenMemoryUpdateConversationGoalUserTemplate extends PromptTemplateBase<
  z.infer<typeof offscreenMemoryUpdateConversationGoalContextSchema>
> {
  public readonly defaultTemplateString = `<%= it.focusedCharacter.firstName %>'s current aggregate memories about <%= it.targetCharacter.firstName %>:
<current_aggregate_memories>
<%= it.targetCharacterRelationship?.memory || (it.focusedCharacter.firstName + ' does not have any memories about ' + it.targetCharacter.firstName + ' yet.') %>

</current_aggregate_memories>

Existing goal that <%= it.focusedCharacter.firstName %> wanted to pursue with <%= it.targetCharacter.firstName %>:
<existing_goal>
<%= it.targetCharacterRelationship?.nextConversationGoal || (it.focusedCharacter.firstName + ' does not have a goal to pursue with ' + it.targetCharacter.firstName + ' yet.') %>

</existing_goal>

Newly learned information regarding <%= it.targetCharacter.firstName %>:
<new_information>
<%= it.candidateInformation %>

</new_information>

Output either KEEP_OLD_GOAL or a replacement goal string.`;
  public readonly contextSchema = offscreenMemoryUpdateConversationGoalContextSchema;

  public readonly templateName = 'Offscreen Conversation Goal Update (User)';
  public readonly templateDescription =
    'User prompt carrying current memory, existing topic, and new topic candidate.';
  public readonly templateId = 'offscreen_memory_update_conversation_goal_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const offscreenMemoryUpdateConversationGoalSystemTemplate =
  new OffscreenMemoryUpdateConversationGoalSystemTemplate();
const offscreenMemoryUpdateConversationGoalUserTemplate =
  new OffscreenMemoryUpdateConversationGoalUserTemplate();

export const offscreenMemoryUpdateConversationGoalChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_offscreen_character_binary_update_next_convo_goal',
  templateChainTitle: 'Offscreen Conversation Goal Update',
  templateChainDescription:
    'Prompts for deciding whether to keep the existing next-conversation goal or replace it with a new one. Parser may return null to keep existing goal.',
  contextSchema: offscreenMemoryUpdateConversationGoalContextSchema,
  templates: [
    { template: offscreenMemoryUpdateConversationGoalSystemTemplate },
    { template: offscreenMemoryUpdateConversationGoalUserTemplate },
  ],
  parser: new PromptOutputParser<
    z.infer<typeof offscreenMemoryUpdateConversationGoalContextSchema>,
    string | null
  >(
    `async (response, it) => {
  if (response.includes('KEEP_OLD')) {
    return null;
  }

  return response;
}`,
    'offscreen_memory_update_conversation_goal_parser',
    z.union([z.string(), z.null()])
  ),
});
