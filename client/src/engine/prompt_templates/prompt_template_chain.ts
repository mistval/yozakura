import type { z } from 'zod';
import type { OpenAIChatCompletionRequestMessage } from '../types';
import { PromptTemplate } from './prompt_template';
import { PromptOutputParser } from './prompt_output_parser';
import { chatCompletion } from '../llm';
import { etaRenderSync } from '../../util/eta';
import { promptChainDocumentationTemplate } from './prompt_chain_documentation_template';
import { assertNonNullish } from '../../errors/application_error';
import { useTemplateRenderLogStore } from '../../state/template_render_log_store';
import { newId } from '../../util/id';
import type { PromptExecutionContext } from './prompt_template_context_fields';
import { getUsabilityProcessedJSONSchema } from './prompt_chain_documentation_helper';
import type { SettingsBridge } from '../settings/settings_bridge';
import {
  chainSpecToDefaultSettingsData,
  type PromptOutputParserSpec,
  type PromptTemplateChainSpec,
  type PromptTemplateSpec,
  type TemplateChainSettingsData,
  type TemplateGroupSettingsData,
  type TemplateSettingsData,
} from './template_types';

export type { PromptTemplateSpec, PromptOutputParserSpec, PromptTemplateChainSpec };

export type PromptTemplateChainTemplateEntry<TContextType extends object> = {
  template: PromptTemplate<TContextType>;
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

export class PromptTemplateChain<TContextType extends PromptExecutionContext, TOutputType = undefined> {
  public readonly templateChainId: string;
  public readonly contextSchema: z.ZodType<TContextType>;
  public readonly defaultData: TemplateChainSettingsData;
  public readonly settingsBridge: SettingsBridge<TemplateChainSettingsData>;
  public readonly templates: PromptTemplateChainTemplateEntry<TContextType>[];
  public readonly parser: PromptOutputParser<TContextType, TOutputType> | undefined;

  public constructor(params: {
    templateChainId: string;
    defaultTitle: string;
    defaultDescription: string;
    contextSchema: z.ZodType<TContextType>;
    templates: PromptTemplateSpec[];
    parser?: PromptOutputParserSpec<TOutputType>;
    groupSettingsBridge: SettingsBridge<TemplateGroupSettingsData>;
  }) {
    this.templateChainId = params.templateChainId;
    this.contextSchema = params.contextSchema;
    this.defaultData = chainSpecToDefaultSettingsData(params);

    this.settingsBridge = params.groupSettingsBridge.subBridge<TemplateChainSettingsData>({
      select: (groupData) => groupData.templateChains[this.templateChainId],
      fallbackDefault: this.defaultData,
      toPatch: (chainPatch) => ({
        templateChains: {
          [this.templateChainId]: chainPatch,
        },
      }),
    });

    this.templates = params.templates.map((spec) => {
      const defaultTemplateData: TemplateSettingsData = {
        name: spec.name,
        description: spec.description,
        role: spec.role,
        templateString: spec.defaultTemplateString,
      };

      const templateBridge = this.settingsBridge.subBridge<TemplateSettingsData>({
        select: (chainData) => chainData.templates[spec.templateId],
        fallbackDefault: defaultTemplateData,
        toPatch: (templatePatch) => ({
          templates: {
            [spec.templateId]: templatePatch,
          },
        }),
      });

      return {
        template: new PromptTemplate<TContextType>({
          templateId: spec.templateId,
          contextSchema: this.contextSchema,
          settingsBridge: templateBridge,
        }),
      };
    });

    if (params.parser) {
      const parserBridge = this.settingsBridge.subBridge<string>({
        select: (chainData) => chainData.parserSource,
        fallbackDefault: params.parser.defaultParserSource,
        toPatch: (nextSource) => ({
          parserSource: nextSource ?? undefined,
        }),
      });

      this.parser = new PromptOutputParser<TContextType, TOutputType>({
        parserOutputSchema: params.parser.parserOutputSchema,
        settingsBridge: parserBridge,
      });
    }
  }

  public get templateChainTitle(): string {
    return this.settingsBridge.get().title;
  }

  public get templateChainDescription(): string {
    return this.settingsBridge.get().description;
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
