import { useEffect, useRef, useState } from 'react';
import {
  createObjectEditorSession,
  type ObjectEditorTarget,
} from '../../engine/object_editor/object_editor_delegates.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { DEFERRED_SYNC_OWNERS, useActiveDeferredSyncOwner } from '../../state/ephemeral_state_helper.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import { ObjectEditorChatPane } from './ObjectEditorChatPane.js';
import { useObjectEditor } from './ObjectEditorContext.js';
import { ObjectEditorRawJsonSection } from './ObjectEditorRawJsonSection.js';

type LockStatus = 'waiting' | 'ready' | 'error';

function getObjectEditorTargetKey(target: ObjectEditorTarget): string {
  switch (target.kind) {
    case 'world_map':
      return `world_map:${target.mapId}`;
    case 'scenario_character':
      return `scenario_character:${target.characterId}`;
    case 'global_character':
      return `global_character:${target.characterId}`;
    case 'character_draft':
      return 'character_draft';
    case 'character_relationship':
      return `character_relationship:${target.fromId}:${target.toId}`;
  }
}

function formatLockOwnerName(owner: string | undefined): string {
  if (owner === DEFERRED_SYNC_OWNERS.characterMemoryGenerator) {
    return 'Character Memory Generator';
  }
  if (owner === DEFERRED_SYNC_OWNERS.objectEditor) {
    return 'another Object Editor session';
  }
  return owner || 'another background task';
}

function ObjectEditorModalContent({
  target,
  closeObjectEditor,
}: {
  target: ObjectEditorTarget;
  closeObjectEditor: () => void;
}) {
  const [session] = useState(() => createObjectEditorSession(target));
  const editorState = session.useState((state) => state);
  const displayName = session.useDisplayName();
  const activeLockOwner = useActiveDeferredSyncOwner();

  const [lockStatus, setLockStatus] = useState<LockStatus>('waiting');
  const [lockError, setLockError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const lockAcquiredRef = useRef(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    const abortController = new AbortController();

    const startup = async () => {
      try {
        await session.acquireLock(abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }
        lockAcquiredRef.current = true;
        await session.initialize();
        if (!abortController.signal.aborted) {
          setLockStatus('ready');
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        setLockError(getErrorMessage(error));
        setLockStatus('error');
      }
    };

    void startup();

    return () => {
      abortController.abort();
      session.cancelPendingTurn();
      if (lockAcquiredRef.current && !resolvedRef.current) {
        void session.discardChanges();
      }
    };
  }, [session]);

  const handleDiscard = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setActionError(undefined);
    session.cancelPendingTurn();
    resolvedRef.current = true;

    try {
      if (lockAcquiredRef.current) {
        await session.discardChanges();
      }
      closeObjectEditor();
    } catch (error) {
      resolvedRef.current = false;
      setActionError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (
      isSubmitting ||
      lockStatus !== 'ready' ||
      Boolean(editorState.pendingTurn) ||
      Boolean(editorState.invalidManualEdit)
    ) {
      return;
    }

    setIsSubmitting(true);
    setActionError(undefined);
    try {
      await session.commitChanges();
      resolvedRef.current = true;
      closeObjectEditor();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestClose = () => {
    if (isSubmitting) {
      return;
    }
    if (editorState.isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    void handleDiscard();
  };

  const errorBannerText = lockError ?? actionError;
  const acceptDisabled =
    lockStatus !== 'ready' ||
    Boolean(editorState.pendingTurn) ||
    Boolean(editorState.invalidManualEdit) ||
    isSubmitting;

  return (
    <RoutedModalFrame
      queryParam="objecteditor"
      onClose={handleRequestClose}
      maxWidthClassName="max-w-5xl"
      panelClassName="flex h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] flex-col overflow-hidden"
      headerActions={
        <span className="px-2 py-1 font-medium text-sm text-primary truncate max-w-xs sm:max-w-md">
          {session.targetTitle}: {displayName}
        </span>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-2">
        {lockStatus === 'waiting' && activeLockOwner && (
          <div className="shrink-0 rounded-sm border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
            Locked by {formatLockOwnerName(activeLockOwner)}. Waiting for lock to release...
          </div>
        )}

        {errorBannerText && <div className="error-card shrink-0">{errorBannerText}</div>}

        <ObjectEditorRawJsonSection
          session={session}
          disabled={lockStatus !== 'ready'}
          onError={setActionError}
        />

        <ObjectEditorChatPane
          session={session}
          disabled={lockStatus !== 'ready'}
          className="min-h-0 flex-1"
          onError={setActionError}
        />
      </div>

      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
        <div>
          {editorState.invalidManualEdit ? (
            <span className="text-danger-text text-sm">
              Invalid JSON — resolve or revert before accepting or chatting
            </span>
          ) : editorState.isDirty ? (
            <span className="text-warning-text text-sm">Unsaved changes</span>
          ) : (
            <span className="text-muted text-sm">No unsaved changes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" disabled={isSubmitting} onClick={() => void handleDiscard()}>
            Discard
          </button>
          <button
            type="button"
            disabled={acceptDisabled}
            onClick={() => void handleAccept()}
            className="button-emphasized"
          >
            Accept
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Unsaved changes"
        message="Discard your unsaved edits and close the Object Editor?"
        confirmLabel="Discard & Close"
        confirmDisabled={isSubmitting}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          void handleDiscard();
        }}
        onClose={() => setConfirmDiscardOpen(false)}
      />
    </RoutedModalFrame>
  );
}

export function ObjectEditorModal() {
  const { open, target, closeObjectEditor } = useObjectEditor();
  if (!open || !target) {
    return undefined;
  }

  return (
    <ObjectEditorModalContent
      key={getObjectEditorTargetKey(target)}
      target={target}
      closeObjectEditor={closeObjectEditor}
    />
  );
}

export default ObjectEditorModal;
