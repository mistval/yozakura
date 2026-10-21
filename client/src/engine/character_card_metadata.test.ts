import { describe, expect, it } from 'vitest';
import {
  CURRENT_CHARACTER_CARD_VERSION,
  runCharacterCardMigrations,
} from './character_card_migrator.js';

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
