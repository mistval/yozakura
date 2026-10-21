import _ from 'lodash';
import * as Database from '../backend_bridge/database.js';
import {
  type Character,
  type MapZone,
  type Wardrobe,
  type WardrobeTrigger,
  wardrobeTriggerCommandSchema,
} from './types.js';

export const DAILY_AUTOSELECT_TAG_PREFIX = 'daily_autoselect:';

export class TagView {
  private readonly normalizedPrefix: string | undefined;

  constructor(
    private readonly tags: readonly string[],
    prefix?: string
  ) {
    this.normalizedPrefix = prefix ? (prefix.endsWith(':') ? prefix : `${prefix}:`) : undefined;
  }

  private matches(rawTag: string): boolean {
    if (this.normalizedPrefix !== undefined) {
      return rawTag.startsWith(this.normalizedPrefix);
    }
    return !rawTag.includes(':');
  }

  private toViewValue(rawTag: string): string {
    return this.normalizedPrefix !== undefined ? rawTag.slice(this.normalizedPrefix.length) : rawTag;
  }

  private toRawTag(value: string): string {
    return this.normalizedPrefix !== undefined ? `${this.normalizedPrefix}${value}` : value;
  }

  getAll(): string[] {
    return this.tags
      .filter((t) => this.matches(t))
      .map((t) => this.toViewValue(t))
      .filter((v) => v.length > 0);
  }

  getFirst(): string | undefined {
    return this.getAll()[0];
  }

  has(value: string): boolean {
    return this.getAll().includes(value);
  }

  replaceAll(values: readonly string[]): string[] {
    const otherTags = this.tags.filter((t) => !this.matches(t));
    const nextViewTags = values
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => this.toRawTag(v));
    return otherTags.concat(nextViewTags);
  }

  replaceSingle(value: string): string[] {
    const trimmed = value.trim();
    return this.replaceAll(trimmed ? [trimmed] : []);
  }
}

export function formatPrefixedTag(prefix: string, value: string): string {
  const norm = prefix.endsWith(':') ? prefix : `${prefix}:`;
  return `${norm}${value}`;
}

export function getWardrobeTagValuesWithPrefix(wardrobe: Pick<Wardrobe, 'tags'>, prefix: string): string[] {
  return new TagView(wardrobe.tags, prefix).getAll();
}

export function getWardrobesWithTagPrefix(
  wardrobes: Wardrobe[],
  prefix: string
): Array<{ wardrobe: Wardrobe; tagValue: string }> {
  const result: Array<{ wardrobe: Wardrobe; tagValue: string }> = [];
  for (const wardrobe of wardrobes) {
    const first = new TagView(wardrobe.tags, prefix).getFirst();
    if (first) {
      result.push({ wardrobe, tagValue: first });
    }
  }
  return result;
}

export function setWardrobeTagWithPrefix(wardrobe: Wardrobe, prefix: string, value: string): Wardrobe {
  return {
    ...wardrobe,
    tags: new TagView(wardrobe.tags, prefix).replaceSingle(value),
  };
}

export function formatWardrobeTriggers(triggers: readonly WardrobeTrigger[]): string {
  return triggers.map((t) => `${t.command}:${t.tag}`).join(', ');
}

export function parseWardrobeTriggers(input: string): { triggers: WardrobeTrigger[]; errors: string[] } {
  const tokens = input
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const triggers: WardrobeTrigger[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    if (!token.includes(':')) {
      triggers.push({ command: 'enable', tag: token });
      continue;
    }

    const colonIndex = token.indexOf(':');
    const commandPart = token.slice(0, colonIndex).trim();
    const tagPart = token.slice(colonIndex + 1).trim();

    const parseCommand = wardrobeTriggerCommandSchema.safeParse(commandPart);
    if (!parseCommand.success || tagPart.length === 0 || tagPart.includes(':')) {
      errors.push(`Invalid trigger token: "${token}"`);
      continue;
    }

    if (tagPart.includes('*') && (parseCommand.data !== 'disable' || tagPart !== '*')) {
      errors.push(`Invalid trigger token: "${token}" (wildcard "*" is only supported as "disable:*")`);
      continue;
    }

    triggers.push({
      command: parseCommand.data,
      tag: tagPart,
    });
  }

  return { triggers, errors };
}

export function selectZoneForWardrobeTriggers(
  locationId: string,
  zones: readonly MapZone[]
): MapZone | undefined {
  const matchingZones = zones.filter(
    (zone) => zone.locationIds.includes(locationId) && zone.wardrobeTriggers.length > 0
  );

  if (matchingZones.length === 0) {
    return undefined;
  }

  const sorted = matchingZones.sort((a, b) => {
    const sizeDiff = a.locationIds.length - b.locationIds.length;
    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) {
      return nameDiff;
    }

    return a.id.localeCompare(b.id);
  });

  return sorted[0];
}

export function applyWardrobeTriggers(
  wardrobes: readonly Wardrobe[],
  triggers: readonly WardrobeTrigger[]
): Wardrobe[] | undefined {
  if (triggers.length === 0 || wardrobes.length === 0) {
    return undefined;
  }

  let currentWardrobes = wardrobes.map((w) => ({ ...w }));
  let changed = false;

  for (const trigger of triggers) {
    if (trigger.command === 'disable') {
      currentWardrobes = currentWardrobes.map((w) => {
        if (trigger.tag === '*' || new TagView(w.tags).has(trigger.tag)) {
          if (w.enabled) {
            changed = true;
            return { ...w, enabled: false };
          }
        }
        return w;
      });
    } else if (trigger.command === 'enable') {
      currentWardrobes = currentWardrobes.map((w) => {
        if (new TagView(w.tags).has(trigger.tag)) {
          if (!w.enabled) {
            changed = true;
            return { ...w, enabled: true };
          }
        }
        return w;
      });
    } else if (trigger.command === 'enable_one') {
      const candidates = currentWardrobes.filter((w) => new TagView(w.tags).has(trigger.tag));
      if (candidates.length > 0) {
        const picked = _.sample(candidates)!;
        if (!picked.enabled) {
          changed = true;
          currentWardrobes = currentWardrobes.map((w) => (w.id === picked.id ? { ...w, enabled: true } : w));
        }
      }
    }
  }

  return changed ? currentWardrobes : undefined;
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
