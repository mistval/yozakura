import { useState } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { ChatJobTags, useChatJobs, useIsChatFinalizing } from '../../state/chat_state.js';

export default function ChatTopBarStatus() {
  const [showWorkingPopover, setShowWorkingPopover] = useState(false);

  const chatJobs = useChatJobs().filter((job) => !job.tags?.includes(ChatJobTags.minor));
  const isFinalizingChat = useIsChatFinalizing();
  const singleJob = chatJobs.length === 1 ? chatJobs[0] : undefined;
  const topBarStatusText = singleJob ? singleJob.name : '';

  const { refs, floatingStyles, context } = useFloating({
    open: showWorkingPopover,
    onOpenChange: setShowWorkingPopover,
    placement: 'bottom',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  if (chatJobs.length > 1) {
    return (
      <>
        <button
          type="button"
          ref={refs.setReference}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer px-2 py-0.5 rounded border border-border-default bg-inset hover:bg-surface-hover shadow-xs"
          {...getReferenceProps()}
        >
          <span>{isFinalizingChat ? 'Generating memories...' : 'Working...'}</span>
          <span className="text-xs">{showWorkingPopover ? '▲' : '▼'}</span>
        </button>

        {showWorkingPopover && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={{ ...floatingStyles, zIndex: Number.MAX_SAFE_INTEGER }}
              className="min-w-64 max-w-[calc(100vw-24px)] p-3 rounded-md shadow-xl border border-border-default bg-inset text-primary text-sm space-y-2"
              {...getFloatingProps()}
            >
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
          </FloatingPortal>
        )}
      </>
    );
  }

  if (topBarStatusText) {
    return <div className="text-sm text-secondary truncate max-w-full">{topBarStatusText}</div>;
  }

  return null;
}
