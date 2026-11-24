import z from 'zod';
import { LLM_DEFAULTS, LLM_DEFAULTS_CHAT } from './llm_defaults.js';
import { assertNonNullish } from '../../errors/application_error.js';

export const llmMetaOptionsObjectSchema = z.record(z.string(), z.unknown());

/** Parses JSON `llmMetaOptions` into a record, throwing on invalid syntax or non-object JSON. */
export function parseLlmMetaOptions(source: string): Record<string, unknown> {
  const trimmed = source.trim();
  if (!trimmed) {
    return {};
  }
  return llmMetaOptionsObjectSchema.parse(JSON.parse(trimmed));
}

export const BASE_DEFAULTS_LLM_CONFIG_ID = 'base';
const BASE_DEFAULTS_CONFIG_NAME = 'Base Defaults';

const DEFAULT_COMPLETIONS_URL = 'http://localhost:5001/v1/chat/completions';

const DEFAULT_RESPONSE_PRE_PARSER_SOURCE = `(response) => {
  // Cleans the response of XML tags, if present. If there are XML tags, this takes the content of the first tag.
  const match = response.match(/<([a-zA-Z][\\w:-]*)[^>]*>([\\s\\S]*?)<\\/?\\1>/);
  const extractedTaggedText = match && match[2]
    ? match[2].trim()
    : response
        .trim()
        .replace(/^<[^>]+>/, '')
        .replace(/<\\/?[^>]+>$/, '')
        .trim();

  // Fix for some local models I tried that seem to like randomly hallucinating this tag
  return extractedTaggedText.replaceAll('[TOOL_CALLS]', '');
}`;

export const llmInheritToggleModeSchema = z.enum(['enabled', 'disabled']);
export type LlmInheritToggleMode = z.infer<typeof llmInheritToggleModeSchema>;
export const tokenStreamingModeSchema = llmInheritToggleModeSchema;
export type TokenStreamingMode = LlmInheritToggleMode;

export const llmConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  rule: z.string(),
  llmMetaOptions: z.string(),
  llmUrl: z.string().optional(),
  llmAuthToken: z.string().optional(),
  responsePreParserSource: z.string().optional(),
  tokenStreamingEnabled: tokenStreamingModeSchema.optional(),
  appIdentificationHeadersEnabled: llmInheritToggleModeSchema.optional(),
  concurrencyGroupName: z.string().optional(),
  concurrencyGroupLimit: z.number().optional(),
});

export type LLMConfig = z.infer<typeof llmConfigSchema>;
export type LLMConfigById = Record<string, LLMConfig>;

export function findBaseDefaultsLLMConfig(configs: LLMConfigById) {
  return configs[BASE_DEFAULTS_LLM_CONFIG_ID];
}

const KNOWN_CLOUD_LLM_HOSTNAMES = [
  'openrouter.ai',
  'openai.com',
  'anthropic.com',
  'together.xyz',
  'together.ai',
  'groq.com',
  'deepseek.com',
  'mistral.ai',
  'perplexity.ai',
  'googleapis.com',
  'google.dev',
  'fireworks.ai',
  'cohere.ai',
  'cohere.com',
  'cerebras.ai',
  'sambanova.ai',
  'novita.ai',
  'siliconflow.cn',
  'x.ai',
  'lepton.run',
  'cloudflare.com',
  'huggingface.co',
  'replicate.com',
  'nano-gpt.com',
];

export const APP_IDENTIFICATION_URL = 'https://github.com/mistval/yozakura';
export const APP_IDENTIFICATION_NAME = 'Yozakura';
export const PROXY_REFERER_HEADER = 'X-Proxy-Referer';

const ATTRIBUTION_PROVIDER_DOMAINS = [
  'openrouter.ai',
  'requesty.ai',
  'featherless.ai',
  'ai-gateway.vercel.sh',
];

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isKnownCloudLlmProvider(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return KNOWN_CLOUD_LLM_HOSTNAMES.some((known) => matchesDomain(host, known));
  } catch {
    return false;
  }
}

/**
 * Returns provider-recognized app identification headers for LLM gateways/routers
 * that support attribution (OpenRouter, Requesty, Featherless AI, Vercel AI Gateway).
 * Includes X-Proxy-Referer so the backend proxy can rewrite the forbidden browser Referer header.
 */
