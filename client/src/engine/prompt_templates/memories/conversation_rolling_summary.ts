import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class ConversationRollingSummarySystemTemplate extends PromptTemplateBase<
  z.infer<typeof focusedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You must summarize a conversation and extract the key information from <%= it.focusedCharacter.firstName %>'s perspective.

Write a 2-4 paragraph summary of the conversation from <%= it.focusedCharacter.firstName %>'s perspective in third person.

Rules:
- Focus on durable facts, commitments, relationship shifts, emotional tone, and unresolved threads.
- Prioritize actionable details useful for future interactions. Be specific and direct, leaving nothing to the imagination.
- Filter the conversation through the lense of <%= it.focusedCharacter.firstName %>'s personality and values.
- Output only the summary, nothing else.`;
  public readonly contextSchema = focusedConversationExecutionContextSchema;

  public readonly templateName = 'Conversation Rolling Summary (System)';
  public readonly templateDescription = 'System prompt for generating a compact summary of a conversation.';
  public readonly templateId = 'conversation_rolling_summary_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ConversationRollingSummaryUserTemplate extends PromptTemplateBase<
  z.infer<typeof focusedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `<%= it.focusedCharacter.firstName %>'s persona:
<<%= it.focusedCharacter.firstName %>_persona>
<%= it.focusedCharacter.internalDescription %>

</<%= it.focusedCharacter.firstName %>_persona>

Conversation participants: <%= it.participants.map((participant) => participant.firstName + ' ' + participant.lastName).join(', ') %>

Conversation medium: <%= it.chatMedium %>

Location: <%= it.currentLocation.name %> - <%= it.currentLocation.description %>


Conversation transcript:
<transcript>
<%= it.transcript %>

</transcript>

Write the conversation summary now.`;
  public readonly contextSchema = focusedConversationExecutionContextSchema;

  public readonly templateName = 'Conversation Rolling Summary (User)';
  public readonly templateDescription =
    'User prompt carrying persona and transcript details for summary generation.';
  public readonly templateId = 'conversation_rolling_summary_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const conversationRollingSummarySystemTemplate = new ConversationRollingSummarySystemTemplate();
const conversationRollingSummaryUserTemplate = new ConversationRollingSummaryUserTemplate();

export const conversationRollingSummaryChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_convo_summary',
  templateChainTitle: 'Conversation Summarization',
  templateChainDescription: 'Prompts for generating conversation summaries.',
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [
    { template: conversationRollingSummarySystemTemplate },
    { template: conversationRollingSummaryUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof focusedConversationExecutionContextSchema>, string>(
    'async (response, it) => response',
    'gen_convo_summary_parser',
    z.string()
  ),
});
