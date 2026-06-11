import _ from 'lodash';
import * as Database from '../backend_bridge/database.js';
import type { Character, Wardrobe } from './types.js';

export function createWardrobe(text = '', autoSelectGroup = ''): Wardrobe {
  return Database.createPersistedObject({
    text,
    enabled: true,
    autoSelectGroup,
    autoRevert: true,
  });
}

export function applyDailyWardrobeAutoselect(wardrobes: Character['wardrobes']): Wardrobe[] | undefined {
  const groups = _.groupBy(
    wardrobes.filter((w) => w?.autoSelectGroup),
    (w) => w.autoSelectGroup
  );

  if (_.isEmpty(groups)) {
    return undefined;
  }

  const selected = new Set(Object.values(groups).map((group) => _.sample(group)));

  let changed = false;
  const next = wardrobes.map((w) => {
    if (!w?.autoSelectGroup) {
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
