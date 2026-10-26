import { z } from 'zod';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const externalDescriptionGenerationChainSpec: PromptTemplateChainSpec<
  z.infer<typeof characterEditorExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_character_external_description',
  defaultTitle: 'External Description Generation',
  defaultDescription:
    'Templates for generating a short public-facing character description from internal character details.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'external_description_generation_system',
      name: 'External Description Generation (System)',
      description:
        'System prompt for writing a short public-facing character description from internal character details.',
      role: 'system',
      defaultTemplateString: `You are a writing assistant tasked with writing a short public-facing description of a character.
Rules:
- Write two or three sentences describing how this character appears and comes across to others.
- Focus on externally observable details: appearance, demeanor, social presence, and any other traits visible to strangers or acquaintances.
- Do not reveal internal motivations, secrets, or backstory that others would not observe.
- Output only the description, nothing else.`,
    },
    {
      templateId: 'external_description_generation_user',
      name: 'External Description Generation (User)',
      description: 'User prompt for generating a public-facing description from internal character details.',
      role: 'user',
      defaultTemplateString: `Write a short public-facing description for <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %>.

Here is the internal character information to draw from:
<internal>
<%= it.focusedCharacter.internalDescription %>
</internal>

Write two or three sentences describing how this character appears and comes across to others. Focus on externally observable details: appearance, demeanor, and social presence. Write only the description, nothing else.`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
