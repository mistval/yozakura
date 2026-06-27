import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog.js';

type DeleteButtonProps = {
  onConfirm: () => void | Promise<void>;
  confirmMessage: string;
  confirmTitle?: string;
  confirmLabel?: string;
  label?: string;
  disabled?: boolean;
  className?: string | undefined;
};

export default function DeleteButton({
  onConfirm,
  confirmMessage,
  confirmTitle = 'Delete',
  confirmLabel = 'Delete',
  label = 'Delete',
  disabled = false,
  className,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`flex shrink-0 items-center justify-center rounded-sm px-3 py-2 text-on-accent! hover:bg-danger-solid-hover! ${className ?? ''}`}
      >
        🗑
      </button>
      <ConfirmDialog
        open={open}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmLabel}
        confirmDisabled={busy}
        onConfirm={() => void handleConfirm()}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
