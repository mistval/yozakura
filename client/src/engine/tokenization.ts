import type { Character } from './types';

function tokenizeString(value: string) {
  return value
    .toLowerCase()
    .replace(/'s/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCharacterNameIndex(characters: Character[]) {
  const keyToIds = new Map<string, string[]>();

  for (const character of characters) {
    const first = tokenizeString(character.firstName).split(' ');
    const last = tokenizeString(character.lastName).split(' ');
    const keys = first.concat(last).filter(Boolean);

    for (const key of keys) {
      const existing = keyToIds.get(key) || [];
      if (!existing.includes(character.id)) {
        existing.push(character.id);
        keyToIds.set(key, existing);
      }
    }
  }

  return keyToIds;
}

export function matchStringToIndex(value: string, index: Map<string, string[]>) {
  const tokens = tokenizeString(value).split(' ');
  const uniqueTokens = new Set(tokens);

  const matched: string[] = [];

  for (const token of uniqueTokens) {
    const candidateIds = index.get(token) || [];
    const [candidateId] = candidateIds;

    if (candidateId) {
      matched.push(candidateId);
    }
  }

  return Array.from(new Set(matched));
}
