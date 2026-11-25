import { useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { ObjectEditorSession } from '../../engine/object_editor/object_editor_delegates.js';
import { ParallelJobCancellationError } from '../../engine/parallelization/job_manager_types.js';
import { getErrorMessage } from '../../errors/error_util.js';
import ChatView, { type ChatViewMessage } from '../chat/ChatView.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import { ObjectEditorPatchDisplay } from './ObjectEditorPatchDisplay.js';

const JSON_PATCH_TAG_PATTERN = /<json_patch/i;

function splitStreamingMessage(streamingMessage: string): {
  visibleText: string;
  hasPatchStarted: boolean;
} {
  const match = JSON_PATCH_TAG_PATTERN.exec(streamingMessage);
  if (!match) {
    return {
      visibleText: streamingMessage,
      hasPatchStarted: false,
    };
  }

  return {
    visibleText: streamingMessage.slice(0, match.index).trimEnd(),
    hasPatchStarted: true,
  };
}

type ObjectEditorChatPaneProps = {
  session: ObjectEditorSession;
  disabled?: boolean | undefined;
  className?: string | undefined;
  onError?: ((message: string | undefined) => void) | undefined;
};

export function ObjectEditorChatPane({
  session,
  disabled = false,
  className = '',
  onError,
}: ObjectEditorChatPaneProps) {
  const history = session.useState((state) => state.history);
  const pendingTurn = session.useState((state) => state.pendingTurn);
  const invalidManualEdit = session.useState((state) => state.invalidManualEdit);

  const [draft, setDraft] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [revertTargetIndex, setRevertTargetIndex] = useState<number | undefined>(undefined);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const performRevert = async (index: number) => {
    if (disabled || pendingTurn || isReverting) {
      return;
    }

    setIsReverting(true);
    onError?.(undefined);
    try {
      const revertedPrompt = await session.revertFromIndex(index);
      if (revertedPrompt && !draftRef.current.trim()) {
        setDraft(revertedPrompt);
      }
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setIsReverting(false);
    }
  };

  const handleRevertClick = (index: number) => {
    if (index < history.length - 1) {
      setRevertTargetIndex(index);
      return;
    }
    void performRevert(index);
  };

  const handleSend = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || disabled || pendingTurn || invalidManualEdit) {
      return;
    }

    onError?.(undefined);
    try {
      await session.runUserMessage(trimmed);
    } catch (error) {
      if (error instanceof ParallelJobCancellationError) {
        if (!draftRef.current.trim()) {
          setDraft(trimmed);
        }
        return;
      }
      onError?.(getErrorMessage(error));
    }
  };

  const handleResetChat = () => {
    if (disabled || pendingTurn) {
      return;
    }
    if (history.length > 0) {
      setConfirmResetOpen(true);
      return;
    }
    session.resetConversation();
  };

  const chatMessages = useMemo<ChatViewMessage[]>(() => {
    const result: ChatViewMessage[] = [];

    history.forEach((entry, index) => {
      if (entry.source === 'manual') {
        result.push({
          id: entry.id,
          speakerName: 'Manual Edit',
          content: entry.agentMessage,
          customContent: (
            <div className="rounded-sm border border-border-default bg-surface-subtle p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                  Manual Edit
                </span>
                {entry.canRevert && (
                  <button
                    type="button"
                    disabled={disabled || Boolean(pendingTurn) || isReverting}
                    onClick={() => handleRevertClick(index)}
                    className="px-2 py-0.5 text-xs"
                  >
                    ↻ Revert
                  </button>
                )}
              </div>
              <div className="text-sm text-secondary">{entry.agentMessage}</div>
              <ObjectEditorPatchDisplay entry={entry} />
            </div>
          ),
        });
        return;
      }

      result.push({
        id: `${entry.id}:user`,
        speakerName: 'You',
        content: entry.userMessage,
        customContent: (
          <div className="rounded-sm border border-border-default bg-surface-subtle p-2.5 space-y-1">
            <div className="text-xs font-semibold text-secondary">You</div>
            <div className="text-sm whitespace-pre-wrap wrap-break-word text-primary">
              {entry.userMessage}
            </div>
          </div>
        ),
      });

      result.push({
        id: `${entry.id}:ai`,
        speakerName: 'AI Editor',
        content: entry.agentMessage,
        customContent: (
          <div className="rounded-sm border border-border-default bg-emphasized p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-secondary">AI Editor</span>
              {entry.canRevert && (
                <button
                  type="button"
                  disabled={disabled || Boolean(pendingTurn) || isReverting}
                  onClick={() => handleRevertClick(index)}
                  className="px-2 py-0.5 text-xs"
                >
                  ↻ Revert
                </button>
              )}
            </div>
            {entry.agentMessage && (
              <div className="text-sm leading-relaxed wrap-break-word text-primary [&>p+p]:mt-2">
                <Markdown>{entry.agentMessage}</Markdown>
              </div>
            )}
            <ObjectEditorPatchDisplay entry={entry} />
          </div>
        ),
      });
    });

    if (pendingTurn) {
      const streamingPreview = splitStreamingMessage(pendingTurn.streamingMessage);
      result.push({
        id: 'pending:user',
        speakerName: 'You',
        content: pendingTurn.userMessage,
        customContent: (
          <div className="rounded-sm border border-border-default bg-surface-subtle p-2.5 space-y-1">
            <div className="text-xs font-semibold text-secondary">You</div>
            <div className="text-sm whitespace-pre-wrap wrap-break-word text-primary">
              {pendingTurn.userMessage}
            </div>
          </div>
        ),
      });

      result.push({
        id: 'pending:ai',
        speakerName: 'AI Editor',
        content: pendingTurn.streamingMessage,
        customContent: (
          <div className="rounded-sm border border-border-default bg-emphasized p-2.5 space-y-2">
            <div className="text-xs font-semibold text-secondary">AI Editor</div>
            {streamingPreview.visibleText && (
              <div className="text-sm leading-relaxed wrap-break-word text-primary [&>p+p]:mt-2">
                <Markdown>{streamingPreview.visibleText}</Markdown>
              </div>
            )}
            {streamingPreview.hasPatchStarted ? (
              <div className="text-sm text-muted italic">Generating patch...</div>
            ) : !streamingPreview.visibleText ? (
              <div className="text-sm text-muted italic">Thinking...</div>
            ) : undefined}
          </div>
        ),
      });
    }

    return result;
  }, [history, pendingTurn, disabled, isReverting]);

  const inputLocked = disabled || Boolean(invalidManualEdit);
  const subsequentRevertCount =
    revertTargetIndex !== undefined ? Math.max(0, history.length - 1 - revertTargetIndex) : 0;

  return (
    <div className={`flex min-h-0 flex-col ${className}`.trim()}>
      <ChatView
        messages={chatMessages}
        isEmpty={history.length === 0 && !pendingTurn}
        className="flex min-h-0 flex-1 flex-col gap-2"
        messageListClassName="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border-default bg-inset p-3"
        messageRowClassName="relative group text-left"
        emptyState={
          <div className="py-6 text-center text-sm text-muted">
            Ask questions about this object or describe edits you&apos;d like me to make.
          </div>
        }
        messageActionsEnabled={!disabled && !pendingTurn}
        canLongPressMessage={!disabled && !pendingTurn}
        onSendMessage={(message) => void handleSend(message)}
        inputDraft={draft}
        onInputDraftChange={setDraft}
        inputDisabled={inputLocked}
        canSendMessage={!inputLocked && !pendingTurn}
        inputPlaceholder={
          invalidManualEdit
            ? 'Resolve invalid manual JSON before sending a message...'
            : 'Describe edits or ask a question (Enter to send, Shift+Enter for newline)...'
        }
        showStopButton={Boolean(pendingTurn)}
        onStopGeneration={() => session.cancelPendingTurn()}
        extraInputControls={
          <button
            type="button"
            disabled={disabled || Boolean(pendingTurn) || history.length === 0}
            onClick={handleResetChat}
            className="px-3 py-1 text-xs shrink-0"
          >
            Reset Chat
          </button>
        }
      />

      <ConfirmDialog
        open={revertTargetIndex !== undefined}
        title="Revert Earlier Edit"
        message={`Reverting this edit will also undo ${subsequentRevertCount} subsequent change${subsequentRevertCount === 1 ? '' : 's'}. Continue?`}
        confirmLabel="Revert"
        confirmDisabled={isReverting}
        onConfirm={() => {
          const targetIndex = revertTargetIndex;
          setRevertTargetIndex(undefined);
          if (targetIndex !== undefined) {
            void performRevert(targetIndex);
          }
        }}
        onClose={() => setRevertTargetIndex(undefined)}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset Chat"
        message="Clear the conversation history? Your current object edits will be kept."
        confirmLabel="Reset Chat"
        onConfirm={() => {
          setConfirmResetOpen(false);
          session.resetConversation();
        }}
        onClose={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
