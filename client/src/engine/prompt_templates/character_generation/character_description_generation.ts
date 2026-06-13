import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields';

class CharacterDescriptionGenerationSystemTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are a writing assistant tasked with generating an internal profile of a character.
Rules:
- Write three or four paragraphs that elucidate the personality, goals and motives, and internal life of the character.
- Write it like a manual for how to role play as this character.
- Write only the character description paragraph, nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Character Description Generation (System)';
  public readonly templateDescription =
    'System prompt for writing a complete character description from hints.';
  public readonly templateId = 'character_description_generation_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class CharacterDescriptionGenerationUserTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Generate an internal character profile for <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %>.

Here is some core information about <%= it.focusedCharacter.firstName %> <%= it.focusedCharacter.lastName %> to consider:
<hint>
<%= it.focusedCharacter.internalDescription || (
'Their personality traits include: ' + it.randomPersonalityTraits.join(', ')
) %>
</hint>

Write three or four paragraphs that elucidate the personality, goals and motives, and internal life of the character. Write it like a manual for how to role play as this character. Write only the character description paragraph, nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Character Description Generation (User)';
  public readonly templateDescription =
    'User prompt carrying character name and hint payload for description writing. The hint is a set of random selected personality traits.';
  public readonly templateId = 'character_description_generation_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const characterDescriptionGenerationSystemTemplate = new CharacterDescriptionGenerationSystemTemplate();
const characterDescriptionGenerationUserTemplate = new CharacterDescriptionGenerationUserTemplate();
export const characterDescriptionGenerationTemplateGroup = new PromptTemplateChain({
  templateChainId: 'gen_character_internal_description',
  templateChainTitle: 'Character Description Generation',
  templateChainDescription:
    'Templates for generating character descriptions from core traits and information.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [
    { template: characterDescriptionGenerationSystemTemplate },
    { template: characterDescriptionGenerationUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof characterEditorExecutionContextSchema>, string>(
    'async (response, it) => response',
    'character_description_generation_parser',
    z.string()
  ),
});
