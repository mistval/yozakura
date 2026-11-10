import { create } from 'zustand';
import type { IParallelJob } from '../engine/parallelization/job_manager_types.js';
import {
  ChatJobTags,
  DEFAULT_LLM_PARALLELISM_GROUP,
  IMAGE_GENERATION_PARALLELISM_GROUP,
} from '../engine/parallelization/yozakura_job_manager_types.js';
import { globalParallelJobManager } from '../engine/parallelization/job_manager.js';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from './settings_store.js';
import type { ParallelPromptJobConfig } from '../engine/types.js';
import { useScenarioLoopStateStore } from './scenario_loop_state_store.js';
import { useScenarioStore } from './scenario_store.js';
import {
  ScenarioLoopAbortSignalException,
  UserPauseSignalException,
  UserStopSignalException,
} from '../engine/scenario_loop/flow_control.js';

function syncConcurrencyWithSettings(settings: ReturnType<typeof useSettingsStore.getState>) {
  const configs = Object.values(settings.llmConfigs || {});
  const limitsByGroup = new Map<string, number[]>();

  for (const config of configs) {
    const groupName = config.concurrencyGroupName?.trim();
    if (!groupName) continue;

    if (!limitsByGroup.has(groupName)) {
      limitsByGroup.set(groupName, [Number.MAX_SAFE_INTEGER]);
    }
    if (config.concurrencyGroupLimit !== undefined && config.concurrencyGroupLimit > 0) {
      limitsByGroup.get(groupName)!.push(config.concurrencyGroupLimit);
    }
  }

  if (!limitsByGroup.has(DEFAULT_LLM_PARALLELISM_GROUP)) {
    limitsByGroup.set(DEFAULT_LLM_PARALLELISM_GROUP, [1]);
  }

  for (const [groupName, limits] of limitsByGroup) {
    const minLimit = Math.min(...limits);
    globalParallelJobManager.setConcurrencyForGroup(groupName, minLimit);
  }

  const imageConcurrency = settings.generateImagesInParallelWithText
    ? Math.max(1, settings.imageGenerationConcurrency || 1)
    : 1;
  globalParallelJobManager.setConcurrencyForGroup(IMAGE_GENERATION_PARALLELISM_GROUP, imageConcurrency);
}

// Initial sync and reactive subscription
syncConcurrencyWithSettings(useSettingsStore.getState());
useSettingsStore.subscribe((state) => {
  syncConcurrencyWithSettings(state);
});

globalParallelJobManager.addPreQueueMiddleware((job) => {
  const tags = job.tags ?? [];
  const loopState = useScenarioLoopStateStore.getState();

  if (tags.includes(ChatJobTags.abortOnPause) && loopState.userRequestedPhaseTransition === 'paused') {
    throw new UserPauseSignalException();
  }

  if (tags.includes(ChatJobTags.scenarioLoopJob) && loopState.userRequestedPhaseTransition === 'stopped') {
    throw new UserStopSignalException();
  }
});

useScenarioLoopStateStore.subscribe((state) => {
  if (state.userRequestedPhaseTransition === 'stopped') {
    globalParallelJobManager.cancelJobsByTag(ChatJobTags.scenarioLoopJob, new UserStopSignalException());
  }

  if (state.userRequestedPhaseTransition === 'paused') {
    globalParallelJobManager.cancelJobsByTag(ChatJobTags.abortOnPause, new UserPauseSignalException());
  }
});

useScenarioStore.subscribe((newState, prevState) => {
  if (newState.activeScenario?.id !== prevState.activeScenario?.id) {
    globalParallelJobManager.cancelJobsByTag(
      ChatJobTags.scenarioLoopJob,
      new ScenarioLoopAbortSignalException()
    );
  }
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

export function createTextCompletionJobConfig(
  name: string,
  tags?: string[] | undefined
): ParallelPromptJobConfig {
  const isImageParallel = useSettingsStore.getState().generateImagesInParallelWithText;
  const tagSet = new Set(tags);
  if (tagSet.has(ChatJobTags.chatJob)) {
    tagSet.add(ChatJobTags.scenarioLoopJob);
  }
  return {
    name,
    tags: Array.from(tagSet),
    exclusiveWithParallelismGroups: !isImageParallel ? [IMAGE_GENERATION_PARALLELISM_GROUP] : undefined,
  };
}
