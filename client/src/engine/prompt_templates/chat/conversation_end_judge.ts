import { z } from 'zod';
import {
  conversationEndJudgeExecutionContextSchema,
  type ConversationEndJudgeExecutionContext,
} from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const conversationEndJudgeChainSpec: PromptTemplateChainSpec<
  ConversationEndJudgeExecutionContext,
  'continue' | 'stop'
> = {
  templateChainId: 'gen_conversation_end_judgement',
  defaultTitle: 'Conversation End Judgement',
  defaultDescription:
    'Templates used to judge whether an NPC-only conversation is at a good stopping point.',
  contextSchema: conversationEndJudgeExecutionContextSchema,
  templates: [
    {
      templateId: 'conversation_end_judge_system',
      name: 'Conversation End Judge (System)',
      description:
        'System prompt for judging whether an NPC-only conversation is at a good stopping point.',
      role: 'system',
      defaultTemplateString: `You are a conversation moderator and your job is to determine whether a conversation is currently at a good stopping point. You will be given the most recent conversation messages and some constraints to consider. You must output your decision as a single token, either: "CONTINUE" or "STOP".

A conversation may be at a good stopping point when one of the following has occurred:
1. Something with significant narrative potential has been discussed or planned in detail.
2. The characters involved in the conversation have developed their relationship towards each other significantly.
3. Significant new information about characters has been revealed.
4. The conversation is becoming repetitive or uninteresting.

A conversation may need continuation if:
1. The characters are still deliberating substantively.
2. The latest messages are still developing the conversation substantively.

You will also be given a target conversation length and a max conversation length. You should be more aggressive about ending the conversation when it exceeds the target length, less aggressive when it's shorter. The target length is a suggestion and just one factor in your judgement. The separate max length provides flexibility to allow longer conversations to achieve narrative momentum.

Output a single token: either "CONTINUE" or "STOP", nothing else.`,
    },
    {
      templateId: 'conversation_end_judge_user',
      name: 'Conversation End Judge (User)',
      description:
        'User prompt containing the recent transcript excerpt and the configured length constraints.',
      role: 'user',
      defaultTemplateString: `Here are the most recent <%= it.conversationEndJudge.historyLength %> messages of the conversation.

<transcript>
<%= (() => {
  const formatChatMessage = (message) => {
    const speakerName = it.participants.find((speaker) => speaker.id === message.senderId)?.firstName;

    if (speakerName) {
      return \`\${speakerName}: \${message.message.replaceAll('\\n', ' ')}\`;
    }
  }

  return it.conversationMessages
    .flatMap((entry) => {
      if (entry.messageType === 'chat_message') {
        return formatChatMessage(entry) ?? [];
      }
      return [];
    })
    .slice(-it.conversationEndJudge.historyLength)
    .join('\\n');
})() %>
</transcript>

The user's configured target conversation length is <%= it.conversationEndJudge.targetLength %>. The max length is <%= it.conversationEndJudge.maxLength %>. The current conversation length is <%= it.conversationEndJudge.currentLength %><%= it.conversationEndJudge.currentLength > it.conversationEndJudge.targetLength ? ' (exceeds the target length)' : '' %>.

Output whether the conversation should continue, as a one token judgement: either "CONTINUE" or "STOP", nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: `async (response, it) => {
  const text = response.toUpperCase();
  const hasStop = text.includes('STOP');
  const hasContinue = text.includes('CONTINUE');

  if (hasStop && !hasContinue) {
    return 'stop';
  }

  if (hasContinue && !hasStop) {
    return 'continue';
  }

  return it.conversationEndJudge.currentLength >= it.conversationEndJudge.targetLength ? 'stop' : 'continue';
}`,
    parserOutputSchema: z.enum(['continue', 'stop']),
  },
};
