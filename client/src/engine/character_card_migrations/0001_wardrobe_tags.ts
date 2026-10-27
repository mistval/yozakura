import type { CharacterCardMigration } from '../character_card_migrator.js';
import { DAILY_AUTOSELECT_TAG_PREFIX, formatPrefixedTag } from '../wardrobes.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const migration: CharacterCardMigration = {
  doMigration(rawCard: Record<string, unknown>): Record<string, unknown> {
    if (!isRecord(rawCard.character)) {
      return rawCard;
    }

    const rawCharacter = rawCard.character;
    if (!Array.isArray(rawCharacter.wardrobes)) {
      return rawCard;
    }

    const nextWardrobes = rawCharacter.wardrobes.map((wardrobe) => {
      if (!isRecord(wardrobe) || 'tags' in wardrobe) {
        return wardrobe;
      }

      const autoSelectGroup =
        typeof wardrobe.autoSelectGroup === 'string' ? wardrobe.autoSelectGroup.trim() : '';
      const tags =
        autoSelectGroup.length > 0 ? [formatPrefixedTag(DAILY_AUTOSELECT_TAG_PREFIX, autoSelectGroup)] : [];

      return {
        ...wardrobe,
        tags,
      };
    });

    return {
      ...rawCard,
      character: {
        ...rawCharacter,
        wardrobes: nextWardrobes,
      },
    };
  },
};
