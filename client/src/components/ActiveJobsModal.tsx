import RoutedModalFrame from './ui/RoutedModalFrame.js';
import { useModalQueryParam } from '../hooks/useModalQueryParam.js';
import { cancelParallelJob } from '../state/chat_state.js';
import { useParallelJobStore } from '../state/parallel_job_manager_store.js';

export const ACTIVE_JOBS_MODAL_QUERY_PARAM = 'activejobs';

export default function ActiveJobsModal() {
  const { open, closeModal } = useModalQueryParam(ACTIVE_JOBS_MODAL_QUERY_PARAM);
  const jobs = useParallelJobStore((s) => s.jobs);

  if (!open) {
    return undefined;
  }

  return (
    <RoutedModalFrame
      queryParam={ACTIVE_JOBS_MODAL_QUERY_PARAM}
      onClose={closeModal}
      maxWidthClassName="max-w-2xl"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Active Jobs</h3>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-subtle text-secondary border border-border-default">
          {jobs.length}
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="text-sm text-secondary py-4">No active jobs.</div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border-default bg-inset"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{job.name}</span>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold ${
                      job.state === 'running'
                        ? 'bg-success-bg text-success-text border border-success-border'
                        : 'bg-surface-subtle text-secondary border border-border-default'
                    }`}
                  >
                    {job.state}
                  </span>
                </div>
                <div className="text-xs text-secondary truncate">
                  Group: <span className="font-mono">{job.parallelismGroup}</span>
                  {job.tags && job.tags.length > 0 && (
                    <span className="ml-2 font-mono">Tags: {job.tags.join(', ')}</span>
                  )}
                </div>
              </div>

              <button type="button" onClick={() => cancelParallelJob(job.id)} className="shrink-0 text-xs">
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </RoutedModalFrame>
  );
}
