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
      defaultTemplateString: `You must summarize a conversation transcript and extract the key information from <%= it.focusedCharacter.firstName %>'s perspective.

Rules:
- Focus on durable facts, commitments, relationship shifts, emotional tone, and unresolved threads.
- Prioritize actionable details useful for future interactions. Be specific and direct, leaving nothing to the imagination.
- Filter the conversation through the lens of <%= it.focusedCharacter.firstName %>'s personality, values, and memories.
- Write the summary in first person from <%= it.focusedCharacter.firstName %>'s perspective. Refer to other characters by name.
- Output only the complete summary, nothing else.`,
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

<% if (it.focusedCharacter.globalMemories) { %>
<%= it.focusedCharacter.firstName %>'s personal memories and goals:
<personal_memories_and_goals>
<%= it.focusedCharacter.globalMemories %>

</personal_memories_and_goals>
<% } %>

<% for (const p of it.participants) { %>
<% if (p.id !== it.focusedCharacter.id) { %>
What <%= it.focusedCharacter.firstName %> knows about <%= p.firstName %> <%= p.lastName %> (another character in the conversation):
<memories_of_<%= p.xmlTagSafeName %>>
<%= p.externalDescription %>

<%= (await it.getRelationship(it.focusedCharacter.id, p.id))?.memory || it.focusedCharacter.firstName + ' has not met ' + p.firstName + ' yet. The previous information is surface level information that can be ascertained about ' + p.firstName + ' almost immediately when first meeting them.' %>

</memories_of_<%= p.xmlTagSafeName %>>
<% } %>
<% } %>

Location: <%= it.currentLocation.name %> - <%= it.currentLocation.description %>


Conversation transcript to summarize:
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
