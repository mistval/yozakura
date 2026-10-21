import _ from 'lodash';
import * as Database from '../backend_bridge/database.js';
import type { Character, Wardrobe } from './types.js';

export const DAILY_AUTOSELECT_TAG_PREFIX = 'daily_autoselect:';

export function formatPrefixedTag(prefix: string, value: string): string {
  return `${prefix}${value}`;
}

export function getWardrobeTagValuesWithPrefix(wardrobe: Pick<Wardrobe, 'tags'>, prefix: string): string[] {
  return wardrobe.tags
    .filter((tag) => tag.startsWith(prefix) && tag.length > prefix.length)
    .map((tag) => tag.slice(prefix.length));
}

export function getWardrobesWithTagPrefix(
  wardrobes: Wardrobe[],
  prefix: string
): Array<{ wardrobe: Wardrobe; tagValue: string }> {
  const result: Array<{ wardrobe: Wardrobe; tagValue: string }> = [];
  for (const wardrobe of wardrobes) {
    const values = getWardrobeTagValuesWithPrefix(wardrobe, prefix);
    if (values.length > 0 && values[0]) {
      result.push({ wardrobe, tagValue: values[0] });
    }
  }
  return result;
}

export function setWardrobeTagWithPrefix(wardrobe: Wardrobe, prefix: string, value: string): Wardrobe {
  const remainingTags = wardrobe.tags.filter((tag) => !tag.startsWith(prefix));
  const newTags = value.trim() !== '' ? remainingTags.concat(formatPrefixedTag(prefix, value)) : remainingTags;
  return {
    ...wardrobe,
    tags: newTags,
  };
}

export function createWardrobe(text = '', tags: string[] = []): Wardrobe {
  return Database.createPersistedObject({
    text,
    enabled: true,
    tags,
    autoRevert: true,
  });
}

export function applyDailyWardrobeAutoselect(wardrobes: Character['wardrobes']): Wardrobe[] | undefined {
  const tagged = getWardrobesWithTagPrefix(wardrobes, DAILY_AUTOSELECT_TAG_PREFIX);
  if (tagged.length === 0) {
    return undefined;
  }

  const groups = _.groupBy(tagged, (item) => item.tagValue);
  const selected = new Set(Object.values(groups).map((group) => _.sample(group)?.wardrobe));
  const participatingWardrobes = new Set(tagged.map((item) => item.wardrobe));

  let changed = false;
  const next = wardrobes.map((w) => {
    if (!participatingWardrobes.has(w)) {
      return w;
    }

    const enabled = selected.has(w);
    if (w.enabled === enabled) {
      return w;
    }

    changed = true;
    return { ...w, enabled };
  });

  return changed ? next : undefined;
}

export function applyPostConversationWardrobeAutoRevert(
  allConversationCharacters: Character[],
  preConversationWardrobesForId: Record<string, Wardrobe[]>
) {
  const updatedCharacters: Character[] = [];

  for (const participant of allConversationCharacters) {
    const snapshot = preConversationWardrobesForId[participant.id];
    if (snapshot) {
      let changed = false;
      const newWardrobes = participant.wardrobes.map((wardrobe) => {
        const snapshotWardrope = snapshot.find((w) => w.id === wardrobe.id);
        const isNew = !snapshotWardrope;

        if (isNew) {
          changed = true;
          return {
            ...wardrobe,
            enabled: !wardrobe.autoRevert,
          };
        }

        const wasEnabled = snapshotWardrope?.enabled ?? wardrobe.enabled;
        const newEnabled = wardrobe.autoRevert ? wasEnabled : wardrobe.enabled;
        changed ||= wardrobe.enabled !== newEnabled;

        return {
          ...wardrobe,
          enabled: newEnabled,
        };
      });

      if (changed) {
        updatedCharacters.push({
          ...participant,
          wardrobes: newWardrobes,
        });
      }
    }
  }

  return updatedCharacters;
}
