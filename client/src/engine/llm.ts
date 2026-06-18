import _ from 'lodash';
import * as Api from '../backend_bridge/api';
import { runWithInteractiveRetry, showNonRetriableErrorCardIfNeeded } from './interative_retry.js';
import type { PromptMessage } from './types.js';
import { useSettingsStore } from '../state/settings_store.js';
import { usePromptLogStore } from '../state/prompt_log_store.js';
import { useTemplateRenderLogStore } from '../state/template_render_log_store.js';
import { getErrorMessage } from '../errors/error_util.js';
import type { PromptExecutionContext } from './prompt_templates/prompt_template_context_fields';

type ResponsePreParser = (response: string) => string;

const IDENTITY_RESPONSE_PRE_PARSER: ResponsePreParser = (response) => response;

type ChatCompletionOptions = {
  promptContext: PromptExecutionContext;
  promptTemplateGroup: string;
  onTokens?: (fullText: string) => void | undefined;
  completionRequestId: string;
  abortSignal?: AbortSignal | undefined;
  [key: string]: unknown;
};

type ConfigRuleContext = {
  promptTemplateGroup: string | undefined;
} & PromptExecutionContext;

type ResolvedLlmPromptOptions = {
  metaOptions: Record<string, unknown>;
  targetUrl?: string;
  authToken?: string;
  responsePreParserSource?: string;
};

type LlmTransportOptions = {
  targetUrl?: string | undefined;
  authToken?: string | undefined;
  onTokens?: (fullText: string) => void;
};

function stringifyForPromptLog(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function sanitizeTransportOptionsForPromptLog(transportOptions: LlmTransportOptions) {
  return stringifyForPromptLog({
    ...transportOptions,
    authToken: transportOptions.authToken ? '[hidden]' : undefined,
  });
}

function evaluateConfigRule(ruleSource: string, context: ConfigRuleContext): boolean {
  const compiledRule = new Function('context', `return (${ruleSource});`);
  return Boolean(compiledRule(context));
}

function notifyNoMatchingConfig(promptTemplateGroup: string): never {
  const message =
    `No LLM Prompt Option group matched promptTemplateGroup "${promptTemplateGroup}". ` +
    'Add or fix a matching rule in Settings > LLM Settings.';
  const error = new Error(message);

  void showNonRetriableErrorCardIfNeeded({
    operationType: 'llm.prompt_options',
    error,
    hint: 'Check Settings > LLM Settings and ensure at least one config rule matches this prompt type.',
  });

  throw error;
}

function resolveLlmPromptOptions(
  promptTemplateGroup: string,
  executionContext: PromptExecutionContext
): ResolvedLlmPromptOptions {
  const configs = Object.values(useSettingsStore.getState().llmConfigs);
  const context: ConfigRuleContext = { ...executionContext, promptTemplateGroup };

  let matchedCount = 0;
  let metaOptions: Record<string, unknown> = {};
  let transport: { targetUrl?: string; authToken?: string } = {};
  let responsePreParserSource: string | undefined;

  for (const config of configs) {
    const ruleSource = config.rule?.trim();

    if (ruleSource) {
      try {
        if (!evaluateConfigRule(ruleSource, context)) {
          continue;
        }
      } catch (error) {
        void showNonRetriableErrorCardIfNeeded({
          operationType: 'llm.prompt_options',
          error,
          hint: `Failed to evaluate the rule for ${config.name}. Skipping it.`,
        });

        continue;
      }
    }

    matchedCount += 1;

    const parsedMetaOptions = JSON.parse(config.llmMetaOptions) as Record<string, unknown>;
    metaOptions = {
      ...metaOptions,
      ...parsedMetaOptions,
    };

    const trimmedUrl = config.llmUrl?.trim() || '';
    const trimmedToken = config.llmAuthToken?.trim() || '';
    const trimmedResponsePreParserSource = config.responsePreParserSource?.trim();

    transport = {
      ...transport,
      ..._.pickBy({
        targetUrl: trimmedUrl,
        authToken: trimmedToken,
      } satisfies typeof transport),
    };

    if (trimmedResponsePreParserSource) {
      responsePreParserSource = trimmedResponsePreParserSource;
    }
  }

  if (matchedCount === 0) {
    notifyNoMatchingConfig(promptTemplateGroup);
  }

  return {
    metaOptions,
    ...transport,
    ...(responsePreParserSource ? { responsePreParserSource } : {}),
  };
}

function compileResponsePreParser(source: string): ResponsePreParser {
  let maybeParser: unknown;
  try {
    maybeParser = new Function(`return (${source});`)();
  } catch (error) {
    throw new Error(`Response Pre-parser contains invalid JavaScript: ${getErrorMessage(error)}`);
  }

  if (typeof maybeParser !== 'function') {
    throw new Error('Response Pre-parser must evaluate to a function.');
  }

  const parser = maybeParser;
  return (response: string) => {
    let maybeResult: unknown;
    try {
      maybeResult = parser(response);
    } catch (error) {
      throw new Error(`Response Pre-parser threw an error: ${getErrorMessage(error)}`);
    }

    if (typeof maybeResult !== 'string') {
      throw new Error('Response Pre-parser must return a string.');
    }

    return maybeResult;
  };
}

function getResponsePreParser(source: string | undefined): ResponsePreParser {
  const trimmedSource = source?.trim();
  if (!trimmedSource) {
    return IDENTITY_RESPONSE_PRE_PARSER;
  }

  const compiledParser = compileResponsePreParser(trimmedSource);
  return compiledParser;
}

function cleanLlmText(raw: string, responsePreParserSource: string | undefined): string {
  const responsePreParser = getResponsePreParser(responsePreParserSource);
  return responsePreParser(raw).trim();
}

export async function chatCompletion(
  messages: PromptMessage[],
  options: ChatCompletionOptions
): Promise<string> {
  return runWithInteractiveRetry<string>({
    operationType: 'api.llm_completion',
    maxRetries: Number.POSITIVE_INFINITY,
    signal: options.abortSignal,
    run: async () => {
      const {
        promptTemplateGroup,
        onTokens,
        completionRequestId,
        promptContext,
        abortSignal,
        ...llmOptions
      } = options;
      const resolvedPromptOptions = resolveLlmPromptOptions(promptTemplateGroup, promptContext);

      const payload = {
        ...resolvedPromptOptions.metaOptions,
        ...llmOptions,
        messages,
      };

      const transportOptions: LlmTransportOptions = {
        targetUrl: resolvedPromptOptions.targetUrl,
        authToken: resolvedPromptOptions.authToken,
        ...(useSettingsStore.getState().tokenStreamingEnabled && onTokens ? { onTokens } : {}),
      };

      const responseText = await Api.llmChat(payload, { ...transportOptions, signal: options.abortSignal });

      usePromptLogStore.getState().addEntry({
        payloadJson: stringifyForPromptLog(payload),
        transportOptionsJson: sanitizeTransportOptionsForPromptLog(transportOptions),
        responseJson: stringifyForPromptLog(responseText),
      });

      if (completionRequestId) {
        useTemplateRenderLogStore.getState().postTemplateRender({
          completionRequestId,
          completions: {
            rawResponse: responseText,
          },
        });
      }

      const cleaned = cleanLlmText(responseText, resolvedPromptOptions.responsePreParserSource);
      if (!cleaned) {
        throw new Error('Empty LLM response');
      }

      return cleaned;
    },
  });
}
