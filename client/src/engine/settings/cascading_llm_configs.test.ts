import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LLM_CONFIGS,
  findBaseDefaultsLLMConfig,
  isKnownCloudLlmProvider,
  updateLLMConfigsWithBaseDefaultsConnection,
} from './cascading_llm_configs.js';

describe('cascading_llm_configs', () => {
  it('correctly identifies known cloud LLM providers', () => {
    expect(isKnownCloudLlmProvider('https://openrouter.ai/api/v1/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('https://api.openai.com/v1/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('https://api.groq.com/openai/v1/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('https://api.deepseek.com/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('openrouter.ai/api/v1')).toBe(true);

    expect(isKnownCloudLlmProvider('http://localhost:5001/v1/chat/completions')).toBe(false);
    expect(isKnownCloudLlmProvider('http://127.0.0.1:11434/v1/chat/completions')).toBe(false);
    expect(isKnownCloudLlmProvider('http://192.168.1.100:5000/v1/chat/completions')).toBe(false);
    expect(isKnownCloudLlmProvider('')).toBe(false);
  });

  it('sets concurrencyGroupLimit to 3 for known cloud providers in updateLLMConfigsWithBaseDefaultsConnection', () => {
    const updated = updateLLMConfigsWithBaseDefaultsConnection(
      DEFAULT_LLM_CONFIGS,
      'https://openrouter.ai/api/v1/chat/completions',
      'test-token',
      'deepseek/deepseek-chat'
    );
    const base = findBaseDefaultsLLMConfig(updated);
    expect(base?.concurrencyGroupLimit).toBe(3);
  });

  it('keeps concurrencyGroupLimit as 1 for local endpoints in updateLLMConfigsWithBaseDefaultsConnection', () => {
    const updated = updateLLMConfigsWithBaseDefaultsConnection(
      DEFAULT_LLM_CONFIGS,
      'http://localhost:5001/v1/chat/completions',
      '',
      ''
    );
    const base = findBaseDefaultsLLMConfig(updated);
    expect(base?.concurrencyGroupLimit).toBe(1);
  });
});

