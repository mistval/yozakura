import { z } from 'zod';

export const PROMPT_TEMPLATES_ROOT_GROUP_ID = 'prompt_templates_root';
export const RUNTIME_CHAT_TEMPLATES_GROUP_ID = 'runtime_chat_templates';
export const CHARACTER_GENERATION_TEMPLATES_GROUP_ID = 'character_generation_templates';
export const MEMORIES_GROUP_ID = 'memories';

export const promptTemplateRoleSchema = z.enum(['system', 'user', 'assistant']);
export type PromptTemplateRole = z.infer<typeof promptTemplateRoleSchema>;

export const templateSettingsDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  role: promptTemplateRoleSchema,
  templateString: z.string(),
});
export type TemplateSettingsData = z.infer<typeof templateSettingsDataSchema>;

export const templateChainSettingsDataSchema = z.object({
  title: z.string(),
  description: z.string(),
  parserSource: z.string().optional(),
  templates: z.record(z.string(), templateSettingsDataSchema),
});
export type TemplateChainSettingsData = z.infer<typeof templateChainSettingsDataSchema>;

export const templateGroupSettingsDataSchema = z.object({
  templateChains: z.record(z.string(), templateChainSettingsDataSchema),
});
export type TemplateGroupSettingsData = z.infer<typeof templateGroupSettingsDataSchema>;

export const templateGroupDataSchema = z.record(z.string(), templateGroupSettingsDataSchema);
export type TemplateGroupData = z.infer<typeof templateGroupDataSchema>;

export type PromptTemplateSpec = {
  templateId: string;
  name: string;
  description: string;
  role: PromptTemplateRole;
  defaultTemplateString: string;
};

export type PromptOutputParserSpec<TOutputType> = {
  defaultParserSource: string;
  parserOutputSchema: z.ZodType<TOutputType>;
};

export type PromptTemplateChainSpec<TContextType extends object = object, TOutputType = undefined> = {
  templateChainId: string;
  defaultTitle: string;
  defaultDescription: string;
  contextSchema: z.ZodType<TContextType>;
  templates: PromptTemplateSpec[];
  parser?: PromptOutputParserSpec<TOutputType>;
};

export function chainSpecToDefaultSettingsData(
  spec: PromptTemplateChainSpec<any, any>
): TemplateChainSettingsData {
  return {
    title: spec.defaultTitle,
    description: spec.defaultDescription,
    parserSource: spec.parser?.defaultParserSource,
    templates: Object.fromEntries(
      spec.templates.map((t) => [
        t.templateId,
        {
          name: t.name,
          description: t.description,
          role: t.role,
          templateString: t.defaultTemplateString,
        },
      ])
    ),
  };
}

export function chainSpecsToGroupDefaultData(
  specs: PromptTemplateChainSpec<any, any>[]
): TemplateGroupSettingsData {
  return {
    templateChains: Object.fromEntries(
      specs.map((spec) => [spec.templateChainId, chainSpecToDefaultSettingsData(spec)])
    ),
  };
}
