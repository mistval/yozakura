import { z } from 'zod';
import { runWithInteractiveRetry } from '../interative_retry';
import { useSettingsStore } from '../../state/settings_store';
import { etaRender } from '../../util/eta';
import { useTemplateRenderLogStore } from '../../state/template_render_log_store';

type PromptTemplateRenderOptions = {
  completionRequestId?: string | undefined;
};

const TEMPLATE_RENDER_RETRY_HINT = 'You may have to edit your template.';

export abstract class PromptTemplateBase<TContextType extends object> {
  public abstract readonly defaultTemplateString: string;
  public abstract readonly contextSchema: z.ZodType<TContextType>;
  public abstract readonly templateName: string;
  public abstract readonly templateDescription: string;
  public abstract readonly templateId: string;
  public abstract readonly role: 'system' | 'user' | 'assistant';

  private getTemplateOverride() {
    return useSettingsStore.getState().promptTemplateOverrides[this.templateId];
  }

  public getTemplateString(): string {
    return this.getTemplateOverride()?.templateString ?? this.defaultTemplateString;
  }

  public async render(context: TContextType, options?: PromptTemplateRenderOptions): Promise<string> {
    return runWithInteractiveRetry<string>({
      operationType: `template.render.${this.templateId}`,
      maxRetries: Number.POSITIVE_INFINITY,
      hint: TEMPLATE_RENDER_RETRY_HINT,
      run: async () => {
        this.contextSchema.parse(context);
        const templateString = this.getTemplateString();
        const rendered = await etaRender(templateString, context);

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
