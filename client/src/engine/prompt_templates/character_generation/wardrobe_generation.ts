import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields';

class WardrobeGenerationSystemTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are helping generate characters for a social simulation. You must generate comma-separated appearance tags suitable for use as a Stable Diffusion image generation prompt.
Rules:
- Generate a list of comma-separated tags representing a character's clothing and accessories.
- Example output: blue jeans,red cardigan,white sneakers,canvas backpack
- You should describe what this character might typically wear on a regular day.
- Output ONLY the comma-separated tags, nothing else. Only describe clothing and accessories, not body attributes.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Wardrobe Generation (System)';
  public readonly templateDescription =
    'System prompt for generating comma-separated clothing/accessory tags.';
  public readonly templateId = 'wardrobe_generation_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class WardrobeGenerationUserTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Generate a list of comma-separated tags representing a character's typical clothing and accessories.

Example output: blue jeans,red cardigan,white sneakers,canvas backpack

The tags should describe what this character might typically wear on a regular day.

Character description:
<description>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</description>

Generate clothing/accessory tags for this character now. Output ONLY the comma-separated tags, nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Wardrobe Generation (User)';
  public readonly templateDescription = 'User prompt carrying character details for wardrobe tag generation.';
  public readonly templateId = 'wardrobe_generation_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const wardrobeGenerationSystemTemplate = new WardrobeGenerationSystemTemplate();
const wardrobeGenerationUserTemplate = new WardrobeGenerationUserTemplate();
export const wardrobeGenerationTemplateGroup = new PromptTemplateChain({
  templateChainId: 'gen_character_wardrobe',
  templateChainTitle: 'Wardrobe Generation',
  templateChainDescription: 'Templates for generating clothing and accessory tags for characters.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [{ template: wardrobeGenerationSystemTemplate }, { template: wardrobeGenerationUserTemplate }],
  parser: new PromptOutputParser<z.infer<typeof characterEditorExecutionContextSchema>, string>(
    'async (response, it) => response',
    'wardrobe_generation_parser',
    z.string()
  ),
});
