import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settingsSchema } from '../state/settings_store.js';
import {
  applyOverrides,
  applyPatch,
  buildObjectReplacementPatch,
  computeOverrides,
  type DeepPartial,
} from './settings_merge.js';

function simulateJsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('buildObjectReplacementPatch', () => {
  it('marks keys removed or set to undefined as null so applyPatch deletes them', () => {
    type Config = {
      id: string;
      name: string;
      llmUrl?: string;
      tokenStreamingEnabled?: 'enabled' | 'disabled';
      appIdentificationHeadersEnabled?: 'enabled' | 'disabled';
    };

    const prev: Config = {
      id: 'base',
      name: 'Base',
      llmUrl: 'https://openrouter.ai/api/v1/chat/completions',
      tokenStreamingEnabled: 'disabled',
      appIdentificationHeadersEnabled: 'disabled',
    };

    const next: Config = {
      id: 'base',
      name: 'Base Updated',
    };

    const patch = buildObjectReplacementPatch(prev, next);
    expect(patch).toEqual({
      id: 'base',
      name: 'Base Updated',
      llmUrl: null,
      tokenStreamingEnabled: null,
      appIdentificationHeadersEnabled: null,
    });

    const applied = applyPatch(prev, patch);
    expect(applied).toEqual({
      id: 'base',
      name: 'Base Updated',
    });
    expect('llmUrl' in applied).toBe(false);
    expect('tokenStreamingEnabled' in applied).toBe(false);
    expect('appIdentificationHeadersEnabled' in applied).toBe(false);
  });

  it('omits undefined keys that were not present on prev', () => {
    type Config = { id: string; optionalField?: string | undefined };
    const patch = buildObjectReplacementPatch<Config>(undefined, { id: 'x', optionalField: undefined });
    expect(patch).toEqual({ id: 'x' });
    expect('optionalField' in patch).toBe(false);
  });
});

