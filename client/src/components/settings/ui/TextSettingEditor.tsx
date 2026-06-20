import { type ClipboardEventHandler } from 'react';
import { useTextareaPasteWarningGate } from '../pasteWarning/useTextareaPasteWarningGate.js';
import SettingFieldLabel from './SettingFieldLabel.js';

type TextSettingEditorProps = {
  draftId?: string;
  label: string;
  htmlFor: string;
  tooltipHtml?: string | undefined;
  value: string;
  onChange: (nextValue: string) => void;
  textareaRows?: number;
  textareaClassName?: string;
  enablePasteWarning?: boolean;
  spellCheck?: boolean;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
};

export default function TextSettingEditor({
  draftId,
  label,
  htmlFor,
  tooltipHtml,
  value,
  onChange,
  textareaRows = 12,
  textareaClassName = 'rounded-input font-mono text-sm',
  enablePasteWarning = false,
  spellCheck = true,
  onPaste,
}: TextSettingEditorProps) {
  const { onPasteWithWarning, warningModal } = useTextareaPasteWarningGate({});

  return (
    <div className="space-y-1">
      <SettingFieldLabel text={label} htmlFor={htmlFor} tooltipHtml={tooltipHtml} />
      <textarea
        spellCheck={spellCheck}
        id={htmlFor}
        data-draft-id={draftId}
        rows={textareaRows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={
          onPaste ??
          (enablePasteWarning
            ? (event) =>
                onPasteWithWarning(event, {
                  value,
                  applyValue: onChange,
                })
            : undefined)
        }
        className={textareaClassName}
      />
      {enablePasteWarning && warningModal}
    </div>
  );
}
