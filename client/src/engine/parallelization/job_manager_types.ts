type ParallelJobState = 'queued' | 'running';

export interface INewParallelJob<TResultsType> {
  name: string;
  parallelismGroup: string;
  job: (abortSignal: AbortSignal) => Promise<TResultsType>;
  tags?: string[] | undefined;
  exclusiveWithParallelismGroups?: string[] | undefined;
}

export interface IParallelJob<TResultsType> extends INewParallelJob<TResultsType> {
  id: string;
  state: ParallelJobState;
  promiseResolvers: ReturnType<typeof Promise.withResolvers<TResultsType>>;
  abortController: AbortController;
}

export class ParallelJobCancellationError extends Error {
  constructor() {
    super('The job was canceled');
  }
}
