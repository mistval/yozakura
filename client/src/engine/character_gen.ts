import _ from 'lodash';
import {
  buildSillyTavernExtractionDescription,
  embedYozakuraCharacterInPng,
  extractSillyTavernNameParts,
  extractSillyTavernRawImportFields,
  type YozakuraCardPayload,
  type SillyTavernCardPayload,
} from './character_card_metadata.js';
import { type Character } from './types.js';
import { createWardrobe } from './wardrobes.js';
import { characterDescriptionGenerationTemplateGroup } from './prompt_templates/character_generation/character_description_generation.js';
import { externalDescriptionGenerationTemplateGroup } from './prompt_templates/character_generation/external_description_generation.js';
import { extractCharacterDescriptionTemplateGroup } from './prompt_templates/character_generation/extract_character_description.js';
import { exampleDialogueTemplateGroup } from './prompt_templates/character_generation/example_dialogue.js';
import { baseAppearanceGenerationTemplateGroup } from './prompt_templates/character_generation/base_appearance_generation.js';
import { wardrobeGenerationTemplateGroup } from './prompt_templates/character_generation/wardrobe_generation.js';
import { newId } from '../util/id.js';
import { buildCharacterEditorContext } from './prompt_templates/prompt_context_builder.js';

export async function generateCharacterInternalDescription(character: Character): Promise<string> {
  return characterDescriptionGenerationTemplateGroup.renderAndExecute(buildCharacterEditorContext(character));
}

export async function generateCharacterExternalDescription(character: Character): Promise<string> {
  return externalDescriptionGenerationTemplateGroup.renderAndExecute(buildCharacterEditorContext(character));
}

export async function extractCharacterCard(
  character: Character,
  onFieldGenerated?: <K extends keyof Character>(key: K, value: Character[K]) => void
): Promise<{
  description: string;
  exampleDialogue: string;
  baseAppearanceTags: string;
  wardrobeTags: string;
}> {
  if (!character.firstName || !character.internalDescription) {
    throw new Error('Character firstName and description must be non-empty');
  }

  const description = await extractCharacterDescriptionTemplateGroup.renderAndExecute(
    buildCharacterEditorContext(character)
  );

  onFieldGenerated?.('internalDescription', description);
  const externalDescription = await generateCharacterExternalDescription(character);
  onFieldGenerated?.('externalDescription', externalDescription);
  const exampleDialogue = await generateExampleDialogue(character);
  onFieldGenerated?.('exampleDialogue', exampleDialogue);
  const baseAppearanceTags = await generateBaseAppearanceTags(character);
  onFieldGenerated?.('baseAppearanceTags', baseAppearanceTags);
  const wardrobeTags = await generateWardrobe(character);
  onFieldGenerated?.('wardrobes', [createWardrobe(wardrobeTags, 'default')]);

  return {
    description,
    exampleDialogue,
    baseAppearanceTags,
    wardrobeTags,
  };
}

export async function generateExampleDialogue(character: Character): Promise<string> {
  return exampleDialogueTemplateGroup.renderAndExecute(buildCharacterEditorContext(character));
}

export async function generateBaseAppearanceTags(character: Character): Promise<string> {
  return baseAppearanceGenerationTemplateGroup.renderAndExecute(buildCharacterEditorContext(character));
}

export async function generateWardrobe(character: Character): Promise<string> {
  return wardrobeGenerationTemplateGroup.renderAndExecute(buildCharacterEditorContext(character));
}

export function createBlankCharacter(): Character {
  const id = newId();

  return {
    id,
    globalCharacterId: id,
    scenarioId: '',
    firstName: '',
    lastName: '',
    internalDescription: '',
    externalDescription: '',
    baseAppearanceTags: '',
    imagePath: '',
    globalMemories: '',
    locationId: '',
    wardrobes: [],
    exampleDialogue: '',
    createdAt: '',
    updatedAt: '',
    rollingConversationSummaries: [],
    nextConversationWithCharacterId: '',
  };
}

export function mergeYozakuraCardIntoCharacter(
  character: Character,
  payload: YozakuraCardPayload
): Character {
  const importedCharacter = payload.character;
  const wardrobes =
    importedCharacter.wardrobes.length > 0
      ? importedCharacter.wardrobes.map((w) => createWardrobe(w.text, w.autoSelectGroup))
      : character.wardrobes;

  return {
    ...character,
    ..._.pickBy(importedCharacter),
    wardrobes,
  };
}

export function buildSillyTavernExtractionCharacter(
  character: Character,
  payload: SillyTavernCardPayload
): Character {
  const extractionDescription = buildSillyTavernExtractionDescription(payload);
  const nameParts = extractSillyTavernNameParts(payload);

  return {
    ...character,
    ..._.pickBy(nameParts),
    internalDescription: extractionDescription,
  };
}

export function applySillyTavernRawImport(character: Character, payload: SillyTavernCardPayload): Character {
  const importedFields = extractSillyTavernRawImportFields(payload);

  return {
    ...character,
    firstName: importedFields.firstName || character.firstName,
    lastName: importedFields.lastName ?? character.lastName,
    internalDescription: importedFields.internalDescription || character.internalDescription,
    exampleDialogue: importedFields.exampleDialogue || character.exampleDialogue,
  };
}

function sanitizeCharacterSlugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

export function buildCharacterCardExportFilename(character: Character): string {
  const first = sanitizeCharacterSlugPart(character.firstName);
  const last = sanitizeCharacterSlugPart(character.lastName);
  const base = [first, last].filter(Boolean).join('-') || 'character';
  return `${base}-yozakura-card.png`;
}

export function buildYozakuraCardExportBytes(
  character: Character,
  sourcePngBytes: Uint8Array
): Uint8Array<ArrayBuffer> {
  return embedYozakuraCharacterInPng(sourcePngBytes, character);
}
