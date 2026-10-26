import { z } from 'zod';
import {
  moderationNextSpeakerExecutionContextSchema,
  type ModerationNextSpeakerExecutionContext,
} from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const moderationNextSpeakerChainSpec: PromptTemplateChainSpec<
  ModerationNextSpeakerExecutionContext,
  string | null
> = {
  templateChainId: 'gen_intelligent_next_speaker_select',
  defaultTitle: 'Next Speaker Selection',
  defaultDescription:
    'Templates used for intelligent next speaker selection in group chat. Parser may return null to fall back to simple selection logic.',
  contextSchema: moderationNextSpeakerExecutionContextSchema,
  templates: [
    {
      templateId: 'moderation_next_speaker_system',
      name: 'Moderation Next Speaker (System)',
      description: 'System prompt for selecting the next speaker in multi-party chat.',
      role: 'system',
      defaultTemplateString: `You are an expert conversation moderator. Your task is to analyze a chat transcript and select the single best candidate to speak next.

Selection Rules:
- Select one of the candidates (<%= it.speakerCandidates.map(c => c.firstName).join(', ') %>).
- Prioritize characters who were directly addressed or asked a question.
- Select characters who have not spoken recently to maintain group balance.
- Consider who would naturally have the most relevant next contribution.
- Output the suggested next speaker's first name only.`,
    },
    {
      templateId: 'moderation_next_speaker_user',
      name: 'Moderation Next Speaker (User)',
      description: 'User prompt containing transcript excerpt and eligible candidates.',
      role: 'user',
      defaultTemplateString: `<transcript>
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

Analyze the flow of the conversation and decide who speaks next. Output the next speaker's first name only, nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: `async (response, it) => {
  const nextSpeakerName = response.split(/\\s/)[0]?.toLowerCase();
  return it.speakerCandidates.find(
    (candidate) => candidate.firstName.toLowerCase() === nextSpeakerName
  )?.id ?? null;
}`,
    parserOutputSchema: z.union([z.string(), z.null()]),
  },
};
