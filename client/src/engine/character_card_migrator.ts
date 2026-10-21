import { migration as migration0001WardrobeTags } from './character_card_migrations/0001_wardrobe_tags.js';

export type CharacterCardMigration = {
  doMigration: (rawCard: Record<string, unknown>) => Record<string, unknown>;
};

const migrations: CharacterCardMigration[] = [migration0001WardrobeTags];

export const CURRENT_CHARACTER_CARD_VERSION = String(migrations.length + 1);

export function runCharacterCardMigrations(rawCard: Record<string, unknown>): Record<string, unknown> {
  let currentCard = rawCard;
  let version =
    typeof currentCard.version === 'string' || typeof currentCard.version === 'number'
      ? Number(currentCard.version)
      : 1;

  if (!Number.isInteger(version) || version < 1) {
    version = 1;
  }

  while (version <= migrations.length) {
    const migration = migrations[version - 1];
    if (!migration) {
      break;
    }
    const migrated = migration.doMigration(currentCard);
    version += 1;
    currentCard = {
      ...migrated,
      version: String(version),
    };
  }

  return currentCard;
}
