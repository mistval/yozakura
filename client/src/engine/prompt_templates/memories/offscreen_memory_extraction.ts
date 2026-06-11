import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class OffscreenMemoryExtractionSystemTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Given a conversation transcript and character persona information, identify one novel piece of information about <%= it.targetCharacter.firstName %>, or about <%= it.targetCharacter.firstName %>'s relationship with other characters (including but not limited to <%= it.focusedCharacter.firstName %> and other speakers in the transcript). The information learned should be from the perspective of <%= it.focusedCharacter.firstName %>.

Rules:
- Identify and output at most one piece of information about <%= it.targetCharacter.firstName %>.
- The information must be novel compared to what <%= it.focusedCharacter.firstName %> already knows about <%= it.targetCharacter.firstName %>.
- The information should be something that can be added to <%= it.focusedCharacter.firstName %>'s memory to help guide their future interactions with <%= it.targetCharacter.firstName %>.
- Prioritize anything that provides narrative momentum, such as relationship details between <%= it.targetCharacter.firstName %> and other characters, actionable intentions between characters, plans, insights, or facts.
- If the information is hearsay or inferred rather than explicit, include appropriate hedging and qualifications in the output.
- When in doubt, err on the side of finding something to output even if it doesn't feel important.

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
<<%= it.focusedCharacter.firstName %>_persona>
<%= it.focusedCharacter.internalDescription %>

</<%= it.focusedCharacter.firstName %>_persona>

Here is the conversation transcript:
<transcript>
<%= it.transcript %>

</transcript>

And here are the current memories that <%= it.focusedCharacter.firstName %> has about <%= it.targetCharacter.firstName %> <%= it.targetCharacter.lastName %>:
<current_memory>
<%= it.targetCharacterRelationship?.memory || (it.focusedCharacter.firstName + ' does not have any memories about ' + it.targetCharacter.firstName + ' ' + it.targetCharacter.lastName + ' yet.') %>

</current_memory>

Return only one line:
- Either the extracted information string
- Or NONE if there is no relevant novel information.`;
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
    'Prompts for extracting information learned about a character not participating in the conversation.',
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    { template: offscreenMemoryExtractionSystemTemplate },
    { template: offscreenMemoryExtractionUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof targetedConversationExecutionContextSchema>, string | null>(
    `(response) => {
  if (response.includes('NONE')) {
    return null;
  }
    
  return response;
}`,
    'offscreen_memory_extraction_parser',
    z.union([z.string(), z.null()])
  ),
});
