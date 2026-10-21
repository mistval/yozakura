import { describe, expect, it } from 'vitest';
import {
  applyDailyWardrobeAutoselect,
  applyWardrobeTriggers,
  createWardrobe,
  DAILY_AUTOSELECT_TAG_PREFIX,
  formatPrefixedTag,
  formatWardrobeTriggers,
  getWardrobesWithTagPrefix,
  getWardrobeTagValuesWithPrefix,
  parseWardrobeTriggers,
  selectZoneForWardrobeTriggers,
  setWardrobeTagWithPrefix,
  TagView,
} from './wardrobes.js';
import type { MapZone, Wardrobe } from './types.js';

describe('TagView', () => {
  it('handles prefixed tag views', () => {
    const rawTags = ['daily_autoselect:casual', 'mood:happy', 'daily_autoselect:work', 'style_modern'];
    const view = new TagView(rawTags, DAILY_AUTOSELECT_TAG_PREFIX);

    expect(view.getAll()).toEqual(['casual', 'work']);
    expect(view.getFirst()).toBe('casual');
    expect(view.has('casual')).toBe(true);
    expect(view.has('work')).toBe(true);
    expect(view.has('happy')).toBe(false);

    const replacedSingle = view.replaceSingle('formal');
    expect(replacedSingle).toEqual(['mood:happy', 'style_modern', 'daily_autoselect:formal']);

    const clearedSingle = view.replaceSingle('');
    expect(clearedSingle).toEqual(['mood:happy', 'style_modern']);

    const replacedAll = view.replaceAll(['outfit1', 'outfit2']);
    expect(replacedAll).toEqual([
      'mood:happy',
      'style_modern',
      'daily_autoselect:outfit1',
      'daily_autoselect:outfit2',
    ]);
  });

  it('handles unprefixed general tag views', () => {
    const rawTags = ['casual_clothes', 'daily_autoselect:casual', 'work_uniform', 'mood:happy'];
    const view = new TagView(rawTags);

    expect(view.getAll()).toEqual(['casual_clothes', 'work_uniform']);
    expect(view.has('casual_clothes')).toBe(true);
    expect(view.has('daily_autoselect:casual')).toBe(false);

    const replaced = view.replaceAll(['beachwear', 'summer_hat']);
    expect(replaced).toEqual([
      'daily_autoselect:casual',
      'mood:happy',
      'beachwear',
      'summer_hat',
    ]);
  });
});

describe('wardrobe trigger parsing and formatting', () => {
  it('parses valid comma-separated triggers including default enable shorthand', () => {
    const input = 'disable:casual_clothes, enable:work_uniform, enable_one:work_tie, sunglasses, disable:*';
    const { triggers, errors } = parseWardrobeTriggers(input);

    expect(errors).toEqual([]);
    expect(triggers).toEqual([
      { command: 'disable', tag: 'casual_clothes' },
      { command: 'enable', tag: 'work_uniform' },
      { command: 'enable_one', tag: 'work_tie' },
      { command: 'enable', tag: 'sunglasses' },
      { command: 'disable', tag: '*' },
    ]);
  });

  it('identifies invalid trigger tokens including invalid wildcards', () => {
    const input = 'enable:, unknown:tag, disable:tag:invalid, enable:valid, enable:*, disable:casual*';
    const { triggers, errors } = parseWardrobeTriggers(input);

    expect(triggers).toEqual([{ command: 'enable', tag: 'valid' }]);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toContain('enable:');
    expect(errors[1]).toContain('unknown:tag');
    expect(errors[2]).toContain('disable:tag:invalid');
    expect(errors[3]).toContain('enable:*');
    expect(errors[4]).toContain('disable:casual*');
  });

  it('formats triggers back to comma-separated string', () => {
    const triggers = [
      { command: 'disable' as const, tag: 'casual_clothes' },
      { command: 'enable' as const, tag: 'work_uniform' },
      { command: 'enable_one' as const, tag: 'work_tie' },
    ];
    expect(formatWardrobeTriggers(triggers)).toBe(
      'disable:casual_clothes, enable:work_uniform, enable_one:work_tie'
    );
  });
});

describe('selectZoneForWardrobeTriggers', () => {
  const makeZone = (
    id: string,
    name: string,
    locationIds: string[],
    triggers: Array<{ command: 'enable' | 'disable' | 'enable_one'; tag: string }> = []
  ): MapZone => ({
    id,
    name,
    locationIds,
    wardrobeTriggers: triggers,
    createdAt: '',
    updatedAt: '',
  });

  it('ignores zones without wardrobeTriggers', () => {
    const zoneNoTriggers = makeZone('z1', 'Zone 1', ['locA'], []);
    expect(selectZoneForWardrobeTriggers('locA', [zoneNoTriggers])).toBeUndefined();
  });

  it('selects smaller (more specific) zone over larger zone', () => {
    const largeZone = makeZone('large', 'Large Zone', ['locA', 'locB', 'locC'], [
      { command: 'disable', tag: 'casual' },
    ]);
    const smallZone = makeZone('small', 'Small Zone', ['locA'], [
      { command: 'enable', tag: 'work_uniform' },
    ]);

    const selected = selectZoneForWardrobeTriggers('locA', [largeZone, smallZone]);
    expect(selected?.id).toBe('small');
  });

  it('breaks ties by zone name', () => {
    const zoneB = makeZone('zB', 'B Zone', ['locA'], [{ command: 'enable', tag: 'tagB' }]);
    const zoneA = makeZone('zA', 'A Zone', ['locA'], [{ command: 'enable', tag: 'tagA' }]);

    const selected = selectZoneForWardrobeTriggers('locA', [zoneB, zoneA]);
    expect(selected?.id).toBe('zA');
  });
});

