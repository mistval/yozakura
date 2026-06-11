import { useCallback, useState, type ClipboardEvent } from 'react';
import Modal from '../../ui/Modal.js';
import { assertNonNullish } from '../../../errors/application_error.js';
import { useSettingsStore } from '../../../state/settings_store.js';

const DEFAULT_WARNING_TITLE = 'Paste From Untrusted Source?';
const DEFAULT_WARNING_MESSAGE =
  'Templates, parsers, and rules can execute arbitrary JavaScript code. Only paste from sources you trust. Malicious input can steal your API keys, spy on you, or perform other malign behavior. Are you sure you want to paste?';

type PasteTargetBinding = {
  value: string;
  applyValue: (nextValue: string) => void;
};

type PendingPaste = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  valueAtPaste: string;
  applyValue: (nextValue: string) => void;
  target: HTMLTextAreaElement | HTMLInputElement;
};

type UseTextareaPasteWarningGateOptions = {
  warningTitle?: string;
  warningMessage?: string;
};

function insertAtSelection(
  value: string,
  text: string,
  selectionStart: number,
  selectionEnd: number
): { nextValue: string; nextCursorPosition: number } {
  const nextValue = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  return {
    nextValue,
    nextCursorPosition: selectionStart + text.length,
  };
}

export function useTextareaPasteWarningGate({
  warningTitle = DEFAULT_WARNING_TITLE,
  warningMessage = DEFAULT_WARNING_MESSAGE,
}: UseTextareaPasteWarningGateOptions) {
  const showTemplatePasteSafetyWarning = useSettingsStore((s) => s.showTemplatePasteSafetyWarning);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | undefined>(undefined);
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false);

  const closeWarning = useCallback(() => {
    setPendingPaste(undefined);
    setDontShowAgainChecked(false);
  }, []);

  const onPasteWithWarning = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, targetBinding: PasteTargetBinding) => {
      if (!showTemplatePasteSafetyWarning) {
        return;
      }

      const pastedText = event.clipboardData.getData('text/plain');
      if (!pastedText) {
        return;
      }

      event.preventDefault();
      const target = event.currentTarget;
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;

      setPendingPaste({
        text: pastedText,
        selectionStart,
        selectionEnd,
        valueAtPaste: targetBinding.value,
        applyValue: targetBinding.applyValue,
        target,
      });
      setDontShowAgainChecked(false);
    },
    [showTemplatePasteSafetyWarning]
  );

  const confirmPaste = useCallback(() => {
    assertNonNullish(pendingPaste, 'No pending paste to confirm');

    const { nextValue, nextCursorPosition } = insertAtSelection(
      pendingPaste.valueAtPaste,
      pendingPaste.text,
      pendingPaste.selectionStart,
      pendingPaste.selectionEnd
    );

    pendingPaste.applyValue(nextValue);

    const target = pendingPaste.target;
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(pendingPaste.selectionStart, nextCursorPosition);
    });

    if (dontShowAgainChecked) {
      setSettings({ showTemplatePasteSafetyWarning: false });
    }

    closeWarning();
  }, [pendingPaste, dontShowAgainChecked, closeWarning]);

  const warningModal = (
    <Modal
      open={Boolean(pendingPaste)}
      onClose={closeWarning}
      className="flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl rounded-lg border p-4 space-y-3 bg-surface-soft">
        <h3 className="text-base font-semibold">{warningTitle}</h3>
        <p className="text-sm text-secondary">{warningMessage}</p>

        <label className="flex items-center gap-2 text-sm text-secondary select-none">
          <input
            className="w-4!"
            type="checkbox"
            checked={dontShowAgainChecked}
            onChange={(event) => setDontShowAgainChecked(event.target.checked)}
          />
          Don't show this warning again
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={closeWarning} className="px-3 py-1 border rounded-sm">
            Cancel
          </button>
          <button type="button" onClick={confirmPaste} className="px-3 py-1 border rounded-sm">
            Paste Anyway
          </button>
        </div>
      </div>
    </Modal>
  );

  return {
    onPasteWithWarning,
    warningModal,
  };
}
