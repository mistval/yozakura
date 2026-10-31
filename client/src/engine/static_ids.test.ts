import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_MAPS, PARADISE_ISLAND_MAP_ID } from './map/default_maps.js';
import { DEMO_CHARACTERS } from './demo_characters.js';
import { characterSchema, worldMapSchema } from './types.js';

const HEX_18_REGEX = /^[0-9a-f]{18}$/;

describe('static IDs normalization invariant', () => {
  it('DEFAULT_WORLD_MAPS has 18-char hex IDs and valid schema/adjacency', () => {
    expect(DEFAULT_WORLD_MAPS).toHaveLength(4);
    expect(PARADISE_ISLAND_MAP_ID).toMatch(HEX_18_REGEX);
    expect(DEFAULT_WORLD_MAPS[0]?.id).toBe(PARADISE_ISLAND_MAP_ID);

    let totalLocations = 0;

    for (const map of DEFAULT_WORLD_MAPS) {
      expect(map.id).toMatch(HEX_18_REGEX);
      expect(() => worldMapSchema.parse(map)).not.toThrow();

      const locationIdSet = new Set(map.locations.map((loc) => loc.id));
      expect(locationIdSet.size).toBe(map.locations.length);
      totalLocations += map.locations.length;

      for (const loc of map.locations) {
        expect(loc.id).toMatch(HEX_18_REGEX);
        for (const adjId of loc.adjacency) {
          expect(adjId).toMatch(HEX_18_REGEX);
          expect(locationIdSet.has(adjId)).toBe(true);
        }
      }
    }

    expect(totalLocations).toBe(47);
  });

  it('DEMO_CHARACTERS has 18-char hex IDs and preserves demo PNG imagePaths', () => {
    expect(DEMO_CHARACTERS).toHaveLength(20);

    for (const character of DEMO_CHARACTERS) {
      expect(character.id).toMatch(HEX_18_REGEX);
      expect(character.globalCharacterId).toBe(character.id);
      expect(character.imagePath).toMatch(/^\/images\/character\/demo-[a-z]+-[a-z]+\.png$/);
      expect(() => characterSchema.parse(character)).not.toThrow();
    }
  });

  it('all 71 static IDs across maps, locations, and demo characters are globally unique', () => {
    const allIds = new Set<string>();

    for (const map of DEFAULT_WORLD_MAPS) {
      expect(allIds.has(map.id)).toBe(false);
      allIds.add(map.id);

      for (const loc of map.locations) {
        expect(allIds.has(loc.id)).toBe(false);
        allIds.add(loc.id);
      }
    }

    for (const char of DEMO_CHARACTERS) {
      expect(allIds.has(char.id)).toBe(false);
      allIds.add(char.id);
    }

    expect(allIds.size).toBe(71);
  });
});
