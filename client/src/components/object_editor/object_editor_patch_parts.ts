import type {
  JsonPatchOperation,
  ObjectEditorHistoryEntry,
} from '../../engine/object_editor/object_editor.js';
import type { ChatViewMessagePart } from '../chat/ChatView.js';

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

/**
 * Converts an object editor history entry's validation error or JSON patch changes
 * into composable ChatView message parts.
 */
export function buildObjectEditorPatchParts(entry: ObjectEditorHistoryEntry<unknown>): ChatViewMessagePart[] {
  if (entry.validationError !== undefined) {
    const errorHeading = entry.source === 'ai' ? 'Failed patch' : 'Invalid manual JSON';
    const rawSpoilerTitle =
      entry.invalidRawJson !== undefined ? 'Invalid JSON input' : 'Attempted JSON patch';
    const rawPayload = entry.invalidRawJson ?? JSON.stringify(entry.objectPatch, null, 2);

    return [
      {
        type: 'error',
        title: errorHeading,
        message: entry.validationError,
      },
      {
        type: 'spoiler',
        title: rawSpoilerTitle,
        defaultRevealed: false,
        parts: [{ type: 'code', code: rawPayload }],
      },
    ];
  }

  if (entry.humanReadableChanges.length === 0) {
    return [];
  }

  const changeCount = entry.humanReadableChanges.length;
  const summaryTitle = `${changeCount} change${changeCount === 1 ? '' : 's'}`;

  const changeParts: ChatViewMessagePart[] = entry.humanReadableChanges.map((change) => {
    const opLabel = OP_LABELS[change.op];
    const showBefore = change.op !== 'add' || change.beforeValue !== undefined;
    const showAfter = change.op !== 'remove' || change.afterValue !== undefined;

    const innerParts: ChatViewMessagePart[] = [
      { type: 'text', text: change.name, tone: 'muted', size: 'xs' },
      { type: 'text', text: change.path || '/', tone: 'muted', mono: true, size: 'xs' },
    ];

    if (showBefore) {
      innerParts.push({
        type: 'code',
        label: 'Before',
        code: formatJsonValue(change.beforeValue),
      });
    }

    if (showAfter) {
      innerParts.push({
        type: 'code',
        label: 'After',
        code: formatJsonValue(change.afterValue),
      });
    }

    return {
      type: 'spoiler',
      title: `${opLabel}: ${change.name}`,
      defaultRevealed: false,
      parts: innerParts,
    };
  });

  return [
    {
      type: 'spoiler',
      title: summaryTitle,
      defaultRevealed: false,
      parts: changeParts,
    },
  ];
}
