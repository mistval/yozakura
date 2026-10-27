import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const CHARACTER_CARD_IMAGE_PROMPT_CHAIN_ID = 'gen_character_card_image_prompt';

const DEFAULT_PARSER_SOURCE = `async (response, it) => {
  return [it.imagePromptPrefix, it.focusedCharacterAppearance, response].join(',');
}`;

export const characterCardImagePromptChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: CHARACTER_CARD_IMAGE_PROMPT_CHAIN_ID,
  defaultTitle: 'Character Card Image Prompt',
  defaultDescription:
    'Prompts and parser used to generate the image prompt for character cards.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'character_card_image_prompt_system',
      name: 'Character Card Image (System)',
      description:
        'Optional system prompt for generating a character card image prompt. Leave empty to skip LLM generation.',
      role: 'system',
      defaultTemplateString: '',
    },
    {
      templateId: 'character_card_image_prompt_user',
      name: 'Character Card Image (User)',
      description:
        'Optional user prompt for generating a character card image prompt. Leave empty to skip LLM generation.',
      role: 'user',
      defaultTemplateString: '',
    },
  ],
  parser: {
    defaultParserSource: DEFAULT_PARSER_SOURCE,
    parserOutputSchema: z.string(),
  },
};
