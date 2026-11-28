import { useMemo, useRef, useState } from 'react';
import type { ObjectEditorSession } from '../../engine/object_editor/object_editor_delegates.js';
import { ParallelJobCancellationError } from '../../engine/parallelization/job_manager_types.js';
import { getErrorMessage } from '../../errors/error_util.js';
import ChatView, { type ChatViewMessage, type ChatViewMessagePart } from '../chat/ChatView.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import { buildObjectEditorPatchParts } from './object_editor_patch_parts.js';

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
    const revertDisabled = disabled || Boolean(pendingTurn) || isReverting;

    history.forEach((entry, index) => {
      if (entry.source === 'manual') {
        result.push({
          id: entry.id,
          speakerName: 'Manual Edit',
          speakerStyle: 'uppercase',
          tone: 'subtle',
          parts: [
            { type: 'text', text: entry.agentMessage, tone: 'secondary' },
            ...buildObjectEditorPatchParts(entry),
          ],
          actions: entry.canRevert
            ? [
                {
                  id: 'revert',
                  label: 'Revert',
                  icon: '↻',
                  placement: 'header',
                  disabled: revertDisabled,
                  onClick: () => handleRevertClick(index),
                },
              ]
            : undefined,
        });
        return;
      }

      result.push({
        id: `${entry.id}:user`,
        speakerName: 'You',
        tone: 'subtle',
        parts: [{ type: 'text', text: entry.userMessage }],
      });

      const aiParts: ChatViewMessagePart[] = [];
      if (entry.agentMessage) {
        aiParts.push({ type: 'markdown', text: entry.agentMessage });
      }
      aiParts.push(...buildObjectEditorPatchParts(entry));

      result.push({
        id: `${entry.id}:ai`,
        speakerName: 'Assistant',
        tone: 'emphasized',
        parts: aiParts,
        actions: entry.canRevert
          ? [
              {
                id: 'revert',
                label: 'Revert',
                icon: '↻',
                placement: 'header',
                disabled: revertDisabled,
                onClick: () => handleRevertClick(index),
              },
            ]
          : undefined,
      });
    });

    if (pendingTurn) {
      const streamingPreview = splitStreamingMessage(pendingTurn.streamingMessage);
      result.push({
        id: 'pending:user',
        speakerName: 'You',
        tone: 'subtle',
        parts: [{ type: 'text', text: pendingTurn.userMessage }],
      });

      const pendingParts: ChatViewMessagePart[] = [];
      if (streamingPreview.visibleText) {
        pendingParts.push({ type: 'markdown', text: streamingPreview.visibleText });
      }
      if (streamingPreview.hasPatchStarted) {
        pendingParts.push({ type: 'text', text: 'Generating patch...', tone: 'muted', italic: true });
      } else if (!streamingPreview.visibleText) {
        pendingParts.push({ type: 'text', text: 'Thinking...', tone: 'muted', italic: true });
      }

      result.push({
        id: 'pending:ai',
        speakerName: 'Assistant',
        tone: 'emphasized',
        parts: pendingParts,
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
        containerStyle="embedded"
        messageListStyle="inset"
        messageStyle="cards"
        emptyState={
          <div className="py-6 text-center text-sm text-muted">
            Ask questions about this object or describe edits you&apos;d like me to make.
          </div>
        }
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
