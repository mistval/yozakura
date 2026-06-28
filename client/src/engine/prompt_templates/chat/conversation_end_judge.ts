import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import {
  conversationEndJudgeExecutionContextSchema,
  type ConversationEndJudgeExecutionContext,
} from '../prompt_template_context_fields';
import type { ChatEndDecision } from '../../chat/intelligent_chat_end';

class ConversationEndJudgeSystemTemplate extends PromptTemplateBase<ConversationEndJudgeExecutionContext> {
  public readonly defaultTemplateString = `You are a conversation moderator and your job is to determine whether a conversation is currently at a good stopping point. You will be given the most recent conversation messages and some constraints to consider. You must output your decision as a single token, either: "CONTINUE" or "STOP".

A conversation may be at a good stopping point when one of the following has occurred:
1. Something with significant narrative potential has been discussed or planned in detail.
2. The characters involved in the conversation have developed their relationship towards each other significantly.
3. The conversation is becoming repetitive or uninteresting.

A conversation may need continuation if:
1. The characters are still deliberating substantively.
2. The latest messages are still developing the conversation substantively.

You will also be given a target conversation length and a max conversation length. You should be more aggressive about ending the conversation when it exceeds the target length, less aggressive when it's shorter. The target length is a suggestion and just one factor in your judgement.

Output a single token: either "CONTINUE" or "STOP", nothing else.`;
  public readonly contextSchema = conversationEndJudgeExecutionContextSchema;

  public readonly templateName = 'Conversation End Judge (System)';
  public readonly templateDescription =
    'System prompt for judging whether an NPC-only conversation is at a good stopping point.';
  public readonly templateId = 'conversation_end_judge_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ConversationEndJudgeUserTemplate extends PromptTemplateBase<ConversationEndJudgeExecutionContext> {
  public readonly defaultTemplateString = `Here are the most recent <%= it.conversationEndJudge.historyLength %> messages of the conversation.

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

Output whether the conversation should continue, as a one token judgement: either "CONTINUE" or "STOP", nothing else.`;
  public readonly contextSchema = conversationEndJudgeExecutionContextSchema;

  public readonly templateName = 'Conversation End Judge (User)';
  public readonly templateDescription =
    'User prompt containing the recent transcript excerpt and the configured length constraints.';
  public readonly templateId = 'conversation_end_judge_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const conversationEndJudgeSystemTemplate = new ConversationEndJudgeSystemTemplate();
const conversationEndJudgeUserTemplate = new ConversationEndJudgeUserTemplate();
export const conversationEndJudgeTemplatesGroup = new PromptTemplateChain<
  ConversationEndJudgeExecutionContext,
  ChatEndDecision
>({
  templateChainId: 'gen_conversation_end_judgement',
  templateChainTitle: 'Conversation End Judgement',
  templateChainDescription:
    'Templates used to judge whether an NPC-only conversation is at a good stopping point.',
  contextSchema: conversationEndJudgeExecutionContextSchema,
  templates: [
    { template: conversationEndJudgeSystemTemplate },
    { template: conversationEndJudgeUserTemplate },
  ],
  parser: new PromptOutputParser<ConversationEndJudgeExecutionContext, ChatEndDecision>(
    `async (response, it) => {
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
    'conversation_end_judge_parser',
    z.enum(['continue', 'stop'])
  ),
});
