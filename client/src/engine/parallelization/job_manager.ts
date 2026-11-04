import _ from 'lodash';
import { newId } from '../../util/id';
import {
  ParallelJobCancellationError,
  UNCONSTRAINED_PARALLELISM_GROUP,
  type INewParallelJob,
  type IParallelJob,
  type ParallelJobPreQueueMiddleware,
} from './job_manager_types';

// Supports jobs with limited parallelism per parallelism group, and exclusive parallelism groups
class ParallelJobManager {
  private readonly jobsChangedObservers: (() => void)[] = [];
  private readonly preQueueMiddlewares: ParallelJobPreQueueMiddleware[] = [];
  private currentJobs = new Map<string, IParallelJob<unknown>>();
  private concurrencyForGroup = new Map<string, number>([
    [UNCONSTRAINED_PARALLELISM_GROUP, Number.MAX_SAFE_INTEGER],
  ]);

  public setConcurrencyForGroup(group: string, concurrency: number) {
    this.concurrencyForGroup.set(group, concurrency);
    this.tryRunNext();
  }

  public addObserver(observer: () => void) {
    this.jobsChangedObservers.push(observer);
  }

  public addPreQueueMiddleware(middleware: ParallelJobPreQueueMiddleware) {
    this.preQueueMiddlewares.push(middleware);
  }

  public getJobs() {
    return this.currentJobs.values();
  }

  public async enqueue<TResultsType>(newJob: INewParallelJob<TResultsType>): Promise<TResultsType> {
    const parallelismGroup = newJob.parallelismGroup ?? UNCONSTRAINED_PARALLELISM_GROUP;

    if (!this.concurrencyForGroup.has(parallelismGroup)) {
      throw new Error(`No concurrency set for parallelism group ${parallelismGroup}`);
    }

    if (newJob.abortSignal?.aborted) {
      throw newJob.abortSignal.reason;
    }

    for (const middleware of this.preQueueMiddlewares) {
      middleware(newJob as INewParallelJob<unknown>);
    }

    const job = {
      ...newJob,
      parallelismGroup,
      id: newId(),
      state: 'queued',
      promiseResolvers: Promise.withResolvers<TResultsType>(),
      abortController: new AbortController(),
    } satisfies IParallelJob<TResultsType>;

    if (newJob.abortSignal) {
      newJob.abortSignal.addEventListener(
        'abort',
        () => {
          job.abortController.abort(newJob.abortSignal?.reason);
          const current = this.currentJobs.get(job.id);
          if (current?.state === 'queued') {
            this.currentJobs.delete(job.id);
            job.promiseResolvers.reject(newJob.abortSignal?.reason);
            this.notifyObservers();
          }
        },
        { once: true }
      );
    }

    this.currentJobs.set(job.id, job as IParallelJob<unknown>);
    this.notifyObservers();
    this.tryRunNext();
    return job.promiseResolvers.promise;
  }

  public cancelJobsByTag(tag: string, error: Error = new ParallelJobCancellationError()) {
    let didDelete = false;
    for (const job of this.currentJobs.values()) {
      if (job.tags?.includes(tag)) {
        if (job.state === 'queued') {
          job.promiseResolvers.reject(error);
          this.currentJobs.delete(job.id);
          didDelete = true;
        } else {
          job.abortController.abort(error);
        }
      }
    }

    if (didDelete) {
      this.notifyObservers();
    }
  }

  public async allSettledForTag(tag: string): Promise<PromiseSettledResult<unknown>[]> {
    const results: PromiseSettledResult<unknown>[] = [];
    while (true) {
      const matchingJobs = Array.from(this.currentJobs.values()).filter((j) => j.tags?.includes(tag));
      if (matchingJobs.length === 0) {
        break;
      }
      const settled = await Promise.allSettled(matchingJobs.map((j) => j.promiseResolvers.promise));
      results.push(...settled);
    }
    return results;
  }

  private notifyObservers() {
    this.jobsChangedObservers.forEach((o) => {
      try {
        o();
      } catch (err) {
        console.error('Parallel job observer threw');
        console.error(err);
      }
    });
  }

  private async run(job: IParallelJob<unknown>) {
    const newJob = {
      ...job,
      state: 'running',
    } satisfies IParallelJob<unknown>;

    this.currentJobs.set(job.id, newJob);
    this.notifyObservers();

    try {
      const result = await newJob.job(newJob.abortController.signal);
      if (newJob.abortController.signal.aborted) {
        newJob.promiseResolvers.reject(newJob.abortController.signal.reason);
      } else {
        newJob.promiseResolvers.resolve(result);
      }
    } catch (err) {
      newJob.promiseResolvers.reject(
        newJob.abortController.signal.aborted ? newJob.abortController.signal.reason : err
      );
    } finally {
      this.currentJobs.delete(newJob.id);
      this.notifyObservers();
      this.tryRunNext();
    }
  }

  private tryRunNext() {
    let currentJobs: IParallelJob<unknown>[] = [];
    let waitingJobs: IParallelJob<unknown>[] = [];
    let runningJobs: IParallelJob<unknown>[] = [];
    let runningParallelismGroups = new Set<string>();
    let runningJobsByParallelismGroup: _.Dictionary<IParallelJob<unknown>[]> = {};

    const recalculateState = () => {
      currentJobs = Array.from(this.currentJobs.values());
      waitingJobs = currentJobs.filter((j) => j.state === 'queued');
      runningJobs = currentJobs.filter((j) => j.state === 'running');
      runningParallelismGroups = new Set(runningJobs.map((j) => j.parallelismGroup));
      runningJobsByParallelismGroup = _.groupBy(runningJobs, (j) => j.parallelismGroup);
    };

    recalculateState();

    for (const job of waitingJobs) {
      const countRunningForGroup = runningJobsByParallelismGroup[job.parallelismGroup]?.length ?? 0;
      const groupHasCapacity =
        countRunningForGroup < (this.concurrencyForGroup.get(job.parallelismGroup) ?? 0);
      const groupNotExcludedLeft =
        !job.exclusiveWithParallelismGroups ||
        !job.exclusiveWithParallelismGroups.some((g) => runningParallelismGroups.has(g));
      const groupNotExcludedRight = !runningJobs.some((j) =>
        j.exclusiveWithParallelismGroups?.includes(job.parallelismGroup)
      );

      if (groupHasCapacity && groupNotExcludedLeft && groupNotExcludedRight) {
        this.run(job);
        recalculateState();
      }
    }
  }
}

export const globalParallelJobManager = new ParallelJobManager();
