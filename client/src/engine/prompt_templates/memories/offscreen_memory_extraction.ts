import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class OffscreenMemoryExtractionSystemTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You will be given a conversation transcript in which <%= it.targetCharacter.firstName %> <%= it.targetCharacter.lastName %> may have been mentioned. You will also be given memories and persona information about one of the participants in the conversation, named <%= it.focusedCharacter.firstName %>. Your job is to identify one new piece of information in the conversation that is relevant to <%= it.focusedCharacter.firstName %>'s relationship with <%= it.targetCharacter.firstName %>. This can be information pertaining to <%= it.targetCharacter.firstName %>'s relationship with other characters (including but not limited to <%= it.focusedCharacter.firstName %>), general facts and hearsay about <%= it.targetCharacter.firstName %>, or information that <%= it.focusedCharacter.firstName %> would want to share with <%= it.targetCharacter.firstName %>.

Rules:
- Identify and output at most one new piece of information relevant to <%= it.targetCharacter.firstName %> <%= it.targetCharacter.lastName %>.
- The information should be something that can help color <%= it.focusedCharacter.firstName %>'s future interactions with <%= it.targetCharacter.firstName %>, or their future conversations about <%= it.targetCharacter.firstName %>.
- Prioritize information that provides narrative momentum, such as relationship details between <%= it.targetCharacter.firstName %> and other characters, actionable intentions between characters, plans, insights, or facts. Anything that would make for good "gossip" is valuable.
- If the information is hearsay or inferred rather than explicit, include appropriate hedging and qualifications in the output.
- Consider <%= it.focusedCharacter.firstName %>'s unique personality and what kind of information they might want to remember.
- The information must come from the conversation transcript.

Output format:
- Output a single plain string containing only the information.
- If there is no relevant novel information, output exactly: NONE`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Offscreen Memory Extraction (System)';
  public readonly templateDescription =
    'System prompt for extracting a single novel offscreen memory fact from a transcript.';
  public readonly templateId = 'offscreen_memory_extraction_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class OffscreenMemoryExtractionUserTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Here is <%= it.focusedCharacter.firstName %>'s persona:
<persona>
<%= it.focusedCharacter.internalDescription %>

</persona>

Here are the current memories that <%= it.focusedCharacter.firstName %> has about <%= it.targetCharacter.firstName %>:
<current_memory>
<%= it.targetCharacterRelationship?.memory || (it.focusedCharacter.firstName + ' does not have any memories about ' + it.targetCharacter.firstName + ' yet.') %>

</current_memory>

Here is the conversation transcript:
<transcript>
<%= it.transcript %>

</transcript>

Return the new piece of information you identified in the transcript. Alternatively, you may return "NONE" only if you could not identify any new information in the transcript.`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Offscreen Memory Extraction (User)';
  public readonly templateDescription =
    'User prompt carrying persona, transcript, and current memory context.';
  public readonly templateId = 'offscreen_memory_extraction_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const offscreenMemoryExtractionSystemTemplate = new OffscreenMemoryExtractionSystemTemplate();
const offscreenMemoryExtractionUserTemplate = new OffscreenMemoryExtractionUserTemplate();

export const offscreenMemoryExtractionChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_offscreen_learned_information',
  templateChainTitle: 'Offscreen Memory Extraction',
  templateChainDescription:
    'Prompts for extracting information learned about a character not participating in the conversation. The parser can return null if nothing new was learned.',
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    { template: offscreenMemoryExtractionSystemTemplate },
    { template: offscreenMemoryExtractionUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof targetedConversationExecutionContextSchema>, string | null>(
    `async (response, it) => {
  if (response.includes('NONE')) {
    return null;
  }
    
  return response;
}`,
    'offscreen_memory_extraction_parser',
    z.union([z.string(), z.null()])
  ),
});
