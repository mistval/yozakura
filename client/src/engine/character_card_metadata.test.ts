import { describe, expect, it } from 'vitest';
import { detectCharacterCardMetadata, embedYozakuraCharacterInPng } from './character_card_metadata.js';
import { CURRENT_CHARACTER_CARD_VERSION, runCharacterCardMigrations } from './character_card_migrator.js';

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
    expect(migrated.version).toBe('2');

    const character = migrated.character as any;
    expect(character.wardrobes[0].tags).toEqual(['daily_autoselect:outerwear']);
    expect(character.wardrobes[1].tags).toEqual([]);
    // Retains autoSelectGroup on raw data if present
    expect(character.wardrobes[0].autoSelectGroup).toBe('outerwear');

    // Asserts original input was not mutated
    expect(rawV1Card.version).toBe('1');
    expect((rawV1Card.character.wardrobes[0] as any).tags).toBeUndefined();
  });

  it('leaves v2 character cards intact', () => {
    const rawV2Card = {
      format: 'yozakura_character_card',
      version: '2',
      exportedAt: '2026-01-01T00:00:00.000Z',
      character: {
        firstName: 'Bob',
        wardrobes: [
          {
            text: 'suit',
            tags: ['formal', 'daily_autoselect:work'],
          },
        ],
      },
    };

    const migrated = runCharacterCardMigrations(rawV2Card);
    expect(migrated.version).toBe('2');
    const character = migrated.character as any;
    expect(character.wardrobes[0].tags).toEqual(['formal', 'daily_autoselect:work']);
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
