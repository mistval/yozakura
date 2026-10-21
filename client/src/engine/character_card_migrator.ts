import { migration as migration0001WardrobeTags } from './character_card_migrations/0001_wardrobe_tags.js';

export type CharacterCardMigration = {
  doMigration: (rawCard: Record<string, unknown>) => void;
};

const migrations: CharacterCardMigration[] = [migration0001WardrobeTags];

export const CURRENT_CHARACTER_CARD_VERSION = String(migrations.length + 1);

export function runCharacterCardMigrations(rawCard: Record<string, unknown>): Record<string, unknown> {
  const cardCopy = structuredClone(rawCard);
  let version =
    typeof cardCopy.version === 'string' || typeof cardCopy.version === 'number'
      ? Number(cardCopy.version)
      : 1;

  if (!Number.isInteger(version) || version < 1) {
    version = 1;
  }

  while (version <= migrations.length) {
    const migration = migrations[version - 1];
    if (!migration) {
      break;
    }
    migration.doMigration(cardCopy);
    version += 1;
    cardCopy.version = String(version);
  }

  return cardCopy;
}
