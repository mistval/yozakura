import { create } from 'zustand';
import type { IParallelJob } from '../engine/parallelization/job_manager_types.js';
import { globalParallelJobManager } from '../engine/parallelization/job_manager.js';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from './settings_store.js';

function syncConcurrencyWithSettings(settings: ReturnType<typeof useSettingsStore.getState>) {
  const configs = Object.values(settings.llmConfigs || {});
  const limitsByGroup = new Map<string, number[]>();

  for (const config of configs) {
    const groupName =
      config.concurrencyGroupName?.trim() || (config.id === 'base' ? 'default_llm' : undefined);
    if (!groupName) continue;

    if (!limitsByGroup.has(groupName)) {
      limitsByGroup.set(groupName, []);
    }
    if (config.concurrencyGroupLimit !== undefined && config.concurrencyGroupLimit > 0) {
      limitsByGroup.get(groupName)!.push(config.concurrencyGroupLimit);
    }
  }

  if (!limitsByGroup.has('default_llm')) {
    limitsByGroup.set('default_llm', [2]);
  }

  for (const [groupName, limits] of limitsByGroup) {
    const minLimit = limits.length > 0 ? Math.min(...limits) : (groupName === 'default_llm' ? 2 : 1);
    globalParallelJobManager.setConcurrencyForGroup(groupName, minLimit);
  }

  const imageConcurrency = settings.generateImagesInParallelWithText
    ? Math.max(1, settings.imageGenerationConcurrency || 1)
    : 1;
  globalParallelJobManager.setConcurrencyForGroup('image_generation', imageConcurrency);
}

// Initial sync and reactive subscription
syncConcurrencyWithSettings(useSettingsStore.getState());
useSettingsStore.subscribe((state) => {
  syncConcurrencyWithSettings(state);
});

export const useParallelJobStore = create<{
  jobs: IParallelJob<unknown>[];
}>((set) => {
  globalParallelJobManager.addObserver(() => {
    set({
      jobs: Array.from(globalParallelJobManager.getJobs()),
    });
  });

  return {
    jobs: Array.from(globalParallelJobManager.getJobs()),
  };
});

export function useJobsWithTag(tag: string) {
  return useParallelJobStore(useShallow((s) => s.jobs.filter((j) => j.tags?.includes(tag))));
}