export function buildAppIdentificationHeaders(targetUrl: string): Record<string, string> {
  const host = new URL(targetUrl).hostname.toLowerCase();
  if (!ATTRIBUTION_PROVIDER_DOMAINS.some((domain) => matchesDomain(host, domain))) {
    return {};
  }

  const headers: Record<string, string> = {
    'HTTP-Referer': APP_IDENTIFICATION_URL,
    [PROXY_REFERER_HEADER]: APP_IDENTIFICATION_URL,
    'X-Title': APP_IDENTIFICATION_NAME,
  };

  if (matchesDomain(host, 'openrouter.ai')) {
    headers['X-OpenRouter-Title'] = APP_IDENTIFICATION_NAME;
  }

  return headers;
}

export function updateLLMConfigsWithBaseDefaultsConnection(
  configs: LLMConfigById,
  llmUrlInput: string,
  llmAuthTokenInput: string,
  llmModelInput: string
): LLMConfigById {
  const trimmedUrl = llmUrlInput.trim();
  const trimmedToken = llmAuthTokenInput.trim();
  const trimmedModel = llmModelInput.trim();
  const baseConfigEntry = findBaseDefaultsLLMConfig(configs);
  assertNonNullish(baseConfigEntry, 'unable to find base LLM config');

  const shouldAutoSetConcurrency =
    isKnownCloudLlmProvider(trimmedUrl) &&
    (baseConfigEntry.concurrencyGroupLimit === 1 || baseConfigEntry.concurrencyGroupLimit === undefined);

  const concurrencyGroupLimit = shouldAutoSetConcurrency ? 6 : baseConfigEntry.concurrencyGroupLimit;

  const nextBaseConfig: LLMConfig = {
    ...baseConfigEntry,
    llmMetaOptions: JSON.stringify(
      {
        ...parseLlmMetaOptions(baseConfigEntry.llmMetaOptions),
        model: trimmedModel || undefined,
      },
      null,
      2
    ),
    llmUrl: trimmedUrl || undefined,
    llmAuthToken: trimmedToken || undefined,
    concurrencyGroupLimit,
  };

  const nextConfigs: LLMConfigById = {
    ...configs,
    [BASE_DEFAULTS_LLM_CONFIG_ID]: nextBaseConfig,
  };

  return nextConfigs;
}

