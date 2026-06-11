import { create } from 'zustand';

const PROMPT_LOG_LIMIT = 100;

type PromptLogEntry = {
  id: number;
  createdAt: string;
  payloadJson: string;
  transportOptionsJson: string;
  responseJson: string;
};

type PromptLogStoreState = {
  entries: PromptLogEntry[];
  addEntry: (entry: Omit<PromptLogEntry, 'id' | 'createdAt'>) => void;
  clear: () => void;
};

let nextPromptLogEntryId = 1;

export const usePromptLogStore = create<PromptLogStoreState>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        {
          id: nextPromptLogEntryId++,
          createdAt: new Date().toISOString(),
          ...entry,
        },
      ]
        .concat(state.entries)
        .slice(0, PROMPT_LOG_LIMIT),
    })),
  clear: () => set({ entries: [] }),
}));
