import { describe, expect, it } from 'vitest';
import { applyPatch, buildObjectReplacementPatch } from './settings_merge.js';

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
