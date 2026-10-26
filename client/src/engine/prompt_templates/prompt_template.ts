import type { z } from 'zod';
import { runWithInteractiveRetry } from '../interative_retry';
import { etaRender } from '../../util/eta';
import { useTemplateRenderLogStore } from '../../state/template_render_log_store';
import type { SettingsBridge } from '../settings/settings_bridge';
import type { PromptTemplateRole, TemplateSettingsData } from './template_types';

export type PromptTemplateRenderOptions = {
  completionRequestId?: string | undefined;
};

const TEMPLATE_RENDER_RETRY_HINT = 'You may have to edit your template.';

export class PromptTemplate<TContextType extends object> {
  public readonly templateId: string;
  public readonly contextSchema: z.ZodType<TContextType>;
  public readonly settingsBridge: SettingsBridge<TemplateSettingsData>;

  public constructor(params: {
    templateId: string;
    contextSchema: z.ZodType<TContextType>;
    settingsBridge: SettingsBridge<TemplateSettingsData>;
  }) {
    this.templateId = params.templateId;
    this.contextSchema = params.contextSchema;
    this.settingsBridge = params.settingsBridge;
  }

  public get templateName(): string {
    return this.settingsBridge.get().name;
  }

  public get templateDescription(): string {
    return this.settingsBridge.get().description;
  }

  public get role(): PromptTemplateRole {
    return this.settingsBridge.get().role;
  }

  public get defaultTemplateString(): string {
    return this.settingsBridge.getDefault().templateString;
  }

  public getTemplateString(): string {
    return this.settingsBridge.get().templateString;
  }

  public async render(context: TContextType, options?: PromptTemplateRenderOptions): Promise<string> {
    return runWithInteractiveRetry<string>({
      operationType: `template.render.${this.templateId}`,
      maxRetries: Number.POSITIVE_INFINITY,
      hint: TEMPLATE_RENDER_RETRY_HINT,
      run: async () => {
        const parsedContext = this.contextSchema.parse(context);
        const templateString = this.getTemplateString();
        const rendered = await etaRender(templateString, parsedContext);

        if (options?.completionRequestId) {
          useTemplateRenderLogStore.getState().postTemplateRender({
            completionRequestId: options.completionRequestId,
            template: {
              templateId: this.templateId,
              templateName: this.templateName,
              role: this.role,
              renderedOutput: rendered,
            },
          });
        }

        return rendered;
      },
    });
  }
}

export { PromptTemplate as PromptTemplateBase };
