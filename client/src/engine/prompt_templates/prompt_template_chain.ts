import { z } from 'zod';
import type { OpenAIChatCompletionRequestMessage } from '../types';
import type { PromptTemplateBase } from './prompt_template';
import type { PromptOutputParser } from './prompt_output_parser';
import { chatCompletion } from '../llm';
import { etaRenderSync } from '../../util/eta';
import { promptChainDocumentationTemplate } from './prompt_chain_documentation_template';
import { assertNonNullish } from '../../errors/application_error';
import { useTemplateRenderLogStore } from '../../state/template_render_log_store';
import { newId } from '../../util/id';
import type { PromptExecutionContext } from './prompt_template_context_fields';
import { getUsabilityProcessedJSONSchema } from './prompt_chain_documentation_helper';

type PromptTemplateChainTemplateEntry<TContextType extends object> = {
  template: PromptTemplateBase<TContextType>;
};

type PromptTemplateChainRenderOptions = {
  completionRequestId?: string;
};

type PromptTemplateChainParseOptions = {
  completionRequestId?: string;
};

function createCompletionRequestId(): string {
  const completionRequestId = newId();

  useTemplateRenderLogStore.getState().postTemplateRender({
    completionRequestId,
  });

  return completionRequestId;
}

export class PromptTemplateChain<TContextType extends PromptExecutionContext, TOutputType> {
  public readonly templateChainId: string;
  public readonly templateChainTitle: string;
  public readonly templateChainDescription: string;
  public readonly contextSchema: z.ZodType<TContextType>;
  public readonly templates: PromptTemplateChainTemplateEntry<TContextType>[];
  public readonly parser: PromptOutputParser<TContextType, TOutputType> | undefined;

  public constructor(params: {
    templateChainId: string;
    templateChainTitle: string;
    templateChainDescription: string;
    contextSchema: z.ZodType<TContextType>;
    templates: PromptTemplateChainTemplateEntry<TContextType>[];
    parser?: PromptOutputParser<TContextType, TOutputType>;
  }) {
    this.templateChainId = params.templateChainId;
    this.templateChainTitle = params.templateChainTitle;
    this.templateChainDescription = params.templateChainDescription;
    this.contextSchema = params.contextSchema;
    this.templates = params.templates;
    this.parser = params.parser;
  }

  public async render(
    context: TContextType,
    options?: PromptTemplateChainRenderOptions
  ): Promise<OpenAIChatCompletionRequestMessage[]> {
    const results: OpenAIChatCompletionRequestMessage[] = [];
    const completionRequestId = options?.completionRequestId ?? createCompletionRequestId();

    useTemplateRenderLogStore.getState().postTemplateRender({
      completionRequestId,
      promptChain: {
        id: this.templateChainId,
        name: this.templateChainTitle,
      },
    });

    for (const entry of this.templates) {
      results.push({
        role: entry.template.role,
        content: await entry.template.render(context, {
          completionRequestId,
        }),
      });
    }

    return results;
  }

  public async parse(
    input: string,
    context: TContextType,
    options?: PromptTemplateChainParseOptions
  ): Promise<TOutputType> {
    assertNonNullish(this.parser);
    const parsedResult = await this.parser.parse(input, context);

    if (options?.completionRequestId) {
      useTemplateRenderLogStore.getState().postTemplateRender({
        completionRequestId: options.completionRequestId,
        parser: {
          parsedResponse: parsedResult,
        },
      });
    }

    return parsedResult;
  }

  public async renderAndExecute(
    promptContext: TContextType,
    options: { abortSignal?: AbortSignal | undefined } = {}
  ): Promise<TOutputType> {
    const completionRequestId = createCompletionRequestId();
    const messages = await this.render(promptContext, { completionRequestId });
    const response = await chatCompletion(messages, {
      promptTemplateGroup: this.templateChainId,
      completionRequestId,
      promptContext,
      abortSignal: options.abortSignal,
    });

    return this.parse(response, promptContext, { completionRequestId });
  }

  public getDocumentation() {
    const documentation = etaRenderSync(promptChainDocumentationTemplate, {
      templates: this.templates.map((entry) => ({
        role: entry.template.role,
        templateName: entry.template.templateName,
        templateDescription: entry.template.templateDescription,
        templateString: entry.template.getTemplateString(),
      })),
      contextSchema: getUsabilityProcessedJSONSchema(
        this.contextSchema.toJSONSchema() as any,
        this.templateChainTitle,
        this.templateChainDescription
      ),
      parserOutputSchema: this.parser?.parserOutputSchema.toJSONSchema(),
      parserSource: this.parser?.getParserSource(),
    });

    return documentation;
  }
}