describe('applyWardrobeTriggers', () => {
  it('applies disable, enable, and enable_one in sequence', () => {
    const w1: Wardrobe = {
      id: 'w1',
      createdAt: '',
      updatedAt: '',
      text: 'casual',
      enabled: true,
      autoRevert: true,
      tags: ['casual_clothes'],
    };
    const w2: Wardrobe = {
      id: 'w2',
      createdAt: '',
      updatedAt: '',
      text: 'uniform',
      enabled: false,
      autoRevert: true,
      tags: ['work_uniform'],
    };
    const w3: Wardrobe = {
      id: 'w3',
      createdAt: '',
      updatedAt: '',
      text: 'tie 1',
      enabled: false,
      autoRevert: true,
      tags: ['work_tie'],
    };
    const w4: Wardrobe = {
      id: 'w4',
      createdAt: '',
      updatedAt: '',
      text: 'tie 2',
      enabled: false,
      autoRevert: true,
      tags: ['work_tie'],
    };

    const triggers = [
      { command: 'disable' as const, tag: 'casual_clothes' },
      { command: 'enable' as const, tag: 'work_uniform' },
      { command: 'enable_one' as const, tag: 'work_tie' },
    ];

    const result = applyWardrobeTriggers([w1, w2, w3, w4], triggers);
    expect(result).toBeDefined();

    expect(result!.find((w) => w.id === 'w1')?.enabled).toBe(false);
    expect(result!.find((w) => w.id === 'w2')?.enabled).toBe(true);

    const enabledTies = result!.filter((w) => w.tags.includes('work_tie') && w.enabled);
    expect(enabledTies).toHaveLength(1);
  });

  it('returns undefined if triggers cause no change to enabled states', () => {
    const w1: Wardrobe = {
      id: 'w1',
      createdAt: '',
      updatedAt: '',
      text: 'shirt',
      enabled: true,
      autoRevert: true,
      tags: ['shirt'],
    };

    const triggers = [{ command: 'enable' as const, tag: 'shirt' }];
    expect(applyWardrobeTriggers([w1], triggers)).toBeUndefined();
  });

  it('supports disable:* wildcard to disable all wardrobes', () => {
    const w1: Wardrobe = {
      id: 'w1',
      createdAt: '',
      updatedAt: '',
      text: 'outfit 1',
      enabled: true,
      autoRevert: true,
      tags: ['casual'],
    };
    const w2: Wardrobe = {
      id: 'w2',
      createdAt: '',
      updatedAt: '',
      text: 'outfit 2',
      enabled: true,
      autoRevert: true,
      tags: [],
    };
    const w3: Wardrobe = {
      id: 'w3',
      createdAt: '',
      updatedAt: '',
      text: 'uniform',
      enabled: false,
      autoRevert: true,
      tags: ['work_uniform'],
    };

    const triggers = [
      { command: 'disable' as const, tag: '*' },
      { command: 'enable' as const, tag: 'work_uniform' },
    ];

    const result = applyWardrobeTriggers([w1, w2, w3], triggers);
    expect(result).toBeDefined();
    expect(result!.find((w) => w.id === 'w1')?.enabled).toBe(false);
    expect(result!.find((w) => w.id === 'w2')?.enabled).toBe(false);
    expect(result!.find((w) => w.id === 'w3')?.enabled).toBe(true);
  });
});

