import type { CharacterCardMigration } from '../character_card_migrator.js';
import { DAILY_AUTOSELECT_TAG_PREFIX, formatPrefixedTag } from '../wardrobes.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const migration: CharacterCardMigration = {
  doMigration(rawCard: Record<string, unknown>): void {
    if (!isRecord(rawCard.character)) {
      return;
    }

    const rawCharacter = rawCard.character;
    if (!Array.isArray(rawCharacter.wardrobes)) {
      return;
    }

    for (const wardrobe of rawCharacter.wardrobes) {
      if (isRecord(wardrobe) && !('tags' in wardrobe)) {
        const autoSelectGroup =
          typeof wardrobe.autoSelectGroup === 'string' ? wardrobe.autoSelectGroup.trim() : '';
        wardrobe.tags =
          autoSelectGroup.length > 0 ? [formatPrefixedTag(DAILY_AUTOSELECT_TAG_PREFIX, autoSelectGroup)] : [];
      }
    }
  },
};
