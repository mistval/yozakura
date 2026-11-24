import { afterEach, describe, expect, it } from 'vitest';
import { resolveLlmPromptOptions } from './llm.js';
import { DEFAULT_SETTINGS, useSettingsStore } from '../state/settings_store.js';
import {
  BASE_DEFAULTS_LLM_CONFIG_ID,
  DEFAULT_LLM_CONFIGS,
  type LLMConfigById,
} from './settings/cascading_llm_configs.js';
import type { GlobalExecutionContext } from './prompt_templates/prompt_template_context_fields.js';

const TEST_CONTEXT: GlobalExecutionContext = {
  settings: {},
  globalWritableContext: {},
};

function setLlmConfigs(llmConfigs: LLMConfigById) {
  useSettingsStore.setState({ llmConfigs });
}

describe.each(['tokenStreamingEnabled', 'appIdentificationHeadersEnabled'] as const)(
  'resolveLlmPromptOptions %s cascading',
  (field) => {
    afterEach(() => {
      useSettingsStore.setState({ llmConfigs: DEFAULT_SETTINGS.llmConfigs });
    });

    it('defaults to true when all matching groups are set to inherit (undefined)', () => {
      setLlmConfigs({
        base: {
          id: 'base',
          name: 'Base',
          rule: 'true',
          llmMetaOptions: '{}',
        },
        child: {
          id: 'child',
          name: 'Child',
          rule: "context.promptTemplateGroup === 'gen_npc_response'",
          llmMetaOptions: '{}',
        },
      });
      const resolved = resolveLlmPromptOptions('gen_npc_response', TEST_CONTEXT);
      expect(resolved[field]).toBe(true);
    });

    it('inherits disabled from base when matching child config is inherit', () => {
      setLlmConfigs({
        ...DEFAULT_LLM_CONFIGS,
        [BASE_DEFAULTS_LLM_CONFIG_ID]: {
          ...DEFAULT_LLM_CONFIGS[BASE_DEFAULTS_LLM_CONFIG_ID]!,
          [field]: 'disabled',
        },
      });
      const resolved = resolveLlmPromptOptions('gen_npc_response', TEST_CONTEXT);
      expect(resolved[field]).toBe(false);
    });

    it('allows child config to override base from inherit/enabled to disabled', () => {
      setLlmConfigs({
        ...DEFAULT_LLM_CONFIGS,
        'npc-respond': {
          ...DEFAULT_LLM_CONFIGS['npc-respond']!,
          [field]: 'disabled',
        },
      });
      const resolved = resolveLlmPromptOptions('gen_npc_response', TEST_CONTEXT);
      expect(resolved[field]).toBe(false);
    });

    it('allows child config to override base from disabled to enabled', () => {
      setLlmConfigs({
        ...DEFAULT_LLM_CONFIGS,
        [BASE_DEFAULTS_LLM_CONFIG_ID]: {
          ...DEFAULT_LLM_CONFIGS[BASE_DEFAULTS_LLM_CONFIG_ID]!,
          [field]: 'disabled',
        },
        'npc-respond': {
          ...DEFAULT_LLM_CONFIGS['npc-respond']!,
          [field]: 'enabled',
        },
      });
      const resolved = resolveLlmPromptOptions('gen_npc_response', TEST_CONTEXT);
      expect(resolved[field]).toBe(true);
    });

    it('preserves prior value when subsequent matching config has undefined', () => {
      setLlmConfigs({
        base: {
          id: 'base',
          name: 'Base',
          rule: 'true',
          llmMetaOptions: '{}',
          [field]: 'enabled',
        },
        child: {
          id: 'child',
          name: 'Child',
          rule: "context.promptTemplateGroup === 'gen_npc_response'",
          llmMetaOptions: '{}',
        },
      });
      const resolved = resolveLlmPromptOptions('gen_npc_response', TEST_CONTEXT);
      expect(resolved[field]).toBe(true);
    });
  }
);
