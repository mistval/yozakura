import Modal from './ui/Modal';
import type { ChangeEvent } from 'react';

type ImagePromptModalProps = {
  open: boolean;
  prompt: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ImagePromptModal({
  open,
  prompt,
  onChange,
  onCancel,
  onConfirm,
}: ImagePromptModalProps) {
  if (!open) return undefined;

  return (
    <Modal open={open} onClose={onCancel} className="flex items-center justify-center p-4">
      <div className="bg-emphasized rounded-sm p-4 w-full max-w-xl space-y-3">
        <h3 className="font-semibold">Edit Image Prompt</h3>
        <textarea
          rows={6}
          value={prompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            Generate Image
          </button>
        </div>
      </div>
    </Modal>
  );
}
