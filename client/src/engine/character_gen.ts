import _ from 'lodash';
import {
  buildSillyTavernExtractionDescription,
  embedYozakuraCharacterInPng,
  extractSillyTavernNameParts,
  extractSillyTavernRawImportFields,
  type YozakuraCardPayload,
  type SillyTavernCardPayload,
  type DetectedCardMetadata,
} from './character_card_metadata.js';
import { type Character, type ParallelPromptJobConfig } from './types.js';
import { createWardrobe, DAILY_AUTOSELECT_TAG_PREFIX, formatPrefixedTag } from './wardrobes.js';
import {
  baseAppearanceGenerationTemplateChain,
  characterDescriptionGenerationTemplateChain,
  exampleDialogueTemplateChain,
  externalDescriptionGenerationTemplateChain,
  extractCharacterDescriptionTemplateChain,
  wardrobeGenerationTemplateChain,
} from './prompt_templates/character_generation/group.js';
import { newId } from '../util/id.js';
import { buildCharacterEditorContext } from './prompt_templates/prompt_context_builder.js';

export async function generateCharacterInternalDescription(character: Character): Promise<string> {
  return characterDescriptionGenerationTemplateChain.renderAndExecute(buildCharacterEditorContext(character));
}

export type GenerateFieldOptions = {
  jobConfig?: ParallelPromptJobConfig | undefined;
};

export async function generateCharacterExternalDescription(
  character: Character,
  options?: GenerateFieldOptions
): Promise<string> {
  return externalDescriptionGenerationTemplateChain.renderAndExecute(
    buildCharacterEditorContext(character),
    options
  );
}

export type ExtractCharacterCardField =
  'internalDescription' | 'externalDescription' | 'exampleDialogue' | 'baseAppearanceTags' | 'wardrobes';

export const ALL_EXTRACT_CHARACTER_CARD_FIELDS: readonly ExtractCharacterCardField[] = [
  'internalDescription',
  'externalDescription',
  'exampleDialogue',
  'baseAppearanceTags',
  'wardrobes',
] as const;

export type ExtractCharacterCardOptions = {
  onStep?: (step: string) => void;
  fields?: ExtractCharacterCardField[];
};

export async function extractCharacterCard(
  character: Character,
  onFieldGenerated?: <K extends keyof Character>(key: K, value: Character[K]) => void,
  options?: ExtractCharacterCardOptions
): Promise<void> {
  if (!character.firstName || !character.internalDescription) {
    throw new Error('Character firstName and description must be non-empty');
  }

  const onStep = options?.onStep;
  const fields = options?.fields ?? ALL_EXTRACT_CHARACTER_CARD_FIELDS;
  const shouldExtract = (field: ExtractCharacterCardField) => fields.includes(field);

  const charTag = `extract_character_${newId()}`;
  const makeJobConfig = (name: string): ParallelPromptJobConfig => ({
    name,
    tags: [charTag],
    exclusiveWithTags: [charTag],
    onStart: () => onStep?.(name),
  });

  const tasks: Promise<void>[] = [];

  if (shouldExtract('internalDescription')) {
    tasks.push(
      (async () => {
        const description = await extractCharacterDescriptionTemplateChain.renderAndExecute(
          buildCharacterEditorContext(character),
          { jobConfig: makeJobConfig('Extracting description') }
        );
        onFieldGenerated?.('internalDescription', description);
      })()
    );
  }

  if (shouldExtract('externalDescription')) {
    tasks.push(
      (async () => {
        const externalDescription = await generateCharacterExternalDescription(character, {
          jobConfig: makeJobConfig('Generating external description'),
        });
        onFieldGenerated?.('externalDescription', externalDescription);
      })()
    );
  }

  if (shouldExtract('exampleDialogue')) {
    tasks.push(
      (async () => {
        const exampleDialogue = await generateExampleDialogue(character, {
          jobConfig: makeJobConfig('Generating example dialogue'),
        });
        onFieldGenerated?.('exampleDialogue', exampleDialogue);
      })()
    );
  }

  if (shouldExtract('baseAppearanceTags')) {
    tasks.push(
      (async () => {
        const baseAppearanceTags = await generateBaseAppearanceTags(character, {
          jobConfig: makeJobConfig('Generating appearance'),
        });
        onFieldGenerated?.('baseAppearanceTags', baseAppearanceTags);
      })()
    );
  }

  if (shouldExtract('wardrobes')) {
    tasks.push(
      (async () => {
        const wardrobeText = await generateWardrobe(character, {
          jobConfig: makeJobConfig('Generating wardrobe'),
        });
        onFieldGenerated?.('wardrobes', [
          createWardrobe({
            text: wardrobeText,
            tags: [formatPrefixedTag(DAILY_AUTOSELECT_TAG_PREFIX, 'default')],
            enabled: true,
          }),
        ]);
      })()
    );
  }

  await Promise.all(tasks);
}

export async function generateExampleDialogue(
  character: Character,
  options?: GenerateFieldOptions
): Promise<string> {
  return exampleDialogueTemplateChain.renderAndExecute(buildCharacterEditorContext(character), options);
}

export async function generateBaseAppearanceTags(
  character: Character,
  options?: GenerateFieldOptions
): Promise<string> {
  return baseAppearanceGenerationTemplateChain.renderAndExecute(
    buildCharacterEditorContext(character),
    options
  );
}

export async function generateWardrobe(
  character: Character,
  options?: GenerateFieldOptions
): Promise<string> {
  return wardrobeGenerationTemplateChain.renderAndExecute(buildCharacterEditorContext(character), options);
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
    groupIds: [],
  };
}

export function mergeYozakuraCardIntoCharacter(
  character: Character,
  payload: YozakuraCardPayload
): Character {
  const importedCharacter = payload.character;
  const wardrobes =
    importedCharacter.wardrobes.length > 0
      ? importedCharacter.wardrobes.map((w) => createWardrobe(w))
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

export type CardImportMode = 'convert' | 'raw';

export function getImportedCardName(
  detected: DetectedCardMetadata
): { firstName: string; lastName: string } | undefined {
  if (detected.kind === 'none') {
    return undefined;
  }

  if (detected.kind === 'yozakura') {
    return {
      firstName: detected.payload.character.firstName,
      lastName: detected.payload.character.lastName ?? '',
    };
  }

  const nameParts = extractSillyTavernNameParts(detected.payload);
  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName ?? '',
  };
}

type BuildImportedCardCharacterOptions = {
  onStep?: (step: string) => void;
};

export async function buildImportedCardCharacter(
  detected: DetectedCardMetadata,
  mode: CardImportMode,
  options?: BuildImportedCardCharacterOptions
): Promise<Character | undefined> {
  if (detected.kind === 'none') {
    return undefined;
  }

  const base = createBlankCharacter();

  if (detected.kind === 'yozakura') {
    return mergeYozakuraCardIntoCharacter(base, detected.payload);
  }

  if (mode === 'raw') {
    return applySillyTavernRawImport(base, detected.payload);
  }

  const extractionCharacter = buildSillyTavernExtractionCharacter(base, detected.payload);
  const result: Character = { ...extractionCharacter };
  await extractCharacterCard(
    extractionCharacter,
    (key, value) => {
      result[key] = value;
    },
    options
  );

  return result;
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
