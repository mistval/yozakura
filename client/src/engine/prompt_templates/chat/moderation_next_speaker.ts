import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { moderationNextSpeakerExecutionContextSchema } from '../prompt_template_context_fields';

class ModerationNextSpeakerSystemTemplate extends PromptTemplateBase<
  z.infer<typeof moderationNextSpeakerExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are an expert conversation moderator. Your task is to analyze a chat transcript and select the single best candidate to speak next.

Selection Rules:
- Select one of the candidates (<%= it.speakerCandidates.map(c => c.firstName).join(', ') %>).
- Prioritize characters who were directly addressed or asked a question.
- Select characters who have not spoken recently to maintain group balance.
- Consider who would naturally have the most relevant next contribution.
- Output the suggested next speaker's first name only.`;
  public readonly contextSchema = moderationNextSpeakerExecutionContextSchema;

  public readonly templateName = 'Moderation Next Speaker (System)';
  public readonly templateDescription = 'System prompt for selecting the next speaker in multi-party chat.';
  public readonly templateId = 'moderation_next_speaker_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ModerationNextSpeakerUserTemplate extends PromptTemplateBase<
  z.infer<typeof moderationNextSpeakerExecutionContextSchema>
> {
  public readonly defaultTemplateString = `<transcript>
<%= (() => {
  const formatChatMessage = (message) => {
    const speakerName = it.participants.find((speaker) => speaker.id === message.senderId)?.firstName;

    if (speakerName) {
      return \`\${speakerName}: \${message.message.replaceAll('\\n', ' ')}\`;
    }
  }

  return it.conversationMessages
    .flatMap((entry) => {
      if (entry.messageType === 'chat_message' || entry.messageType === 'system_message') {
        return formatChatMessage(entry) ?? [];
      }
      return [];
    })
    .slice(it.participants.length * -3)
    .join('\\n');
})() %>

</transcript>

<eligible_candidates>
<%= it.speakerCandidates.map(c => c.firstName).join('\\n') %>
</eligible_candidates>

Analyze the flow of the conversation and decide who speaks next. Output the next speaker's first name only.`;
  public readonly contextSchema = moderationNextSpeakerExecutionContextSchema;

  public readonly templateName = 'Moderation Next Speaker (User)';
  public readonly templateDescription = 'User prompt containing transcript excerpt and eligible candidates.';
  public readonly templateId = 'moderation_next_speaker_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const moderationNextSpeakerSystemTemplate = new ModerationNextSpeakerSystemTemplate();
const moderationNextSpeakerUserTemplate = new ModerationNextSpeakerUserTemplate();
export const moderationNextSpeakerTemplatesGroup = new PromptTemplateChain({
  templateChainId: 'gen_intelligent_next_speaker_select',
  templateChainTitle: 'Next Speaker Selection',
  templateChainDescription: 'Templates used for intelligent next speaker selection in group chat.',
  contextSchema: moderationNextSpeakerExecutionContextSchema,
  templates: [
    { template: moderationNextSpeakerSystemTemplate },
    { template: moderationNextSpeakerUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof moderationNextSpeakerExecutionContextSchema>, string | null>(
    `(response, it) => {
  const nextSpeakerName = response.split(/\\s/)[0]?.toLowerCase();
  return it.speakerCandidates.find(
    (candidate) => candidate.firstName.toLowerCase() === nextSpeakerName
  )?.id ?? null;
}`,
    'moderation_next_speaker_parser',
    z.union([z.string(), z.null()])
  ),
});
