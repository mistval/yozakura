import { addMetadata, getMetadata } from 'meta-png';
import { characterSchema, wardrobeSchema } from './types.js';
import z from 'zod';
import { safeParseJson } from '../util/json.js';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const YOZAKURA_METADATA_KEY = 'yozakura_character';
const SILLY_TAVERN_METADATA_KEYS = [
  'chara',
  'ccv3',
  'character',
  'character_card',
  'card',
  'data',
  'metadata',
  'json',
] as const;

const exportedCharacterSchema = characterSchema
  .pick({
    firstName: true,
    lastName: true,
    internalDescription: true,
    externalDescription: true,
    exampleDialogue: true,
    baseAppearanceTags: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    wardrobes: z.array(
      wardrobeSchema.pick({
        autoSelectGroup: true,
        autoRevert: true,
        text: true,
        createdAt: true,
        updatedAt: true,
      })
    ),
  });

type YozakuraCardCharacterData = z.infer<typeof exportedCharacterSchema>;
const YOZAKURA_CHARACTER_CARD_FORMAT = 'yozakura_character_card';

export type YozakuraCardPayload = {
  format: typeof YOZAKURA_CHARACTER_CARD_FORMAT;
  version: '1';
  exportedAt: string;
  character: YozakuraCardCharacterData;
};

type SillyTavernCardData = {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  example_dialogue?: unknown;
  tags?: unknown;
};

export type SillyTavernCardPayload = {
  spec?: unknown;
  spec_version?: unknown;
  data: SillyTavernCardData;
};

type DetectedCardMetadata =
  | { kind: 'none' }
  | { kind: 'yozakura'; payload: YozakuraCardPayload }
  | { kind: 'sillytavern'; payload: SillyTavernCardPayload };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function isPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function getMetadataValueByKey(pngBytes: Uint8Array, key: string): string | undefined {
  try {
    const value = getMetadata(pngBytes, key);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function collectPngMetadataTextCandidates(pngBytes: Uint8Array): string[] {
  const values: string[] = [];

  const yozakuraValue = getMetadataValueByKey(pngBytes, YOZAKURA_METADATA_KEY);
  if (yozakuraValue) {
    values.push(yozakuraValue);
  }

  for (const key of SILLY_TAVERN_METADATA_KEYS) {
    const value = getMetadataValueByKey(pngBytes, key);
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function tryDecodeBase64(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return decodeUtf8(bytes);
  } catch {
    return undefined;
  }
}

function collectJsonCandidates(text: string): unknown[] {
  const candidates: unknown[] = [];
  const direct = safeParseJson(text.trim());
  if (direct !== undefined) {
    candidates.push(direct);
  }

  const base64Decoded = tryDecodeBase64(text);
  if (base64Decoded) {
    const decodedJson = safeParseJson(base64Decoded.trim());
    if (decodedJson !== undefined) {
      candidates.push(decodedJson);
    }
  }

  return candidates;
}

function toYozakuraCardPayload(value: unknown): YozakuraCardPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.format !== YOZAKURA_CHARACTER_CARD_FORMAT) {
    return undefined;
  }

  const parsedCharacter = exportedCharacterSchema.safeParse(value.character);
  if (!parsedCharacter.success) {
    return undefined;
  }

  const exportedAt = typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString();

  return {
    format: YOZAKURA_CHARACTER_CARD_FORMAT,
    version: '1',
    exportedAt,
    character: parsedCharacter.data,
  };
}

function toSillyTavernCardPayload(value: unknown): SillyTavernCardPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dataRecord = isRecord(value.data) ? value.data : value;

  const hasSillyFields =
    'description' in dataRecord ||
    'personality' in dataRecord ||
    'example_dialogue' in dataRecord ||
    'tags' in dataRecord ||
    'name' in dataRecord;

  if (!hasSillyFields) {
    return undefined;
  }

  return {
    spec: value.spec,
    spec_version: value.spec_version,
    data: {
      name: dataRecord.name,
      description: dataRecord.description,
      personality: dataRecord.personality,
      example_dialogue: dataRecord.mes_example || dataRecord.example_dialogue,
      tags: dataRecord.tags,
    },
  };
}

export async function detectCharacterCardMetadata(file: File): Promise<DetectedCardMetadata> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPngBytes(bytes)) {
    return { kind: 'none' };
  }

  const metadataTextCandidates = collectPngMetadataTextCandidates(bytes);

  for (const text of metadataTextCandidates) {
    const candidates = collectJsonCandidates(text);
    for (const candidate of candidates) {
      const payload = toYozakuraCardPayload(candidate);
      if (payload) {
        return { kind: 'yozakura', payload };
      }
    }
  }

  for (const text of metadataTextCandidates) {
    const candidates = collectJsonCandidates(text);
    for (const candidate of candidates) {
      const payload = toSillyTavernCardPayload(candidate);
      if (payload) {
        return { kind: 'sillytavern', payload };
      }
    }
  }

  return { kind: 'none' };
}

export function embedYozakuraCharacterInPng(
  pngBytes: Uint8Array,
  character: YozakuraCardCharacterData
): Uint8Array<ArrayBuffer> {
  if (!isPngBytes(pngBytes)) {
    throw new Error('Character card export currently supports PNG images only.');
  }

  const embedData = {
    format: YOZAKURA_CHARACTER_CARD_FORMAT,
    version: '1',
    exportedAt: new Date().toISOString(),
    character: exportedCharacterSchema.parse(character),
  };

  const withMetadata = addMetadata(pngBytes, YOZAKURA_METADATA_KEY, JSON.stringify(embedData));
  const outputBuffer = new ArrayBuffer(withMetadata.byteLength);
  const outputBytes = new Uint8Array(outputBuffer);
  outputBytes.set(withMetadata);
  return outputBytes;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function tagsToText(tags: unknown): string {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  return typeof tags === 'string' ? tags : '';
}

export function buildSillyTavernExtractionDescription(payload: SillyTavernCardPayload): string {
  const description = toStringValue(payload.data.description);
  const personality = toStringValue(payload.data.personality);
  const exampleDialogue = toStringValue(payload.data.example_dialogue);
  const tags = tagsToText(payload.data.tags);

  return [
    `<description>${description}</description>`,
    `<personality>${personality}</personality>`,
    `<example_dialogue>${exampleDialogue}</example_dialogue>`,
    `<tags>${tags}</tags>`,
  ].join('\n');
}

export function extractSillyTavernNameParts(payload: SillyTavernCardPayload): {
  firstName: string;
  lastName?: string;
} {
  const rawName = toStringValue(payload.data.name).trim();
  if (!rawName) {
    return { firstName: 'NameUnknown' };
  }

  const tokens = rawName.split(/\s+/).filter(Boolean);
  const firstName = tokens[0];
  if (!firstName) {
    return { firstName: 'NameUnknown' };
  }

  const lastName = tokens.slice(1).join(' ').trim();
  return {
    firstName,
    lastName,
  };
}

export function extractSillyTavernRawImportFields(payload: SillyTavernCardPayload): {
  firstName?: string;
  lastName?: string;
  internalDescription?: string;
  exampleDialogue?: string;
} {
  const nameParts = extractSillyTavernNameParts(payload);
  const description = toStringValue(payload.data.description).trim();
  const personality = toStringValue(payload.data.personality).trim();
  const exampleDialogue = toStringValue(payload.data.example_dialogue).trim();
  const internalDescription = [description, personality].filter(Boolean).join('\n\n');

  return {
    ...nameParts,
    internalDescription,
    exampleDialogue,
  };
}
