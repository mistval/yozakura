import { useEffect, useMemo, useState } from 'react';
import type { ObjectEditorSession } from '../../engine/object_editor/object_editor_delegates.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { useCopyToClipboard } from '../../hooks/use_copy_to_clipboard.js';
import AIAssistantInstructionsButton from '../ui/AIAssistantInstructionsButton.js';
import { SpoilerSection } from '../ui/SpoilerSection.js';

type ObjectEditorRawJsonSectionProps = {
  session: ObjectEditorSession;
  disabled?: boolean | undefined;
  onError?: ((message: string | undefined) => void) | undefined;
};

export function ObjectEditorRawJsonSection({
  session,
  disabled = false,
  onError,
}: ObjectEditorRawJsonSectionProps) {
  const currentObject = session.useState((state) => state.currentObject);
  const invalidManualEdit = session.useState((state) => state.invalidManualEdit);
  const pendingTurn = session.useState((state) => state.pendingTurn);
  const displayName = session.useDisplayName();

  const formattedCurrentObject = useMemo(
    () => (currentObject === undefined ? '' : JSON.stringify(currentObject, null, 2)),
    [currentObject]
  );

  const syncedValue = invalidManualEdit?.rawJson ?? formattedCurrentObject;
  const [draft, setDraft] = useState(syncedValue);
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    setDraft(syncedValue);
  }, [syncedValue]);

  const isLockedOrBusy = disabled || Boolean(pendingTurn);

  const handleBlur = () => {
    if (isLockedOrBusy || currentObject === undefined) {
      return;
    }

    onError?.(undefined);
    void session.applyManualJsonEdit(draft).catch((error: unknown) => {
      onError?.(getErrorMessage(error));
    });
  };

  const handleRevertInvalid = () => {
    if (isLockedOrBusy) {
      return;
    }

    onError?.(undefined);
    void session.revertLatest().catch((error: unknown) => {
      onError?.(getErrorMessage(error));
    });
  };

  return (
    <SpoilerSection title="Raw JSON" defaultRevealed={false} className="shrink-0">
      <div className="space-y-3">
        {currentObject !== undefined && (
          <AIAssistantInstructionsButton
            title={`${session.targetTitle}: ${displayName} — AI Assistant Instructions`}
            instructions="Copy these instructions into an external AI assistant, describe the edits you want, and paste the resulting complete updated JSON back into the Raw JSON box below."
            isDirty={false}
            fileNameBase={session.fileNameBase}
            getDocumentation={() => session.buildExternalAiInstructions()}
          />
        )}

        {invalidManualEdit && (
          <div className="error-card flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word">
              {invalidManualEdit.error}
            </div>
            <button
              type="button"
              disabled={isLockedOrBusy}
              onClick={handleRevertInvalid}
              className="shrink-0 px-2.5 py-1 text-xs"
            >
              Revert Invalid Edit
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            Edit JSON directly and click outside (blur) to apply or validate.
          </span>
          <button
            type="button"
            disabled={!draft}
            onClick={() => void copy(draft)}
            className="px-2.5 py-1 text-xs"
          >
            {copied ? 'Copied ✓' : 'Copy JSON'}
          </button>
        </div>

        <textarea
          rows={12}
          spellCheck={false}
          value={draft}
          disabled={isLockedOrBusy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handleBlur}
          className="w-full rounded-sm border border-border-default bg-inset p-2 font-mono text-xs"
        />
      </div>
    </SpoilerSection>
  );
}
