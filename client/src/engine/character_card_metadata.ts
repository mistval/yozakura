import { addMetadata, getMetadata } from 'meta-png';
import { characterSchema, timestampSchema, wardrobeSchema } from './types.js';
import z from 'zod';
import { safeParseJson } from '../util/json.js';
import { CURRENT_CHARACTER_CARD_VERSION, runCharacterCardMigrations } from './character_card_migrator.js';

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
        tags: true,
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
  version: typeof CURRENT_CHARACTER_CARD_VERSION;
  exportedAt: string;
  character: YozakuraCardCharacterData;
};

type SillyTavernCardData = {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  example_dialogue?: unknown;
  tags?: unknown;
  creation_date?: unknown;
  modification_date?: unknown;
  create_date?: unknown;
};

export type SillyTavernCardPayload = {
  spec?: unknown;
  spec_version?: unknown;
  data: SillyTavernCardData;
};

export type DetectedCardMetadata =
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
    return decodeUtf8(Uint8Array.fromBase64(trimmed));
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

  const migrated = runCharacterCardMigrations(value);
  if (migrated.version !== CURRENT_CHARACTER_CARD_VERSION) {
    return undefined;
  }

  const parsedCharacter = exportedCharacterSchema.safeParse(migrated.character);
  if (!parsedCharacter.success) {
    return undefined;
  }

  const exportedAt = typeof migrated.exportedAt === 'string' ? migrated.exportedAt : new Date().toISOString();

  return {
    format: YOZAKURA_CHARACTER_CARD_FORMAT,
    version: CURRENT_CHARACTER_CARD_VERSION,
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
      creation_date: dataRecord.creation_date,
      modification_date: dataRecord.modification_date,
      create_date: dataRecord.create_date ?? value.create_date,
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
    version: CURRENT_CHARACTER_CARD_VERSION,
    exportedAt: new Date().toISOString(),
    character: exportedCharacterSchema.parse(character),
  };

  // PNG tEXt chunks use Latin-1 encoding; base64-encoded UTF-8 preserves non-Latin-1 characters.
  const encodedMetadata = new TextEncoder().encode(JSON.stringify(embedData)).toBase64();
  const withMetadata = addMetadata(pngBytes, YOZAKURA_METADATA_KEY, encodedMetadata);
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
  const firstName = tokens[0]?.trim();
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

const SILLY_TAVERN_V2_DATE_PATTERN =
  /^(\d{4})-(\d{1,2})-(\d{1,2})\s*@(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?$/i;

function parseCardTimestamp(candidate: unknown): string | undefined {
  if (typeof candidate === 'number') {
    if (!Number.isFinite(candidate) || candidate <= 0) {
      return undefined;
    }
    const ms = candidate < 1e12 ? candidate * 1000 : candidate;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof candidate !== 'string') {
    return undefined;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }

  const v2Match = SILLY_TAVERN_V2_DATE_PATTERN.exec(trimmed);
  if (v2Match) {
    const year = Number(v2Match[1]);
    const month = Number(v2Match[2]);
    const day = Number(v2Match[3]);
    const hour = Number(v2Match[4]);
    const minute = Number(v2Match[5]);
    const second = Number(v2Match[6]);
    const millisecond = v2Match[7] !== undefined ? Number(v2Match[7]) : 0;

    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    if (
      Number.isNaN(utcDate.getTime()) ||
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() !== month - 1 ||
      utcDate.getUTCDate() !== day ||
      utcDate.getUTCHours() !== hour ||
      utcDate.getUTCMinutes() !== minute ||
      utcDate.getUTCSeconds() !== second
    ) {
      return undefined;
    }
    return utcDate.toISOString();
  }

  if (timestampSchema.safeParse(trimmed).success) {
    return trimmed;
  }

  const parsedMs = Date.parse(trimmed);
  return Number.isNaN(parsedMs) ? undefined : new Date(parsedMs).toISOString();
}

export function extractSillyTavernTimestamps(
  payload: SillyTavernCardPayload,
  nowIso: string = new Date().toISOString()
): { createdAt: string; updatedAt: string } {
  const createdAt =
    parseCardTimestamp(payload.data.creation_date) ?? parseCardTimestamp(payload.data.create_date) ?? nowIso;
  const updatedAt = parseCardTimestamp(payload.data.modification_date) ?? createdAt;

  return { createdAt, updatedAt };
}
