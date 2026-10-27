import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const baseAppearanceGenerationChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_character_base_appearance',
  defaultTitle: 'Base Appearance Generation',
  defaultDescription:
    'Prompt templates for generating comma-separated visual appearance tags describing a character, without any reference to clothing or accessories.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'base_appearance_generation_system',
      name: 'Base Appearance Generation (System)',
      description: 'System prompt for generating comma-separated visual appearance tags (no clothing).',
      role: 'system',
      defaultTemplateString: `You are helping generate characters for a social simulation. You must generate comma-separated appearance tags suitable for use as a Stable Diffusion image generation prompt.
Rules:
- Generate a list of comma-separated tags representing a character's physical appearance, WITHOUT any reference to clothing or accessories.
- Example output: female,blonde,shoulder-length hair,short stature,blue eyes,kind face,light freckles
- You should describe features like: gender,hair color, hair style, hair length, eye color, body type, height, facial features, skin tone, distinguishing features, etc.
- Output ONLY the comma-separated tags, nothing else. Do not include clothing or accessories.`,
    },
    {
      templateId: 'base_appearance_generation_user',
      name: 'Base Appearance Generation (User)',
      description: 'User prompt carrying character details for appearance tag generation.',
      role: 'user',
      defaultTemplateString: `Character description:
<description>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</description>

Generate appearance tags for this character now. Output ONLY the comma-separated tags, nothing else. Do not include clothing or accessories.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
