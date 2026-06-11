import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields';

class ExtractCharacterDescriptionSystemTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are a writing assistant tasked with extracting an internal character profile from unstructured text.
Rules:
- Distill a generalized profile of the character from the text, focusing on their personality, mannerisms, quirks, likes, dislikes, and interpersonal behavior.
- Write it like a manual for how to role play as this character.
- Strip away all world-specific lore, organization names, job titles, faction references, and scenario-specific context.
- Remove any reference to "the user" specifically, opting instead to focus on the character's internal compass.
- When in doubt, err on the side of keeping information and being detailed.
- Output the character profile and nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Extract Character Description (System)';
  public readonly templateDescription =
    'System prompt for distilling a reusable character description from source text.';
  public readonly templateId = 'extract_character_description_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ExtractCharacterDescriptionUserTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Extract a clean internal character profile from this text:
<text>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</text>`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Extract Character Description (User)';
  public readonly templateDescription =
    'User prompt carrying source text to extract a clean character summary.';
  public readonly templateId = 'extract_character_description_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const extractCharacterDescriptionSystemTemplate = new ExtractCharacterDescriptionSystemTemplate();
const extractCharacterDescriptionUserTemplate = new ExtractCharacterDescriptionUserTemplate();
export const extractCharacterDescriptionTemplateGroup = new PromptTemplateChain({
  templateChainId: 'gen_extract_character_description',
  templateChainTitle: 'Extract Character Description',
  templateChainDescription:
    'Prompt templates for extracting a Yozakura style character description from arbitrary source text.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    { template: extractCharacterDescriptionSystemTemplate },
    { template: extractCharacterDescriptionUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof characterEditorExecutionContextSchema>, string>(
    'async (response, it) => response',
    'extract_character_description_parser',
    z.string()
  ),
});
