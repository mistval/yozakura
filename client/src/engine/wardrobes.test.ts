import { describe, expect, it } from 'vitest';
import {
  applyDailyWardrobeAutoselect,
  createWardrobe,
  DAILY_AUTOSELECT_TAG_PREFIX,
  formatPrefixedTag,
  getWardrobesWithTagPrefix,
  getWardrobeTagValuesWithPrefix,
  setWardrobeTagWithPrefix,
} from './wardrobes.js';
import type { Wardrobe } from './types.js';

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
