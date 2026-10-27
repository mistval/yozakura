import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const wardrobeGenerationChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_character_wardrobe',
  defaultTitle: 'Wardrobe Generation',
  defaultDescription: 'Templates for generating clothing and accessory tags for characters.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'wardrobe_generation_system',
      name: 'Wardrobe Generation (System)',
      description: 'System prompt for generating comma-separated clothing/accessory tags.',
      role: 'system',
      defaultTemplateString: `You are helping generate characters for a social simulation. You must generate comma-separated appearance tags suitable for use as a Stable Diffusion image generation prompt.
Rules:
- Generate a list of comma-separated tags representing a character's clothing and accessories.
- Example output: blue jeans,red cardigan,white sneakers,canvas backpack
- You should describe what this character might typically wear on a regular day.
- Output ONLY the comma-separated tags, nothing else. Only describe clothing and accessories, not body attributes.`,
    },
    {
      templateId: 'wardrobe_generation_user',
      name: 'Wardrobe Generation (User)',
      description: 'User prompt carrying character details for wardrobe tag generation.',
      role: 'user',
      defaultTemplateString: `Here is the character description:
<description>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>

</description>

<% if (it.focusedCharacter.wardrobes.length) { %>
Here are the sets of tags we've already generated:
<existing_tag_sets>
<% for (const wardrobe of it.focusedCharacter.wardrobes) { %>
<tag_set>
<%= wardrobe.text %>

</tag_set>
<% } %>
</existing_tag_sets>

Generate a distinct list of comma-separated tags representing a set of clothing and accessories that the character might wear.
<% } else { %>
Generate a list of comma-separated tags representing a set of clothing and accessories that the character might wear.
<% } %>

Example output: blue jeans,red cardigan,white sneakers,canvas backpack

Generate clothing/accessory tags for this character now. Output ONLY the comma-separated tags, nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
