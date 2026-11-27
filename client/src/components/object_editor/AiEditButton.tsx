import { useObjectEditor } from './ObjectEditorContext.js';

type AiEditButtonProps = {
  onClick: () => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

export function AiEditButton({ onClick, disabled = false, className }: AiEditButtonProps) {
  const { open: objectEditorOpen } = useObjectEditor();

  return (
    <button type="button" disabled={disabled || objectEditorOpen} onClick={onClick} className={className}>
      🤖 AI Edit
    </button>
  );
}
