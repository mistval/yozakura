import { create } from 'zustand';

const TEMPLATE_RENDER_LOG_LIMIT = 100;

type TemplateRenderLogRenderedTemplate = {
  templateId: string;
  templateName: string;
  role: string;
  renderedOutput: string;
};

type TemplateRenderLogEntry = {
  createdAt: string;
  updatedAt: string;
  completionRequestId: string;
  promptChain?:
    | {
        id: string;
        name: string;
      }
    | undefined;
  completions?:
    | {
        rawResponse: string;
        reasoning?: string | undefined;
      }
    | undefined;
  parser?:
    | {
        parsedResponse: unknown;
      }
    | undefined;
  templates: TemplateRenderLogRenderedTemplate[];
};

type TemplateRenderLogStoreState = {
  entries: TemplateRenderLogEntry[];
  postTemplateRender: (entry: {
    completionRequestId: string;
    promptChain?: {
      id: string;
      name: string;
    };
    template?: TemplateRenderLogRenderedTemplate;
    completions?: {
      rawResponse: string;
      reasoning?: string | undefined;
    };
    parser?: {
      parsedResponse: unknown;
    };
  }) => void;

  clear: () => void;
};

function upsertEntry(
  entries: TemplateRenderLogEntry[],
  completionRequestId: string,
  updater: (current: TemplateRenderLogEntry, now: string) => TemplateRenderLogEntry
): TemplateRenderLogEntry[] {
  const now = new Date().toISOString();
  const existingIndex = entries.findIndex((entry) => entry.completionRequestId === completionRequestId);
  const existingEntry =
    entries[existingIndex] ??
    ({
      completionRequestId,
      createdAt: now,
      updatedAt: now,
      templates: [],
    } satisfies TemplateRenderLogEntry);

  const updatedEntry = updater(existingEntry, now);
  const remaining = existingIndex >= 0 ? entries.filter((_, index) => index !== existingIndex) : entries;

  return [updatedEntry].concat(remaining).slice(0, TEMPLATE_RENDER_LOG_LIMIT);
}

export const useTemplateRenderLogStore = create<TemplateRenderLogStoreState>((set) => ({
  entries: [],
  postTemplateRender: (entry) => {
    set((state) => ({
      entries: upsertEntry(state.entries, entry.completionRequestId, (current, now) => {
        return {
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
          completionRequestId: entry.completionRequestId,
          promptChain: entry.promptChain ?? current?.promptChain,
          templates: current?.templates.concat(entry.template ?? []),
          parser: entry.parser ?? current?.parser,
          completions: entry.completions ?? current?.completions,
        };
      }),
    }));
  },
  clear: () => set({ entries: [] }),
}));
