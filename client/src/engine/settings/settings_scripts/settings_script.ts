import z from 'zod';

const settingsScriptStringControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('string'),
    label: z.string().optional(),
    default: z.string().optional(),
    placeholder: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
  })
  .meta({
    description: 'A regular text input allowing a string value.',
  });

const settingsScriptNumberControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('number'),
    label: z.string().optional(),
    default: z.string().optional(),
    placeholder: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  })
  .meta({
    description:
      'A numeric input. The stored value is always a string; parse it (e.g. with Number()) inside generateImages.',
  });

const settingsScriptPasswordControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('password'),
    label: z.string().optional(),
    default: z.string().optional(),
    placeholder: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
  })
  .meta({
    description: 'A string input that masks its value, with a Show button to reveal it.',
  });

const settingsScriptJsonControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('json'),
    label: z.string().optional(),
    default: z.string().optional(),
    placeholder: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
  })
  .meta({
    description:
      'A textarea whose value is validated to be valid JSON. The stored value is the raw JSON string; parse it inside generateImages.',
  });

const settingsScriptDropdownSelectControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('dropdown_select'),
    label: z.string().optional(),
    default: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
    options: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ),
  })
  .meta({
    description: 'A dropdown selector. Defaults to the first option when no default is given.',
  });

const settingsScriptCalendarControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('calendar'),
    label: z.string().optional(),
    default: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
  })
  .meta({
    description:
      'A calendar date picker. The stored value is an ISO date string (YYYY-MM-DD). `default` is an ISO date string.',
  });

const settingsScriptButtonControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('button'),
    title: z.string(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
  })
  .meta({
    description: 'A button control. Clicking it invokes the script buttonHandler with this control id.',
  });

const settingsScriptTextFileListControlSchema = z
  .object({
    id: z.string(),
    type: z.literal('text_file_list'),
    label: z.string().optional(),
    default: z.string().optional(),
    tooltipHtml: z.string().optional(),
    width: z.enum(['full']).optional(),
  })
  .meta({
    description:
      'A picker for a named, user-editable text file (e.g. a ComfyUI workflow), with create / edit / delete. The stored control value is the selected file id; load the file content at run time with `helpers.loadUserTextFile(controlId, fileId)`. Files persist outside the settings blob.',
  });

export const settingsScriptControlSchema = z.discriminatedUnion('type', [
  settingsScriptStringControlSchema,
  settingsScriptNumberControlSchema,
  settingsScriptPasswordControlSchema,
  settingsScriptJsonControlSchema,
  settingsScriptDropdownSelectControlSchema,
  settingsScriptCalendarControlSchema,
  settingsScriptButtonControlSchema,
  settingsScriptTextFileListControlSchema,
]);

export type SettingsScriptControl = z.infer<typeof settingsScriptControlSchema>;

const buttonHandlerReturnValueSchema = z.object({
  result: z.enum(['success', 'failure']),
  resultDescription: z.string(),
  data: z.unknown().optional(),
});

export type ButtonHandlerResult = z.infer<typeof buttonHandlerReturnValueSchema>;

export const settingsScriptControlJSONSchema = settingsScriptControlSchema.toJSONSchema();

export type SettingsControlValues = Record<string, string>;

export type ProxiedFetchInit = {
  method?: string | undefined;
  headers?: Record<string, string> | [string, string][] | undefined;
  body?: string | undefined;
};

export type ProxiedFetch = (url: string, init?: ProxiedFetchInit) => Promise<Response>;

export type SettingsScriptHelpers = {
  proxiedFetch: ProxiedFetch;
  abortSignal: AbortSignal | undefined;
  loadUserTextFile: (controlId: string, fileId: string) => Promise<string | undefined>;
  createSeededRandom: (seed: string | number) => () => number;
};

export type ControlsContext = {
  controlValues: SettingsControlValues;
  buttonData: Record<string, unknown>;
};

export type SettingsScriptControlsDefinition = (context: ControlsContext) => SettingsScriptControl[];

export type ControlScript = {
  description?: string | undefined;
  controls?: SettingsScriptControlsDefinition | undefined;
  buttonHandler?:
    | ((
        buttonId: string,
        controlValues: SettingsControlValues,
        helpers: SettingsScriptHelpers
      ) => Promise<ButtonHandlerResult>)
    | undefined;
};

export type ResolvedControlScript = { ok: true; script: ControlScript } | { ok: false; error: string };

export type ScriptSectionDescriptor = {
  sectionId: string;
  builtinOptions: { value: string; label: string }[];
  resolveScript: (selectedScriptId: string, source: string) => ResolvedControlScript;
  getDocumentation: (selectedScriptId: string) => string;
  documentationTitle: string;
  enableCustom?: boolean;
  selectLabel?: string;
  selectTooltipHtml?: string;
  postSelectOpenHelpHtml?: string;
};

export type ScriptSelection = {
  selectedScriptId: string;
  controlValues: Record<string, string>;
  onScriptSaved: () => void;
  onSelectScript: (scriptId: string) => void;
  onSetControlValue: (controlId: string, value: string) => void;
  onResetControlValues: () => void;
};
