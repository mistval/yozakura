import { useObjectEditor } from './ObjectEditorContext.js';

type AiEditButtonProps = {
  onClick: () => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

export function AiEditButton({ onClick, disabled = false, className }: AiEditButtonProps) {
  const { open: objectEditorOpen, canOpenObjectEditor } = useObjectEditor();

  return (
    <button
      type="button"
      disabled={disabled || objectEditorOpen || !canOpenObjectEditor}
      title={!canOpenObjectEditor ? 'Pause the chat or wait for your turn to use AI Edit' : undefined}
      onClick={onClick}
      className={className}
    >
      🤖
    </button>
  );
}
