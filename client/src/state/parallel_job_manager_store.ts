import { create } from 'zustand';
import type { IParallelJob } from '../engine/parallelization/job_manager_types.js';
import { globalParallelJobManager } from '../engine/parallelization/job_manager.js';
import { useShallow } from 'zustand/react/shallow';

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