export const DEFAULT_LLM_CONFIGS: LLMConfigById = {
  [BASE_DEFAULTS_LLM_CONFIG_ID]: {
    id: BASE_DEFAULTS_LLM_CONFIG_ID,
    name: BASE_DEFAULTS_CONFIG_NAME,
    rule: 'true',
    llmMetaOptions: JSON.stringify(LLM_DEFAULTS, null, 2),
    llmUrl: DEFAULT_COMPLETIONS_URL,
    responsePreParserSource: DEFAULT_RESPONSE_PRE_PARSER_SOURCE,
    tokenStreamingEnabled: 'enabled',
    appIdentificationHeadersEnabled: 'enabled',
    concurrencyGroupName: 'default_llm',
    concurrencyGroupLimit: 1,
  },
  'npc-respond': {
    id: 'npc-respond',
    name: 'Chat: NPC Respond',
    rule: "context.promptTemplateGroup === 'gen_npc_response'",
    llmMetaOptions: JSON.stringify(LLM_DEFAULTS_CHAT, null, 2),
  },
  'chat-scene-image-prompt': {
    id: 'chat-scene-image-prompt',
    name: 'Chat: Generate Image Prompt',
    rule: "context.promptTemplateGroup.split('.')[0] === 'gen_chat_scene_image_prompt'",
    llmMetaOptions: JSON.stringify({ max_tokens: 200 }),
  },
  'intelligent-speaker-select': {
    id: 'intelligent-speaker-select',
    name: 'Chat: Intelligent Next Speaker Selection',
    rule: "context.promptTemplateGroup === 'gen_intelligent_next_speaker_select'",
    llmMetaOptions: JSON.stringify({ max_tokens: 200 }),
  },
  'intelligent-judge-chat-end': {
    id: 'intelligent-judge-chat-end',
    name: 'Chat: Intelligent Judge Conversation End',
    rule: "context.promptTemplateGroup === 'gen_conversation_end_judgement'",
    llmMetaOptions: JSON.stringify({ max_tokens: 200 }),
  },
  'conversation-rolling-summary': {
    id: 'conversation-rolling-summary',
    name: 'Chat Memory: Summarize Conversation',
    rule: "context.promptTemplateGroup === 'gen_convo_summary'",
    llmMetaOptions: JSON.stringify({ max_tokens: 650 }),
  },
  'offscreen-memory-extraction': {
    id: 'offscreen-memory-extraction',
    name: 'Chat Memory: Learn About Offscreen Character',
    rule: "context.promptTemplateGroup === 'gen_offscreen_learned_information'",
    llmMetaOptions: JSON.stringify({ max_tokens: 500 }),
  },
  'rolling-pairwise-memory-rewrite': {
    id: 'rolling-pairwise-memory-rewrite',
    name: 'Chat Memory: Pairwise Memory Rewrite',
    rule: "context.promptTemplateGroup === 'gen_pairwise_memory'",
    llmMetaOptions: JSON.stringify({ max_tokens: 1200 }),
  },
  'offscreen-conversation-goal': {
    id: 'offscreen-conversation-goal',
    name: 'Chat Memory: Offscreen Character Conversation Goal Update',
    rule: "context.promptTemplateGroup === 'gen_offscreen_character_binary_update_next_convo_goal'",
    llmMetaOptions: JSON.stringify({ max_tokens: 400 }),
  },
  'next-conversation-goal': {
    id: 'next-conversation-goal',
    name: 'Chat Memory: Onscreen Character Conversation Goal Update',
    rule: "context.promptTemplateGroup === 'gen_convo_goal'",
    llmMetaOptions: JSON.stringify({ max_tokens: 400 }),
  },
  'relationship-tag-update': {
    id: 'relationship-tag-update',
    name: 'Chat Memory: Relationship Tag Update',
    rule: "context.promptTemplateGroup === 'gen_relationship_descriptor'",
    llmMetaOptions: JSON.stringify({ max_tokens: 10 }),
  },
  'rolling-global-memory-rewrite': {
    id: 'rolling-global-memory-rewrite',
    name: 'Chat Memory: Global Memory Rewrite',
    rule: "context.promptTemplateGroup === 'gen_global_memory'",
    llmMetaOptions: JSON.stringify({ max_tokens: 1200 }),
  },
  'character-description': {
    id: 'character-description',
    name: 'Character Creation: Generate Internal Description',
    rule: "context.promptTemplateGroup === 'gen_character_internal_description'",
    llmMetaOptions: JSON.stringify({ max_tokens: 1200 }),
  },
  'external-description': {
    id: 'external-description',
    name: 'Character Creation: Generate External Description',
    rule: "context.promptTemplateGroup === 'gen_character_external_description'",
    llmMetaOptions: JSON.stringify({ max_tokens: 300 }),
  },
  'extract-character-description': {
    id: 'extract-character-description',
    name: 'Character Creation: Extract Character Description',
    rule: "context.promptTemplateGroup === 'gen_extract_character_description'",
    llmMetaOptions: JSON.stringify({ max_tokens: 1200 }),
  },
  'generate-character-example-dialog': {
    id: 'generate-character-example-dialog',
    name: 'Character Creation: Generate Character Example Dialogue',
    rule: "context.promptTemplateGroup === 'gen_character_example_dialog'",
    llmMetaOptions: JSON.stringify({ max_tokens: 800 }),
  },
  'base-appearance': {
    id: 'base-appearance',
    name: 'Character Creation: Generate Base Appearance',
    rule: "context.promptTemplateGroup === 'gen_character_base_appearance'",
    llmMetaOptions: JSON.stringify({ max_tokens: 200 }),
  },
  wardrobe: {
    id: 'wardrobe',
    name: 'Character Creation: Generate Wardrobe',
    rule: "context.promptTemplateGroup === 'gen_character_wardrobe'",
    llmMetaOptions: JSON.stringify({ max_tokens: 200 }),
  },
};
