import { timestampSchema } from '../types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTimestamp(value: unknown): value is string {
  return timestampSchema.safeParse(value).success;
}

export const migration = {
  doMigration(rawCard: Record<string, unknown>): Record<string, unknown> {
    if (!isRecord(rawCard.character)) {
      return rawCard;
    }

    const fallbackTimestamp = isValidTimestamp(rawCard.exportedAt)
      ? rawCard.exportedAt
      : new Date().toISOString();
    const rawCharacter = rawCard.character;

    const createdAt = isValidTimestamp(rawCharacter.createdAt) ? rawCharacter.createdAt : fallbackTimestamp;
    const updatedAt = isValidTimestamp(rawCharacter.updatedAt) ? rawCharacter.updatedAt : createdAt;

    if (createdAt === rawCharacter.createdAt && updatedAt === rawCharacter.updatedAt) {
      return rawCard;
    }

    return {
      ...rawCard,
      character: {
        ...rawCharacter,
        createdAt,
        updatedAt,
      },
    };
  },
};