describe('applyPatch (RFC 7396 JSON Merge Patch)', () => {
  it('recursively merges nested objects while preserving sibling keys and immutability', () => {
    const current = {
      theme: 'yozakura',
      nested: {
        keep: 'original',
        inner: { a: 1, b: 2 },
      },
    };
    const patch: DeepPartial<typeof current> = {
      nested: {
        inner: { b: 20 },
      },
    };

    const result = applyPatch(current, patch);

    expect(result).toEqual({
      theme: 'yozakura',
      nested: {
        keep: 'original',
        inner: { a: 1, b: 20 },
      },
    });
    expect(current.nested.inner.b).toBe(2);
    expect(result).not.toBe(current);
    expect(result.nested).not.toBe(current.nested);
    expect(result.nested.inner).not.toBe(current.nested.inner);
  });

  it('deletes keys on null or undefined, ignores deleting absent keys, and strips null inside newly added sub-objects', () => {
    type State = {
      keep: string;
      removeMe?: string | undefined;
      clearMe?: string | undefined;
      nested: Record<string, string>;
      added: Record<string, string>;
    };

    const current: Partial<State> & { keep: string; nested: Record<string, string> } = {
      keep: 'yes',
      removeMe: 'bye',
      clearMe: 'also bye',
      nested: { a: '1', b: '2' },
    };

    const patch: DeepPartial<State> = {
      removeMe: null,
      clearMe: undefined,
      nested: { b: null, nonExistent: null },
      added: { present: 'ok', stripped: null },
    };

    const result = applyPatch(current as State, patch);

    expect(result).toEqual({
      keep: 'yes',
      nested: { a: '1' },
      added: { present: 'ok' },
    });
    expect('removeMe' in result).toBe(false);
    expect('clearMe' in result).toBe(false);
    expect('b' in result.nested!).toBe(false);
    expect('nonExistent' in result.nested!).toBe(false);
    expect('stripped' in result.added!).toBe(false);
    // Input objects are not mutated
    expect(current.removeMe).toBe('bye');
    expect(patch.added).toEqual({ present: 'ok', stripped: null });
  });

  it('replaces arrays wholesale and handles primitive <-> object transitions', () => {
    const current: Record<string, unknown> = {
      tags: ['a', 'b', 'c'],
      asObj: { x: 1 },
      asPrim: 'hello',
    };

    const result = applyPatch(current, {
      tags: ['x'],
      asObj: 'now-string',
      asPrim: { nested: true, dropped: null },
    });

    expect(result).toEqual({
      tags: ['x'],
      asObj: 'now-string',
      asPrim: { nested: true },
    });
  });

  it('preserves non-JSON properties such as store methods on the root state object', () => {
    const setSettings = () => {};
    const storeState = {
      theme: 'yozakura',
      hydrated: true,
      setSettings,
    };

    const merged = applyPatch(storeState, { theme: 'sakura' });

    expect(merged.theme).toBe('sakura');
    expect(merged.hydrated).toBe(true);
    expect(merged.setSettings).toBe(setSettings);
  });

  it('ignores prototype-polluting keys', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"safe":"ok"}') as Record<string, unknown>;
    const result = applyPatch<Record<string, unknown>>({ existing: 1 }, malicious);

    expect(result).toEqual({ existing: 1, safe: 'ok' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('computeOverrides & applyOverrides round-trip', () => {
  it('returns an empty override object for identical state, including own undefined keys vs absent keys', () => {
    type ChainData = {
      title: string;
      parserSource?: string | undefined;
      nested: Record<string, string>;
    };

    const defaults: ChainData = {
      title: 'Default',
      parserSource: undefined,
      nested: {},
    };
    const current: ChainData = {
      title: 'Default',
      nested: {},
    };

    expect(computeOverrides(defaults, current)).toEqual({});
    expect(computeOverrides(current, defaults)).toEqual({});
  });

  it('preserves newly added empty objects and records deletions when emptying an existing object', () => {
    type ScriptsState = Record<
      string,
      {
        selectedScriptId: string;
        controlValues: Record<string, Record<string, string>>;
      }
    >;

    const defaults: ScriptsState = {
      image: {
        selectedScriptId: 'scriptA',
        controlValues: { scriptA: { steps: '20' } },
      },
    };

    const current: ScriptsState = {
      image: {
        selectedScriptId: 'scriptA',
        controlValues: {},
      },
      temporal: {
        selectedScriptId: 'clock',
        controlValues: {},
      },
    };

    const overrides = computeOverrides(defaults, current);
    expect(overrides).toEqual({
      image: {
        controlValues: { scriptA: null },
      },
      temporal: {
        selectedScriptId: 'clock',
        controlValues: {},
      },
    });

    const hydrated = applyOverrides(defaults, simulateJsonRoundTrip(overrides));
    expect(hydrated).toEqual(current);
  });

  it('emits full replacement arrays when arrays differ and omits unchanged arrays', () => {
    type ArraySettings = {
      unchanged: string[];
      shortened: string[];
      emptied: number[];
      modifiedObjects: Array<{ id: string; enabled: boolean }>;
    };

    const defaults: ArraySettings = {
      unchanged: ['a', 'b'],
      shortened: ['x', 'y', 'z'],
      emptied: [1, 2],
      modifiedObjects: [
        { id: '1', enabled: true },
        { id: '2', enabled: false },
      ],
    };

    const current: ArraySettings = {
      unchanged: ['a', 'b'],
      shortened: ['x', 'z'],
      emptied: [],
      modifiedObjects: [
        { id: '1', enabled: true },
        { id: '2', enabled: true },
      ],
    };

    const overrides = computeOverrides(defaults, current);
    expect(overrides).toEqual({
      shortened: ['x', 'z'],
      emptied: [],
      modifiedObjects: [
        { id: '1', enabled: true },
        { id: '2', enabled: true },
      ],
    });
    expect('unchanged' in overrides).toBe(false);

    const hydrated = applyOverrides(defaults, simulateJsonRoundTrip(overrides));
    expect(hydrated).toEqual(current);
  });

  it('round-trips realistic edits to DEFAULT_SETTINGS through JSON persistence and Zod validation', () => {
    const defaultConfigIds = Object.keys(DEFAULT_SETTINGS.llmConfigs);
    const firstConfigId = defaultConfigIds[0]!;
    const firstConfig = DEFAULT_SETTINGS.llmConfigs[firstConfigId]!;

    const updated = applyPatch(DEFAULT_SETTINGS, {
      theme: 'sakura',
      npcChatRate: 0.75,
      llmConfigs: {
        [firstConfigId]: buildObjectReplacementPatch(firstConfig, {
          ...firstConfig,
          llmUrl: 'https://openrouter.ai/api/v1/chat/completions',
          llmMetaOptions: JSON.stringify({ model: 'deepseek/deepseek-v4.1-flash-1017' }),
        }),
        custom_group: {
          id: 'custom_group',
          name: 'Custom Group',
          rule: 'default',
          llmMetaOptions: '{}',
        },
      },
      settingsScripts: {
        custom_section: {
          selectedScriptId: 'my_script',
          controlValues: {},
        },
      },
    });

    const parsedUpdated = settingsSchema.parse(updated);
    const overrides = computeOverrides(DEFAULT_SETTINGS, parsedUpdated);
    const persisted = simulateJsonRoundTrip(overrides);
    const rehydrated = settingsSchema.parse(applyOverrides(DEFAULT_SETTINGS, persisted));

    expect(rehydrated).toEqual(parsedUpdated);
    // DEFAULT_SETTINGS must remain untouched
    expect(DEFAULT_SETTINGS.theme).toBe('yozakura');
    expect('custom_group' in DEFAULT_SETTINGS.llmConfigs).toBe(false);
  });
});
