import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatJobs, useIsChatFinalizing } from '../../state/chat_state.js';

export default function ChatTopBarStatus() {
  const [showWorkingPopover, setShowWorkingPopover] = useState(false);
  const workingPopoverRef = useRef<HTMLDivElement | null>(null);

  const chatJobs = useChatJobs();
  const isFinalizingChat = useIsChatFinalizing();
  const runningChatJobs = chatJobs.filter((j) => j.state === 'running');
  const singleRunningJob = runningChatJobs.length === 1 ? runningChatJobs[0] : undefined;
  const hasMultipleRunningJobs = runningChatJobs.length > 1;

  useEffect(() => {
    if (!showWorkingPopover) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (workingPopoverRef.current && !workingPopoverRef.current.contains(e.target as Node)) {
        setShowWorkingPopover(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowWorkingPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showWorkingPopover]);

  const topBarStatusText = useMemo(() => {
    if (singleRunningJob) {
      return singleRunningJob.name;
    }

    return '';
  }, [singleRunningJob]);

  if (hasMultipleRunningJobs) {
    return (
      <div className="relative" ref={workingPopoverRef}>
        <button
          type="button"
          onClick={() => setShowWorkingPopover((prev) => !prev)}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer px-2 py-0.5 rounded border border-border-default bg-inset hover:bg-surface-hover shadow-xs"
        >
          <span>{isFinalizingChat ? 'Generating memories...' : 'Working...'}</span>
          <span className="text-xs">{showWorkingPopover ? '▲' : '▼'}</span>
        </button>

        {showWorkingPopover && (
          <div className="absolute right-0 top-full mt-1.5 z-50 min-w-64 p-3 rounded-md shadow-xl border border-border-default bg-inset text-primary text-sm space-y-2">
            <div className="text-xs font-semibold text-secondary uppercase tracking-wider pb-1.5 border-b border-border-default flex justify-between items-center">
              <span>Active Jobs</span>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-subtle text-secondary border border-border-default">
                {chatJobs.length}
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {chatJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-3 py-0.5 text-xs">
                  <span className="truncate font-medium">{job.name}</span>
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
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (topBarStatusText) {
    return <div className="text-sm text-secondary">{topBarStatusText}</div>;
  }

  return null;
}
