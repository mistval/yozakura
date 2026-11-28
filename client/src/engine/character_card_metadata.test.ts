import { addMetadata } from 'meta-png';
import { describe, expect, it } from 'vitest';
import {
  detectCharacterCardMetadata,
  embedYozakuraCharacterInPng,
  extractSillyTavernTimestamps,
} from './character_card_metadata.js';
import { CURRENT_CHARACTER_CARD_VERSION, runCharacterCardMigrations } from './character_card_migrator.js';
import {
  applySillyTavernRawImport,
  buildSillyTavernExtractionCharacter,
  createBlankCharacter,
} from './character_gen.js';
import { timestampSchema } from './types.js';

const MINIMAL_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21,
  196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73,
  69, 78, 68, 174, 66, 96, 130,
]);

describe('character card import migrations', () => {
  it('migrates v1 character card wardrobes with autoSelectGroup to v2 with tags', () => {
    const rawV1Card = {
      format: 'yozakura_character_card',
      version: '1',
      exportedAt: '2026-01-01T00:00:00.000Z',
      character: {
        firstName: 'Alice',
        lastName: 'Smith',
        internalDescription: 'Alice persona',
        externalDescription: 'Alice looks friendly',
        exampleDialogue: 'Alice: Hello!',
        baseAppearanceTags: '1girl, brown hair',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        wardrobes: [
          {
            text: 'casual jacket',
            autoSelectGroup: 'outerwear',
            autoRevert: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            text: 'plain t-shirt',
            autoSelectGroup: '',
            autoRevert: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    };

    const migrated = runCharacterCardMigrations(rawV1Card);

    expect(migrated.version).toBe(CURRENT_CHARACTER_CARD_VERSION);
    expect(migrated.version).toBe('3');

    const character = migrated.character as any;
    expect(character.wardrobes[0].tags).toEqual(['daily_autoselect:outerwear']);
    expect(character.wardrobes[1].tags).toEqual([]);
    // Retains autoSelectGroup on raw data if present
    expect(character.wardrobes[0].autoSelectGroup).toBe('outerwear');

    // Asserts original input was not mutated
    expect(rawV1Card.version).toBe('1');
    expect((rawV1Card.character.wardrobes[0] as any).tags).toBeUndefined();
  });

  it('migrates v2 character cards with empty root timestamps to v3 using exportedAt', () => {
    const rawV2Card = {
      format: 'yozakura_character_card',
      version: '2',
      exportedAt: '2026-01-01T00:00:00.000Z',
      character: {
        firstName: 'Bob',
        createdAt: '',
        updatedAt: '',
        wardrobes: [
          {
            text: 'suit',
            tags: ['formal', 'daily_autoselect:work'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    };

    const migrated = runCharacterCardMigrations(rawV2Card);
    expect(migrated.version).toBe('3');
    const character = migrated.character as Record<string, unknown>;
    expect(character.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(character.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    const wardrobes = character.wardrobes as Array<Record<string, unknown>>;
    expect(wardrobes[0]?.tags).toEqual(['formal', 'daily_autoselect:work']);
  });
});

describe('SillyTavern card timestamp extraction and import', () => {
  it('extracts V3 numeric Unix timestamps, V2 @h m s ms strings, or falls back to current date', async () => {
    const unixCreated = 1_700_000_000;
    const unixUpdated = 1_700_100_000;
    const v3Json = JSON.stringify({
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Seraphina Vale',
        description: 'Archivist.',
        creation_date: unixCreated,
        modification_date: unixUpdated,
      },
    });
    const encodedV3 = new TextEncoder().encode(v3Json).toBase64();
    const pngWithV3 = new Uint8Array(addMetadata(MINIMAL_PNG, 'ccv3', encodedV3));
    const detected = await detectCharacterCardMetadata(
      new File([pngWithV3], 'sillytavern-v3.png', { type: 'image/png' })
    );
    expect(detected.kind).toBe('sillytavern');
    if (detected.kind !== 'sillytavern') {
      throw new Error('Expected SillyTavern card');
    }

    const base = createBlankCharacter();
    const rawImported = applySillyTavernRawImport(base, detected.payload);
    expect(rawImported.createdAt).toBe(new Date(unixCreated * 1000).toISOString());
    expect(rawImported.updatedAt).toBe(new Date(unixUpdated * 1000).toISOString());
    expect(timestampSchema.safeParse(rawImported.createdAt).success).toBe(true);
    expect(timestampSchema.safeParse(rawImported.updatedAt).success).toBe(true);

    const extractedChar = buildSillyTavernExtractionCharacter(base, detected.payload);
    expect(extractedChar.createdAt).toBe(new Date(unixCreated * 1000).toISOString());

    const v2Parsed = extractSillyTavernTimestamps({
      data: {
        name: 'V2 Char',
        create_date: '2024-3-15 @12h 30m 05s 250ms',
      },
    });
    expect(v2Parsed.createdAt).toBe('2024-03-15T12:30:05.250Z');
    expect(v2Parsed.updatedAt).toBe('2024-03-15T12:30:05.250Z');

    const fallbackIso = '2026-11-26T12:00:00.000Z';
    const missingDates = extractSillyTavernTimestamps({ data: { name: 'Undated Char' } }, fallbackIso);
    expect(missingDates.createdAt).toBe(fallbackIso);
    expect(missingDates.updatedAt).toBe(fallbackIso);
  });
});

describe('character card PNG metadata round-trip', () => {
  it('preserves non-Latin-1 characters such as emoji, CJK, and smart quotes', async () => {
    const exportedPng = embedYozakuraCharacterInPng(MINIMAL_PNG, {
      firstName: '夜桜',
      lastName: '花🌸',
      internalDescription: '“Smart quotes” and 日本語 description',
      externalDescription: '1girl, sakura 🌸',
      exampleDialogue: '夜桜: “こんにちは！” ✨',
      baseAppearanceTags: 'kimono',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      wardrobes: [],
    });

    const detected = await detectCharacterCardMetadata(
      new File([exportedPng], 'card.png', { type: 'image/png' })
    );
    expect(detected.kind).toBe('yozakura');
    if (detected.kind !== 'yozakura') {
      throw new Error('Expected yozakura card metadata');
    }
    expect(detected.payload.character.firstName).toBe('夜桜');
    expect(detected.payload.character.lastName).toBe('花🌸');
    expect(detected.payload.character.internalDescription).toBe('“Smart quotes” and 日本語 description');
    expect(detected.payload.character.exampleDialogue).toBe('夜桜: “こんにちは！” ✨');
  });
});
