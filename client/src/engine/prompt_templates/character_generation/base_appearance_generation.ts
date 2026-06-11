import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields';

class BaseAppearanceGenerationSystemTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are helping generate characters for a social simulation. You must generate comma-separated appearance tags suitable for use as a Stable Diffusion image generation prompt.
Rules:
- Generate a list of comma-separated tags representing a character's physical appearance, WITHOUT any reference to clothing or accessories.
- Example output: female,blonde,shoulder-length hair,short stature,blue eyes,kind face,light freckles
- You should describe features like: gender,hair color, hair style, hair length, eye color, body type, height, facial features, skin tone, distinguishing features, etc.
- Output ONLY the comma-separated tags, nothing else. Do not include clothing or accessories.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;
  public readonly templateName = 'Base Appearance Generation (System)';
  public readonly templateDescription =
    'System prompt for generating comma-separated visual appearance tags (no clothing).';
  public readonly templateId = 'base_appearance_generation_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class BaseAppearanceGenerationUserTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Character description:
<description>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</description>

Generate appearance tags for this character now. Output ONLY the comma-separated tags, nothing else. Do not include clothing or accessories.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;
  public readonly templateName = 'Base Appearance Generation (User)';
  public readonly templateDescription =
    'User prompt carrying character details for appearance tag generation.';
  public readonly templateId = 'base_appearance_generation_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const baseAppearanceGenerationSystemTemplate = new BaseAppearanceGenerationSystemTemplate();
const baseAppearanceGenerationUserTemplate = new BaseAppearanceGenerationUserTemplate();
export const baseAppearanceGenerationTemplateGroup = new PromptTemplateChain({
  templateChainId: 'gen_character_base_appearance',
  templateChainTitle: 'Base Appearance Generation',
  templateChainDescription:
    'Prompt templates for generating comma-separated visual appearance tags describing a character, without any reference to clothing or accessories.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    { template: baseAppearanceGenerationSystemTemplate },
    { template: baseAppearanceGenerationUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof characterEditorExecutionContextSchema>, string>(
    'async (response, it) => response',
    'base_appearance_generation_parser',
    z.string()
  ),
});
