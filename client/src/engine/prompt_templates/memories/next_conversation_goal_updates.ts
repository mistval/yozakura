import { z } from 'zod';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const nextConversationGoalUpdatesChainSpec: PromptTemplateChainSpec<
  z.infer<typeof targetedConversationExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_convo_goal',
  defaultTitle: 'Next Conversation Goal',
  defaultDescription:
    'Prompts for determining the goal for the focused character in their next conversation with the target character based on the transcript of their previous conversation.',
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    {
      templateId: 'next_conversation_goal_updates_system',
      name: 'Next Conversation Goal (System)',
      description: 'System prompt for deriving a next interaction goal from transcript.',
      role: 'system',
      defaultTemplateString: `Given <%= it.focusedCharacter.firstName %>'s character persona, their memory about <%= it.targetCharacter.firstName %>, and the transcript of a conversation that just happened involving both of them, you must output a goal for <%= it.focusedCharacter.firstName %> in their next interaction with <%= it.targetCharacter.firstName %>.

Rules:
- Prioritize specific goals that were discussed in the conversation.
- Prioritize taking decisive action rather than just planning.
- Write in the third person perspective.
- Choose a goal that provides strong narrative momentum.
- Be specific and provide sufficient context.
- Be specific and creative about how <%= it.focusedCharacter.firstName %> might pursue this goal exactly. Specificity helps keep things moving along, creativity keeps it interesting.
- Output the goal and necessary context, nothing else`,
    },
    {
      templateId: 'next_conversation_goal_updates_user',
      name: 'Next Conversation Goal (User)',
      description: 'User prompt carrying transcript for next conversation goal derivation.',
      role: 'user',
      defaultTemplateString: `Here is <%= it.focusedCharacter.firstName %>'s character persona:
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

Output a goal for <%= it.focusedCharacter.firstName %> in their next interaction with <%= it.targetCharacter.firstName %>`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
