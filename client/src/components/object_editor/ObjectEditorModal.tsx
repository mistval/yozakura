import { useEffect, useRef, useState } from 'react';
import {
  canInspectObjectEditorTarget,
  createObjectEditorSession,
  getObjectEditorTargetKey,
  inspectObjectEditorTarget,
  type ObjectEditorTarget,
} from '../../engine/object_editor/object_editor_delegates.js';
import { getErrorMessage } from '../../errors/error_util.js';
import {
  DEFERRED_SYNC_OWNERS,
  useHasPendingDeferredSyncMutations,
} from '../../state/ephemeral_state_helper.js';
import { useActiveScenarioMap } from '../../state/scenario_store.js';
import { useGlobalCharacterEditor } from '../character_editor_modal/GlobalCharacterEditorContext.js';
import { useCharacterOverview } from '../character_overview/CharacterOverviewContext.js';
import { useMapModal } from '../MapModalContext.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import { ObjectEditorChatPane } from './ObjectEditorChatPane.js';
import { useObjectEditor } from './ObjectEditorContext.js';
import { ObjectEditorRawJsonSection } from './ObjectEditorRawJsonSection.js';

type InitStatus = 'initializing' | 'ready' | 'error';

function ObjectEditorModalContent({
  target,
  hasOverlayAbove,
  closeObjectEditor,
}: {
  target: ObjectEditorTarget;
  hasOverlayAbove: boolean;
  closeObjectEditor: () => void;
}) {
  const [session] = useState(() => createObjectEditorSession(target));
  const editorState = session.useState((state) => state);
  const displayName = session.useDisplayName();
  const hasPendingDeferredMutations = useHasPendingDeferredSyncMutations(DEFERRED_SYNC_OWNERS.objectEditor);
  const activeScenarioMap = useActiveScenarioMap();
  const { showMap } = useMapModal();
  const { showCharacterOverview } = useCharacterOverview();
  const { showCharacterEditor } = useGlobalCharacterEditor();

  const [initStatus, setInitStatus] = useState<InitStatus>('initializing');
  const [initError, setInitError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const initializedRef = useRef(false);
  const resolvedRef = useRef(false);
  const hadModalAboveRef = useRef(false);

  useEffect(() => {
    if (hasOverlayAbove) {
      hadModalAboveRef.current = true;
      return;
    }
    if (hadModalAboveRef.current) {
      hadModalAboveRef.current = false;
      if (initStatus === 'ready' && !session.getState().pendingTurn) {
        void session.notifyPossibleManualChange();
      }
    }
  }, [hasOverlayAbove, initStatus, session]);

  useEffect(() => {
    let cancelled = false;

    const startup = async () => {
      try {
        await session.initialize();
        if (cancelled) {
          await session.discardChanges();
          return;
        }
        initializedRef.current = true;
        setInitStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setInitError(getErrorMessage(error));
        setInitStatus('error');
      }
    };

    void startup();

    return () => {
      cancelled = true;
      session.cancelPendingTurn();
      if (initializedRef.current && !resolvedRef.current) {
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
      if (initializedRef.current) {
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
      initStatus !== 'ready' ||
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

  const hasUnsavedChanges =
    editorState.isDirty || (target.kind !== 'character_draft' && hasPendingDeferredMutations);

  const handleRequestClose = () => {
    if (isSubmitting) {
      return;
    }
    if (hasUnsavedChanges) {
      setConfirmDiscardOpen(true);
      return;
    }
    void handleDiscard();
  };

  const errorBannerText = initError ?? actionError;
  const acceptDisabled =
    initStatus !== 'ready' ||
    Boolean(editorState.pendingTurn) ||
    Boolean(editorState.invalidManualEdit) ||
    isSubmitting;
  const canInspect = canInspectObjectEditorTarget(target);

  const handleInspect = () => {
    inspectObjectEditorTarget(target, {
      activeScenarioMapId: activeScenarioMap?.id,
      showMap,
      showCharacterOverview,
      showCharacterEditor,
    });
  };

  return (
    <RoutedModalFrame
      queryParam="objecteditor"
      onClose={handleRequestClose}
      maxWidthClassName="max-w-5xl"
      panelClassName="flex h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] flex-col overflow-hidden"
      headerActions={
        <>
          <span className="px-2 py-1 font-medium text-sm text-primary truncate max-w-xs sm:max-w-md">
            {session.targetTitle}: {displayName}
          </span>
          {canInspect && (
            <button
              type="button"
              onClick={handleInspect}
              disabled={initStatus !== 'ready' || Boolean(editorState.pendingTurn)}
            >
              🔍 Inspect
            </button>
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-2">
        {errorBannerText && <div className="error-card shrink-0">{errorBannerText}</div>}

        <ObjectEditorRawJsonSection
          session={session}
          disabled={initStatus !== 'ready'}
          onError={setActionError}
        />

        <ObjectEditorChatPane
          session={session}
          disabled={initStatus !== 'ready'}
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
          ) : hasUnsavedChanges ? (
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
  const { open, target, hasOverlayAbove, closeObjectEditor } = useObjectEditor();
  if (!open || !target) {
    return undefined;
  }

  return (
    <ObjectEditorModalContent
      key={getObjectEditorTargetKey(target)}
      target={target}
      hasOverlayAbove={hasOverlayAbove}
      closeObjectEditor={closeObjectEditor}
    />
  );
}

export default ObjectEditorModal;
