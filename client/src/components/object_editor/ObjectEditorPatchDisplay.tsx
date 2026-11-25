import type {
  JsonPatchOperation,
  ObjectEditorHistoryEntry,
} from '../../engine/object_editor/object_editor.js';
import { SpoilerSection } from '../ui/SpoilerSection.js';

const OP_LABELS: Record<JsonPatchOperation['op'], string> = {
  add: 'Add',
  remove: 'Remove',
  replace: 'Update',
  move: 'Move',
  copy: 'Copy',
  test: 'Test',
};

function formatJsonValue(value: unknown): string {
  if (value === undefined) {
    return '(none)';
  }
  return JSON.stringify(value, null, 2);
}

type ObjectEditorPatchDisplayProps = {
  entry: ObjectEditorHistoryEntry<unknown>;
};

export function ObjectEditorPatchDisplay({ entry }: ObjectEditorPatchDisplayProps) {
  if (entry.validationError !== undefined) {
    const errorHeading = entry.source === 'ai' ? 'Failed patch' : 'Invalid manual JSON';
    const rawSpoilerTitle =
      entry.invalidRawJson !== undefined ? 'Invalid JSON input' : 'Attempted JSON patch';
    const rawPayload = entry.invalidRawJson ?? JSON.stringify(entry.objectPatch, null, 2);

    return (
      <div className="space-y-2">
        <div className="error-card space-y-1">
          <div className="font-semibold">{errorHeading}</div>
          <div className="whitespace-pre-wrap wrap-break-word">{entry.validationError}</div>
        </div>
        <SpoilerSection title={rawSpoilerTitle} defaultRevealed={false} className="p-2!">
          <pre className="bg-inset rounded-sm p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
            {rawPayload}
          </pre>
        </SpoilerSection>
      </div>
    );
  }

  if (entry.humanReadableChanges.length === 0) {
    return undefined;
  }

  const changeCount = entry.humanReadableChanges.length;
  const summaryTitle = `${changeCount} change${changeCount === 1 ? '' : 's'}`;

  return (
    <SpoilerSection title={summaryTitle} defaultRevealed={false} className="p-2!">
      <div className="space-y-2">
        {entry.humanReadableChanges.map((change, index) => {
          const opLabel = OP_LABELS[change.op];
          const showBefore = change.op !== 'add' || change.beforeValue !== undefined;
          const showAfter = change.op !== 'remove' || change.afterValue !== undefined;

          return (
            <SpoilerSection
              key={`${index}-${change.path}`}
              title={`${opLabel}: ${change.name}`}
              defaultRevealed={false}
              className="p-2!"
            >
              <div className="space-y-2">
                <div className="text-xs text-muted wrap-break-word">
                  <div>{change.name}</div>
                  <div className="font-mono">{change.path || '/'}</div>
                </div>
                {showBefore && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-secondary">Before</div>
                    <pre className="bg-inset rounded-sm p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                      {formatJsonValue(change.beforeValue)}
                    </pre>
                  </div>
                )}
                {showAfter && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-secondary">After</div>
                    <pre className="bg-inset rounded-sm p-2 text-xs font-mono whitespace-pre-wrap wrap-break-word">
                      {formatJsonValue(change.afterValue)}
                    </pre>
                  </div>
                )}
              </div>
            </SpoilerSection>
          );
        })}
      </div>
    </SpoilerSection>
  );
}
