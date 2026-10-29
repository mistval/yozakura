import crypto from 'node:crypto';

export const HEX_18_ID_REGEX = /^[0-9a-f]{18}$/;

export function generateHex18Id(): string {
  return crypto.randomBytes(9).toString('hex');
}

/**
 * Matches either:
 * 1. Static demo character portrait image asset path (/images/character/demo-*.png) - preserved untouched.
 * 2. Legacy demo-* character ID tokens.
 * 3. 32-char or 18-char lowercase hex tokens bounded by non-hex characters.
 */
const ID_TOKEN_OR_STATIC_ASSET_PATTERN =
  /\/images\/character\/demo-[a-z]+-[a-z]+\.png|(?<![0-9a-z-])demo-[a-z]+-[a-z]+(?![0-9a-z-])|(?<![0-9a-f])(?:[0-9a-f]{32}|[0-9a-f]{18})(?![0-9a-f])/g;

export function applyIdMap(text: string, idMap: ReadonlyMap<string, string>): string {
  if (idMap.size === 0) {
    return text;
  }

  return text.replace(ID_TOKEN_OR_STATIC_ASSET_PATTERN, (match) => {
    if (match.startsWith('/images/character/demo-')) {
      return match;
    }
    return idMap.get(match) ?? match;
  });
}
