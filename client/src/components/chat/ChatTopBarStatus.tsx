import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatJobs, useIsGeneratingMemories } from '../../state/chat_state.js';
import { useActiveChatParticipants, useTurnMachineStore } from '../../state/turn_machine_store.js';
import { useUserCharacter } from '../../state/scenario_character_store.js';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store.js';
import { useSettingsStore } from '../../state/settings_store.js';
import type { Character } from '../../engine/types.js';

export default function ChatTopBarStatus() {
  const [showWorkingPopover, setShowWorkingPopover] = useState(false);
  const workingPopoverRef = useRef<HTMLDivElement | null>(null);

  const chatJobs = useChatJobs();
  const isGeneratingMemories = useIsGeneratingMemories();
  const transcript = useTurnMachineStore((state) => state.transcript);
  const participants = useActiveChatParticipants();
  const userCharacter = useUserCharacter();
  const userRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.userRequestedPhaseTransition
  );

  const npcChatEndMode = useSettingsStore((state) => state.npcChatEndMode);
  const intelligentChatEndMaxLength = useSettingsStore((state) => state.intelligentChatEndMaxLength);
  const intelligentChatEndGroupMaxLength = useSettingsStore(
    (state) => state.intelligentChatEndGroupMaxLength
  );
  const richNpcMessageCount = useSettingsStore((state) => state.richNpcMessageCount);
  const groupChatMessageLimit = useSettingsStore((state) => state.groupChatMessageLimit);

  const runningChatJobs = chatJobs.filter((j) => j.state === 'running');
  const singleRunningJob = runningChatJobs.length === 1 ? runningChatJobs[0] : undefined;
  const hasMultipleRunningJobs = runningChatJobs.length > 1;

  const isPaused = userRequestedPhaseTransition === 'paused';
  const includesUser = useMemo(
    () => (userCharacter ? participants.some((p: Character) => p.id === userCharacter.id) : false),
    [participants, userCharacter]
  );

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

    let messageLimit: number | undefined;

    if (!includesUser) {
      if (npcChatEndMode === 'intelligent') {
        messageLimit =
          participants.length > 2 ? intelligentChatEndGroupMaxLength : intelligentChatEndMaxLength;
      } else if (participants.length <= 2) {
        messageLimit = richNpcMessageCount * 2;
      } else {
        messageLimit = groupChatMessageLimit;
      }
    }

    if (!(includesUser || isPaused)) {
      return `NPC-only chat in progress (${transcript?.countCharacterChatMessages()}/${messageLimit || 10} messages).`;
    }

    return '';
  }, [
    singleRunningJob,
    includesUser,
    isPaused,
    npcChatEndMode,
    participants.length,
    intelligentChatEndGroupMaxLength,
    intelligentChatEndMaxLength,
    richNpcMessageCount,
    groupChatMessageLimit,
    transcript,
  ]);

  if (hasMultipleRunningJobs) {
    return (
      <div className="relative" ref={workingPopoverRef}>
        <button
          type="button"
          onClick={() => setShowWorkingPopover((prev) => !prev)}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer px-2 py-0.5 rounded border border-border-default bg-inset hover:bg-surface-hover shadow-xs"
        >
          <span>{isGeneratingMemories ? 'Generating memories...' : 'Working...'}</span>
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
