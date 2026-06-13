import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class NextConversationGoalUpdatesSystemTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Given <%= it.focusedCharacter.firstName %>'s character persona, their memory about <%= it.targetCharacter.firstName %>, and the transcript of a conversation that just happened involving both of them, you must write a goal for <%= it.focusedCharacter.firstName %> in their next interaction with <%= it.targetCharacter.firstName %>.

Rules:
- Prioritize specific plans and goals that were discussed in the conversation.
- Write in the third person perspective.
- Output up to one paragraph.
- Choose a goal that provides strong narrative momentum.
- Be specific and provide sufficient context.
- Output the goal and nothing else`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Next Conversation Goal (System)';
  public readonly templateDescription = 'System prompt for deriving a next interaction goal from transcript.';
  public readonly templateId = 'next_conversation_goal_updates_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class NextConversationGoalUpdatesUserTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Here is <%= it.focusedCharacter.firstName %>'s character persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>
  
Here are <%= it.focusedCharacter.firstName %>'s current consolidated memories about <%= it.targetCharacter.firstName %>:
<memories>
<%= it.targetCharacterRelationship.memory || it.focusedCharacter.firstName + ' has no memories about ' + it.targetCharacter.firstName + ' yet' %>

</memories>

Here was the previous conversation goal for <%= it.focusedCharacter.firstName %> in their interactions with <%= it.targetCharacter.firstName %>:

<old_goal>
<%= it.targetCharacterRelationship.nextConversationGoal || 'No specific goal was set.' %>

</old_goal>
  
Here is the conversation transcript:
<transcript>
<%= it.transcript %>

</transcript>

Output a goal for <%= it.focusedCharacter.firstName %> in their next interaction with <%= it.targetCharacter.firstName %>`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Next Conversation Goal (User)';
  public readonly templateDescription =
    'User prompt carrying transcript for next conversation goal derivation.';
  public readonly templateId = 'next_conversation_goal_updates_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const nextConversationGoalUpdatesSystemTemplate = new NextConversationGoalUpdatesSystemTemplate();
const nextConversationGoalUpdatesUserTemplate = new NextConversationGoalUpdatesUserTemplate();

export const nextConversationGoalUpdatesChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_convo_goal',
  templateChainTitle: 'Next Conversation Goal',
  templateChainDescription:
    'Prompts for determining the goal for the focused character in their next conversation with the target character based on the transcript of their previous conversation.',
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    { template: nextConversationGoalUpdatesSystemTemplate },
    { template: nextConversationGoalUpdatesUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof targetedConversationExecutionContextSchema>, string>(
    'async (response, it) => response',
    'next_conversation_goal_updates_parser',
    z.string()
  ),
});
