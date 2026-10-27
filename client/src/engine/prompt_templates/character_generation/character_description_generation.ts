import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const characterDescriptionGenerationChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_character_internal_description',
  defaultTitle: 'Character Description Generation',
  defaultDescription: 'Templates for generating character descriptions from core traits and information.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'character_description_generation_system',
      name: 'Character Description Generation (System)',
      description: 'System prompt for writing a complete character description from hints.',
      role: 'system',
      defaultTemplateString: `You are a writing assistant tasked with generating an internal profile of a character.
Rules:
- Write three or four paragraphs that elucidate the personality, goals and motives, and internal life of the character.
- Write it like a manual for how to role play as this character.
- Output only the character description, nothing else.`,
    },
    {
      templateId: 'character_description_generation_user',
      name: 'Character Description Generation (User)',
      description:
        'User prompt carrying character name and hint payload for description writing. The hint is a set of random selected personality traits.',
      role: 'user',
      defaultTemplateString: `Generate an internal character profile for <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %>.

Here is some core information about <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %> to consider:
<hint>
<%= it.focusedCharacter.internalDescription || (
'Their personality traits include: ' + it.randomPersonalityTraits.join(', ')
) %>
</hint>

Write three or four paragraphs that elucidate the personality, goals and motives, and internal life of the character. Write it like a manual for how to role play as this character. Output only the character description, nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
