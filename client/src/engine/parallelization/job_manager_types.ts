export const UNCONSTRAINED_PARALLELISM_GROUP = 'unconstrained';

type ParallelJobState = 'queued' | 'running';

export interface INewParallelJob<TResultsType> {
  name: string;
  parallelismGroup?: string | undefined;
  job: (abortSignal: AbortSignal) => Promise<TResultsType>;
  tags?: readonly string[] | string[] | undefined;
  exclusiveWithParallelismGroups?: string[] | undefined;
  abortSignal?: AbortSignal | undefined;
}

export interface IParallelJob<TResultsType> extends INewParallelJob<TResultsType> {
  id: string;
  parallelismGroup: string;
  state: ParallelJobState;
  promiseResolvers: ReturnType<typeof Promise.withResolvers<TResultsType>>;
  abortController: AbortController;
}

export type ParallelJobPreQueueMiddleware = (job: INewParallelJob<unknown>) => void;

export class ParallelJobCancellationError extends Error {
  constructor(message = 'The job was canceled') {
    super(message);
    this.name = 'ParallelJobCancellationError';
  }
}
