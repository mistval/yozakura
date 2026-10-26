import { z } from 'zod';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const conversationRollingSummaryChainSpec: PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_convo_summary',
  defaultTitle: 'Conversation Summarization',
  defaultDescription: 'Prompts for generating conversation summaries.',
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [
    {
      templateId: 'conversation_rolling_summary_system',
      name: 'Conversation Rolling Summary (System)',
      description: 'System prompt for generating a compact summary of a conversation.',
      role: 'system',
      defaultTemplateString: `You must summarize a conversation and extract the key information from <%= it.focusedCharacter.firstName %>'s perspective.

Rules:
- Focus on durable facts, commitments, relationship shifts, emotional tone, and unresolved threads.
- Prioritize actionable details useful for future interactions. Be specific and direct, leaving nothing to the imagination.
- Filter the conversation through the lens of <%= it.focusedCharacter.firstName %>'s personality and values.
- Output only the summary, nothing else.`,
    },
    {
      templateId: 'conversation_rolling_summary_user',
      name: 'Conversation Rolling Summary (User)',
      description: 'User prompt carrying persona and transcript details for summary generation.',
      role: 'user',
      defaultTemplateString: `<%= it.focusedCharacter.firstName %>'s persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

Conversation participants: <%= it.participants.map((participant) => participant.firstName + ' ' + participant.lastName).join(', ') %>

Conversation medium: <%= it.chatMedium %>

Location: <%= it.currentLocation.name %> - <%= it.currentLocation.description %>


Conversation transcript:
<transcript>
<%= it.transcript %>

</transcript>

Output the conversation summary now.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
