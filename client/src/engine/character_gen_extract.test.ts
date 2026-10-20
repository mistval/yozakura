import { describe, expect, it, vi } from 'vitest';
import { createBlankCharacter, extractCharacterCard } from './character_gen.js';
import { extractCharacterDescriptionTemplateGroup } from './prompt_templates/character_generation/extract_character_description.js';
import { externalDescriptionGenerationTemplateGroup } from './prompt_templates/character_generation/external_description_generation.js';
import { exampleDialogueTemplateGroup } from './prompt_templates/character_generation/example_dialogue.js';
import { baseAppearanceGenerationTemplateGroup } from './prompt_templates/character_generation/base_appearance_generation.js';
import { wardrobeGenerationTemplateGroup } from './prompt_templates/character_generation/wardrobe_generation.js';

describe('extractCharacterCard field selection', () => {
  it('only generates requested fields and preserves internalDescription when omitted', async () => {
    const character = {
      ...createBlankCharacter(),
      firstName: 'Alice',
      internalDescription: 'Original internal description from textarea',
    };

    const descriptionSpy = vi
      .spyOn(extractCharacterDescriptionTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('Extracted description');
    const externalSpy = vi
      .spyOn(externalDescriptionGenerationTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('External desc');
    const dialogueSpy = vi
      .spyOn(exampleDialogueTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('Dialogue text');
    const appearanceSpy = vi
      .spyOn(baseAppearanceGenerationTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('1girl, blue hair');
    const wardrobeSpy = vi
      .spyOn(wardrobeGenerationTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('casual clothes');

    const generatedFields: Record<string, unknown> = {};
    const onFieldGenerated = (key: string, value: unknown) => {
      generatedFields[key] = value;
    };

    // Only extract externalDescription and baseAppearanceTags
    await extractCharacterCard(character, onFieldGenerated as never, {
      fields: ['externalDescription', 'baseAppearanceTags'],
    });

    expect(descriptionSpy).not.toHaveBeenCalled();
    expect(dialogueSpy).not.toHaveBeenCalled();
    expect(wardrobeSpy).not.toHaveBeenCalled();

    expect(externalSpy).toHaveBeenCalledTimes(1);
    expect(appearanceSpy).toHaveBeenCalledTimes(1);

    // externalSpy should have received the character with the original internalDescription
    expect(externalSpy.mock.calls[0]![0].focusedCharacter.internalDescription).toBe(
      'Original internal description from textarea'
    );

    expect(generatedFields).toHaveProperty('externalDescription', 'External desc');
    expect(generatedFields).toHaveProperty('baseAppearanceTags', '1girl, blue hair');
    expect(generatedFields).not.toHaveProperty('internalDescription');
    expect(generatedFields).not.toHaveProperty('exampleDialogue');
    expect(generatedFields).not.toHaveProperty('wardrobes');

    descriptionSpy.mockRestore();
    externalSpy.mockRestore();
    dialogueSpy.mockRestore();
    appearanceSpy.mockRestore();
    wardrobeSpy.mockRestore();
  });

  it('generates all fields by default and passes raw input character description to all generators', async () => {
    const character = {
      ...createBlankCharacter(),
      firstName: 'Bob',
      internalDescription: 'Raw dump of wiki article',
    };

    const descriptionSpy = vi
      .spyOn(extractCharacterDescriptionTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('Distilled internal persona');
    const externalSpy = vi
      .spyOn(externalDescriptionGenerationTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('External desc');
    const dialogueSpy = vi
      .spyOn(exampleDialogueTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('Dialogue text');
    const appearanceSpy = vi
      .spyOn(baseAppearanceGenerationTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('1boy');
    const wardrobeSpy = vi
      .spyOn(wardrobeGenerationTemplateGroup, 'renderAndExecute')
      .mockResolvedValue('suit');

    const generatedFields: Record<string, unknown> = {};
    const onFieldGenerated = (key: string, value: unknown) => {
      generatedFields[key] = value;
    };

    await extractCharacterCard(character, onFieldGenerated as never);

    expect(descriptionSpy).toHaveBeenCalledTimes(1);
    expect(externalSpy).toHaveBeenCalledTimes(1);
    expect(dialogueSpy).toHaveBeenCalledTimes(1);
    expect(appearanceSpy).toHaveBeenCalledTimes(1);
    expect(wardrobeSpy).toHaveBeenCalledTimes(1);

    // Subsequent generators receive the raw input description, as originally designed
    expect(externalSpy.mock.calls[0]![0].focusedCharacter.internalDescription).toBe(
      'Raw dump of wiki article'
    );

    expect(generatedFields).toHaveProperty('internalDescription', 'Distilled internal persona');
    expect(generatedFields).toHaveProperty('externalDescription', 'External desc');
    expect(generatedFields).toHaveProperty('exampleDialogue', 'Dialogue text');
    expect(generatedFields).toHaveProperty('baseAppearanceTags', '1boy');
    expect(generatedFields).toHaveProperty('wardrobes');

    descriptionSpy.mockRestore();
    externalSpy.mockRestore();
    dialogueSpy.mockRestore();
    appearanceSpy.mockRestore();
    wardrobeSpy.mockRestore();
  });
});

