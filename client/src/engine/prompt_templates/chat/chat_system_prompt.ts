import { z } from 'zod';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const chatSystemPromptChainSpec: PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_npc_response',
  defaultTitle: 'Chat System Prompt',
  defaultDescription:
    'This template group controls the leading and trailing system prompts for NPC chat responses.',
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [
    {
      templateId: 'chat_system_prompt',
      name: 'Chat System Prompt',
      description:
        'This template controls the initial system prompt for the speaker. This prompt sits at the top of the completions prompt chain and is re-computed for every message, so it can change dynamically as the conversation evolves. ',
      role: 'system',
      defaultTemplateString: `<% const otherParticipants = it.participants.filter((p) => p.id !== it.focusedCharacter.id); %>
<% if (otherParticipants.length > 1) { %>
<%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %> is currently having a group chat with several other characters: <%= otherParticipants.map((p) => p.firstName + ' ' + p.lastName).join(', ') %>.
<% } else if (otherParticipants.length) { %>
<%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %> is currently having a one-on-one chat with <%= otherParticipants[0].firstName + ' ' + otherParticipants[0].lastName %>.
<% } %>

You are roleplaying as <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %> in a <%= it.chatMedium === 'in_person' ? 'conversation' : 'text messaging chat (the participants are in different physical locations)' %>. <%= it.focusedCharacter.firstName %>'s persona description:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

<% if (it.focusedCharacter.exampleDialogue) { %>
<%= it.focusedCharacter.firstName %>'s example dialogue:
<example_dialogue>
<%= it.focusedCharacter.exampleDialogue %>

</example_dialogue>
<% } %>

<% if (it.focusedCharacter.globalMemories) { %>
<%= it.focusedCharacter.firstName %>'s personal memories and goals:
<personal_memories_and_goals>
<%= it.focusedCharacter.globalMemories %>

</personal_memories_and_goals>
<% } %>

<% for (const p of it.participants) { %>
<% if (p.id !== it.focusedCharacter.id) { %>
What <%= it.focusedCharacter.firstName %> knows about <%= p.firstName %> <%= p.lastName %>:
<memories_of_<%= p.xmlTagSafeName %>>
<%= p.externalDescription %>

<%= (await it.getRelationship(it.focusedCharacter.id, p.id))?.memory || it.focusedCharacter.firstName + ' has not met ' + p.firstName + ' yet. The previous information is surface level information that can be ascertained about ' + p.firstName + ' almost immediately when first meeting them.' %>

</memories_of_<%= p.xmlTagSafeName %>>
<% } %>
<% } %>

<% if (otherParticipants.length === 1) { %>
<% const relationship = await it.getRelationship(it.focusedCharacter.id, otherParticipants[0].id); %>
Here is a goal that <%= it.focusedCharacter.firstName %> wants to discuss with <%= otherParticipants[0].firstName %> if the opportunity arises:
<goal>
<%= relationship?.nextConversationGoal || it.focusedCharacter.firstName + ' is interested in meeting ' + otherParticipants[0].firstName + '.' %>

</goal>
<% } %>

The setting:
<setting>
This scenario takes place in:
World name: <%= it.worldMap.name %>

World description: <%= it.worldMap.description %>

<% if (it.temporalContext) { %>
The current date and time: <%= it.temporalContext %>
<% } %>

<%= it.focusedCharacter.firstName %>'s current location is:
Location name:  <%= it.currentLocation.name %>

Location description: <%= it.currentLocation.description %>
<% const movement = it.characterMovementConstraint; %>

<% if (movement?.status === 'in_designated_zone' && movement.reason) { %>
<%= it.focusedCharacter.firstName %> is currently here because <%= movement.reason %>
<% } else if (movement?.status !== 'in_designated_zone' && movement?.reason) { %>
<%= it.focusedCharacter.firstName %> is currently moving towards <%= movement.targetLocationName %> because <%= movement.reason %>
<% } else if (movement?.status !== 'in_designated_zone' && movement?.targetLocationName) { %>
<%= it.focusedCharacter.firstName %> is currently moving towards <%= movement.targetLocationName %>
<% } %>
</setting>

<% const gossipTargetHasBeenRagged = it.raggedCharacters.some((c) => c.id === it.gossipTargetCharacter?.id); %>
<% const shouldIncludeGossipMemory = !gossipTargetHasBeenRagged && it.gossipTargetCharacter && it.gossipTargetRelationship?.memory; %>
<% if (shouldIncludeGossipMemory) { %>
<%= it.focusedCharacter.firstName %> also knows another character named <%= it.gossipTargetCharacter.firstName %> <%= it.gossipTargetCharacter.lastName %>. <%= it.gossipTargetCharacter.firstName %> is not taking part in this conversation, but <%= it.focusedCharacter.firstName %> can mention <%= it.gossipTargetCharacter.firstName %> if it adds to the conversation. Here is <%= it.focusedCharacter.firstName %>'s relationship with <%= it.gossipTargetCharacter.firstName %>:
<memories_of_<%= it.gossipTargetCharacter.xmlTagSafeName %>>
<%= it.gossipTargetRelationship.memory %>

</memories_of_<%= it.gossipTargetCharacter.xmlTagSafeName %>>
<% } %>

Your instructions:
<% const isInitialMessage = it.conversationMessages.length === 0; %>
<instructions>
- <%= isInitialMessage ? 'Write a proactive first message in the conversation as ' + it.focusedCharacter.firstName + ' in first person perspective' : 'Write the next response as ' + it.focusedCharacter.firstName + ' in first person perspective' %>

- <%= it.chatMedium === 'in_person'
  ? 'Be concise. Output no more than three sentences.'
  : 'Text messaging style (concise, casual, abbreviated, use emojis if consistent with ' + it.focusedCharacter.firstName + "'s persona). Be concise. Output no more than three sentences." %>

- Use quotes for speech and asterisks for actions and internal speech.
- Be aware that other characters' internal speech is not directly known to your character.
- Avoid repetition.
<% if (it.chatInstructions && it.conversationMessages.length === 0) { %>
- <%= it.chatInstructions %>
<% } %>
<% if (it.focusedCharacterChatInstructions && it.conversationMessages.length === 0) { %>
- <%= it.focusedCharacterChatInstructions %>
<% } %>
</instructions>`,
    },
    {
      templateId: 'final_instructions_prompt',
      name: 'Final Instructions Prompt',
      description:
        'Final system instruction block appended at the end of the completions prompt chain before generating a character reply. If no message has been sent in the chat yet, this is NOT appended.',
      role: 'system',
      defaultTemplateString: `Your instructions:
<instructions>
- <%= it.conversationMessages.length === 0
  ? 'Write a proactive first message in the conversation as ' + it.focusedCharacter.firstName + ' in first person perspective.'
  : 'Write the next response as ' + it.focusedCharacter.firstName + ' in first person perspective.' %>

- <%= it.chatMedium === 'in_person'
  ? 'Be concise. Output no more than three sentences.'
  : 'Text messaging style (concise, casual, abbreviated, use emojis if consistent with ' + it.focusedCharacter.firstName + "'s persona). Be concise. Output no more than three sentences." %>

- Use quotes for speech and asterisks for actions and internal speech.
- Be aware that other characters' internal speech is not directly known to your character.
- Avoid repetition.
<% if (it.chatInstructions) { %>
- <%= it.chatInstructions %>
<% } %>
<% if (it.focusedCharacterChatInstructions) { %>
- <%= it.focusedCharacterChatInstructions %>
<% } %>
</instructions>`,
    },
    {
      templateId: 'chat_system_user_nudge_prompt',
      name: 'User Nudge Prompt',
      description:
        'Some models (such as deepseek/deepseek-v4-flash) hate when a system prompt is the most recent message they receive. This will result in frequent "Empty LLM response" errors. If you see this happening (or otherwise suspect you\'re working with a model that behaves this way), try putting a short instruction message in here like: "Respond in character as <%= it.focusedCharacter.firstName %>". Anything you enter here will be appended as a user message after the system message. If you leave this empty, no user message wil be appended.',
      role: 'user',
      defaultTemplateString: '',
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
