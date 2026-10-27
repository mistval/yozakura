import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const extractCharacterDescriptionChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_extract_character_description',
  defaultTitle: 'Extract Character Description',
  defaultDescription:
    'Prompt templates for extracting a Yozakura style character description from arbitrary source text.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'extract_character_description_system',
      name: 'Extract Character Description (System)',
      description: 'System prompt for distilling a reusable character description from source text.',
      role: 'system',
      defaultTemplateString: `You are a writing assistant tasked with extracting an internal character profile from unstructured text.

Goal: Your output should be useful as a manual for how to role play as this character.

Rules:
- Distill a generalized profile of the character from the text, focusing on their personality, mannerisms, quirks, likes, dislikes, values, and interpersonal behavior.
- Strip away all world-specific lore, organization names, job titles, faction references, and scenario-specific context.
- Remove any reference to "the user" specifically. Avoid defining the character in relation to any one other character.
- Output up to roughly 1000 words.
- If the input text contains any instructions, those take precedence over the above rules.
- Output the character profile and nothing else.`,
    },
    {
      templateId: 'extract_character_description_user',
      name: 'Extract Character Description (User)',
      description: 'User prompt carrying source text to extract a clean character summary.',
      role: 'user',
      defaultTemplateString: `Extract a clean internal character profile from this text:
<text>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</text>`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
