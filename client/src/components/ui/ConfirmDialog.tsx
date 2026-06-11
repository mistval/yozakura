import Modal from './Modal.js';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      className="flex items-center justify-center p-4"
      zIndex={Number.MAX_SAFE_INTEGER}
    >
      <div className="bg-emphasized rounded-sm p-4 w-full max-w-xl space-y-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-secondary-strong">{message}</p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={confirmDisabled}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
