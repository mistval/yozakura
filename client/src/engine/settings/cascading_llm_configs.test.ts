import { describe, expect, it } from 'vitest';
import {
  APP_IDENTIFICATION_NAME,
  APP_IDENTIFICATION_URL,
  BASE_DEFAULTS_LLM_CONFIG_ID,
  buildAppIdentificationHeaders,
  DEFAULT_LLM_CONFIGS,
  findBaseDefaultsLLMConfig,
  isKnownCloudLlmProvider,
  PROXY_REFERER_HEADER,
  updateLLMConfigsWithBaseDefaultsConnection,
} from './cascading_llm_configs.js';

describe('cascading_llm_configs', () => {
  it('correctly identifies known cloud LLM providers', () => {
    expect(isKnownCloudLlmProvider('https://openrouter.ai/api/v1/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('https://api.openai.com/v1/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('https://api.groq.com/openai/v1/chat/completions')).toBe(true);
    expect(isKnownCloudLlmProvider('https://api.deepseek.com/chat/completions')).toBe(true);

    expect(isKnownCloudLlmProvider('openrouter.ai/api/v1')).toBe(false);
    expect(isKnownCloudLlmProvider('http://localhost:5001/v1/chat/completions')).toBe(false);
    expect(isKnownCloudLlmProvider('http://127.0.0.1:11434/v1/chat/completions')).toBe(false);
    expect(isKnownCloudLlmProvider('http://192.168.1.100:5000/v1/chat/completions')).toBe(false);
    expect(isKnownCloudLlmProvider('')).toBe(false);
  });

  it('sets concurrencyGroupLimit to 6 for known cloud providers in updateLLMConfigsWithBaseDefaultsConnection', () => {
    const updated = updateLLMConfigsWithBaseDefaultsConnection(
      DEFAULT_LLM_CONFIGS,
      'https://openrouter.ai/api/v1/chat/completions',
      'test-token',
      'deepseek/deepseek-v4.1-flash-1017'
    );
    const base = findBaseDefaultsLLMConfig(updated);
    expect(base?.concurrencyGroupLimit).toBe(6);
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

  it('defaults tokenStreamingEnabled and appIdentificationHeadersEnabled to enabled for base and undefined (inherit) for all other configs', () => {
    for (const [id, config] of Object.entries(DEFAULT_LLM_CONFIGS)) {
      if (id === BASE_DEFAULTS_LLM_CONFIG_ID) {
        expect(config.tokenStreamingEnabled).toBe('enabled');
        expect(config.appIdentificationHeadersEnabled).toBe('enabled');
      } else {
        expect(config.tokenStreamingEnabled).toBeUndefined();
        expect(config.appIdentificationHeadersEnabled).toBeUndefined();
      }
    }
  });

  it('builds app identification headers for OpenRouter and other supported attribution providers', () => {
    expect(buildAppIdentificationHeaders('https://openrouter.ai/api/v1/chat/completions')).toEqual({
      'HTTP-Referer': APP_IDENTIFICATION_URL,
      [PROXY_REFERER_HEADER]: APP_IDENTIFICATION_URL,
      'X-Title': APP_IDENTIFICATION_NAME,
      'X-OpenRouter-Title': APP_IDENTIFICATION_NAME,
    });

    for (const url of [
      'https://router.requesty.ai/v1/chat/completions',
      'https://api.featherless.ai/v1/chat/completions',
      'https://ai-gateway.vercel.sh/v1/chat/completions',
    ]) {
      expect(buildAppIdentificationHeaders(url)).toEqual({
        'HTTP-Referer': APP_IDENTIFICATION_URL,
        [PROXY_REFERER_HEADER]: APP_IDENTIFICATION_URL,
        'X-Title': APP_IDENTIFICATION_NAME,
      });
    }

    expect(buildAppIdentificationHeaders('http://localhost:5001/v1/chat/completions')).toEqual({});
    expect(buildAppIdentificationHeaders('https://api.openai.com/v1/chat/completions')).toEqual({});
    expect(() => buildAppIdentificationHeaders('')).toThrow();
    expect(() => buildAppIdentificationHeaders('openrouter.ai/api/v1')).toThrow();
  });
});