describe('wardrobe tag helpers', () => {
  it('formats prefixed tags properly', () => {
    expect(formatPrefixedTag(DAILY_AUTOSELECT_TAG_PREFIX, 'casual')).toBe('daily_autoselect:casual');
  });

  it('extracts non-empty tag values matching prefix', () => {
    const wardrobe: Pick<Wardrobe, 'tags'> = {
      tags: ['daily_autoselect:casual', 'mood:happy', 'daily_autoselect:work', 'daily_autoselect:'],
    };
    expect(getWardrobeTagValuesWithPrefix(wardrobe, DAILY_AUTOSELECT_TAG_PREFIX)).toEqual(['casual', 'work']);
    expect(getWardrobeTagValuesWithPrefix(wardrobe, 'mood:')).toEqual(['happy']);
    expect(getWardrobeTagValuesWithPrefix(wardrobe, 'nonexistent:')).toEqual([]);
  });

  it('gets wardrobes with prefix and takes the first matching tag value', () => {
    const w1: Wardrobe = {
      id: '1',
      createdAt: '',
      updatedAt: '',
      text: 't1',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:casual', 'daily_autoselect:formal'],
    };
    const w2: Wardrobe = {
      id: '2',
      createdAt: '',
      updatedAt: '',
      text: 't2',
      enabled: true,
      autoRevert: false,
      tags: ['mood:excited'],
    };
    const w3: Wardrobe = {
      id: '3',
      createdAt: '',
      updatedAt: '',
      text: 't3',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:sleepwear'],
    };

    const result = getWardrobesWithTagPrefix([w1, w2, w3], DAILY_AUTOSELECT_TAG_PREFIX);
    expect(result).toEqual([
      { wardrobe: w1, tagValue: 'casual' },
      { wardrobe: w3, tagValue: 'sleepwear' },
    ]);
  });

  it('sets a prefixed tag and preserves existing unrelated tags', () => {
    const wardrobe: Wardrobe = {
      id: '1',
      createdAt: '',
      updatedAt: '',
      text: 'outfit',
      enabled: true,
      autoRevert: false,
      tags: ['mood:calm', 'daily_autoselect:old_group', 'style:modern'],
    };

    const updated = setWardrobeTagWithPrefix(wardrobe, DAILY_AUTOSELECT_TAG_PREFIX, 'new_group');
    expect(updated.tags).toEqual(['mood:calm', 'style:modern', 'daily_autoselect:new_group']);

    // Setting to empty removes the prefixed tag entirely
    const cleared = setWardrobeTagWithPrefix(updated, DAILY_AUTOSELECT_TAG_PREFIX, '');
    expect(cleared.tags).toEqual(['mood:calm', 'style:modern']);
  });

  it('creates wardrobe with initial tags', () => {
    const w = createWardrobe('red scarf', ['daily_autoselect:accessories']);
    expect(w.text).toBe('red scarf');
    expect(w.tags).toEqual(['daily_autoselect:accessories']);
    expect(w.enabled).toBe(true);
    expect(w.autoRevert).toBe(true);
  });
});

describe('applyDailyWardrobeAutoselect', () => {
  it('returns undefined if no wardrobes have daily autoselect tags', () => {
    const w1: Wardrobe = {
      id: '1',
      createdAt: '',
      updatedAt: '',
      text: 't1',
      enabled: true,
      autoRevert: false,
      tags: ['untagged'],
    };
    expect(applyDailyWardrobeAutoselect([w1])).toBeUndefined();
  });

  it('selects exactly one wardrobe per autoselect group and disables others in group', () => {
    const wGroupA1: Wardrobe = {
      id: 'a1',
      createdAt: '',
      updatedAt: '',
      text: 'a1',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:groupA'],
    };
    const wGroupA2: Wardrobe = {
      id: 'a2',
      createdAt: '',
      updatedAt: '',
      text: 'a2',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:groupA'],
    };
    const wUngrouped: Wardrobe = {
      id: 'u1',
      createdAt: '',
      updatedAt: '',
      text: 'u1',
      enabled: true,
      autoRevert: false,
      tags: [],
    };

    const result = applyDailyWardrobeAutoselect([wGroupA1, wGroupA2, wUngrouped]);
    expect(result).toBeDefined();
    const enabledGroupA = result!.filter((w) => w.tags.includes('daily_autoselect:groupA') && w.enabled);
    expect(enabledGroupA).toHaveLength(1);

    const ungroupedResult = result!.find((w) => w.id === 'u1');
    expect(ungroupedResult?.enabled).toBe(true);
  });

  it('uses only the first daily_autoselect tag when multiple exist on a single wardrobe', () => {
    const w1: Wardrobe = {
      id: 'w1',
      createdAt: '',
      updatedAt: '',
      text: 'w1',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:primaryGroup', 'daily_autoselect:secondaryGroup'],
    };
    const w2: Wardrobe = {
      id: 'w2',
      createdAt: '',
      updatedAt: '',
      text: 'w2',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:primaryGroup'],
    };
    const w3: Wardrobe = {
      id: 'w3',
      createdAt: '',
      updatedAt: '',
      text: 'w3',
      enabled: false,
      autoRevert: false,
      tags: ['daily_autoselect:secondaryGroup'],
    };

    // w1 belongs to primaryGroup only. w3 belongs to secondaryGroup only (so w3 is the only one in secondaryGroup and must be selected).
    const result = applyDailyWardrobeAutoselect([w1, w2, w3]);
    expect(result).toBeDefined();

    const w3Result = result!.find((w) => w.id === 'w3');
    expect(w3Result?.enabled).toBe(true);

    const primaryEnabled = result!.filter((w) => w.id === 'w1' || w.id === 'w2').filter((w) => w.enabled);
    expect(primaryEnabled).toHaveLength(1);
  });
});
