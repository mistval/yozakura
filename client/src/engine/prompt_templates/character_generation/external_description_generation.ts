import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields';

class ExternalDescriptionGenerationSystemTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are a writing assistant tasked with writing a short public-facing description of a character.
Rules:
- Write two or three sentences describing how this character appears and comes across to others.
- Focus on externally observable details: appearance, demeanor, social presence, and any other traits visible to strangers or acquaintances.
- Do not reveal internal motivations, secrets, or backstory that others would not observe.
- Output only the description, nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'External Description Generation (System)';
  public readonly templateDescription =
    'System prompt for writing a short public-facing character description from internal character details.';
  public readonly templateId = 'external_description_generation_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ExternalDescriptionGenerationUserTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Write a short public-facing description for <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %>.

Here is the internal character information to draw from:
<internal>
<%= it.focusedCharacter.internalDescription %>
</internal>

Write two or three sentences describing how this character appears and comes across to others. Focus on externally observable details: appearance, demeanor, and social presence. Write only the description, nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'External Description Generation (User)';
  public readonly templateDescription =
    'User prompt for generating a public-facing description from internal character details.';
  public readonly templateId = 'external_description_generation_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const externalDescriptionGenerationSystemTemplate = new ExternalDescriptionGenerationSystemTemplate();
const externalDescriptionGenerationUserTemplate = new ExternalDescriptionGenerationUserTemplate();
export const externalDescriptionGenerationTemplateGroup = new PromptTemplateChain({
  templateChainId: 'gen_character_external_description',
  templateChainTitle: 'External Description Generation',
  templateChainDescription:
    'Templates for generating a short public-facing character description from internal character details.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    { template: externalDescriptionGenerationSystemTemplate },
    { template: externalDescriptionGenerationUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof characterEditorExecutionContextSchema>, string>(
    'async (response, it) => response',
    'external_description_generation_parser',
    z.string()
  ),
});
