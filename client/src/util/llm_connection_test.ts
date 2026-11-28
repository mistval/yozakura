import { chatCompletion } from '../engine/llm.js';
import { buildGlobalTemplateContext } from '../engine/prompt_templates/prompt_context_builder.js';
import type { LLMConfig } from '../engine/settings/cascading_llm_configs.js';
import { getErrorMessage } from '../errors/error_util.js';

export type LlmGenerateTextTestResult = { ok: true; responseText: string } | { ok: false; error: string };

export async function testLlmGenerateText(
  configsOverride: readonly LLMConfig[]
): Promise<LlmGenerateTextTestResult> {
  try {
    const responseText = await chatCompletion([{ role: 'user', content: 'hi' }], {
      promptTemplateGroup: 'test_generate_text',
      promptContext: buildGlobalTemplateContext(),
      completionRequestId: '',
      configsOverride,
      skipInteractiveRetry: true,
      jobConfig: { name: 'Test Generation' },
    });

    return { ok: true, responseText };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
