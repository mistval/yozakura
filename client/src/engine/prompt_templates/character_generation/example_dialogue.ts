import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { characterEditorExecutionContextSchema } from '../prompt_template_context_fields';

class ExampleDialogueSystemTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You are a writing assistant that generates example dialog for a character based on their description.
Rules:
- Write around five newline-separated lines of dialog spoken by the character.
- Each line should be prefixed with the character's first name, followed by a colon and a space. For example: "Alice: Hello there!"
- Each line of dialog should reflect the character's unique personality and mannerisms.
- Output only the five lines of dialog, nothing else.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Example Dialogue (System)';
  public readonly templateDescription = 'System prompt for generating five lines of character dialogue.';
  public readonly templateId = 'example_dialogue_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ExampleDialogueUserTemplate extends PromptTemplateBase<
  z.infer<typeof characterEditorExecutionContextSchema>
> {
  public readonly defaultTemplateString = `<character>
<%= it.focusedCharacter.internalDescription.replaceAll('{{user}}', 'the user').replaceAll('{{char}}', it.focusedCharacter.firstName) %>
</character>

Write five lines of example dialog spoken by this character. The example dialog lines should demonstrate the character's unique personality.`;

  public readonly contextSchema = characterEditorExecutionContextSchema;

  public readonly templateName = 'Example Dialogue (User)';
  public readonly templateDescription = 'User prompt carrying character text for dialogue generation.';
  public readonly templateId = 'example_dialogue_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const exampleDialogueSystemTemplate = new ExampleDialogueSystemTemplate();
const exampleDialogueUserTemplate = new ExampleDialogueUserTemplate();
export const exampleDialogueTemplateGroup = new PromptTemplateChain({
  templateChainId: 'gen_character_example_dialog',
  templateChainTitle: 'Example Dialogue Generation',
  templateChainDescription:
    'Prompt templates for generating example dialogue lines for a character based on their description.',
  contextSchema: characterEditorExecutionContextSchema,
  templates: [{ template: exampleDialogueSystemTemplate }, { template: exampleDialogueUserTemplate }],
  parser: new PromptOutputParser<z.infer<typeof characterEditorExecutionContextSchema>, string>(
    'async (response, it) => response',
    'example_dialogue_parser',
    z.string()
  ),
});
