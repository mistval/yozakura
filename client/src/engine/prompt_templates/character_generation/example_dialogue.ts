import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const exampleDialogueChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_character_example_dialog',
  defaultTitle: 'Example Dialogue Generation',
  defaultDescription:
    'Prompt templates for generating example dialogue lines for a character based on their description.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'example_dialogue_system',
      name: 'Example Dialogue (System)',
      description: 'System prompt for generating five lines of character dialogue.',
      role: 'system',
      defaultTemplateString: `You are a writing assistant that generates example dialog for a character based on their description.
Rules:
- Write around five newline-separated lines of dialog spoken by the character.
- Each line should be prefixed with the character's first name, followed by a colon and a space. For example: "Alice: Hello there!"
- Each line of dialog should reflect the character's unique personality and mannerisms.
- Output only the five lines of dialog, nothing else.`,
    },
    {
      templateId: 'example_dialogue_user',
      name: 'Example Dialogue (User)',
      description: 'User prompt carrying character text for dialogue generation.',
      role: 'user',
      defaultTemplateString: `<character>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</character>

Write five lines of example dialog spoken by this character. The example dialog lines should demonstrate the character's unique personality.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
