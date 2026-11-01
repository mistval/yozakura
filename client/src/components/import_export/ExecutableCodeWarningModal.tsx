import Modal from '../ui/Modal.js';
import type { ExecutableCodeItem } from './executableCodeDetection.js';

export type ExecutableCodeWarningModalProps = {
  open: boolean;
  items: ExecutableCodeItem[];
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ExecutableCodeWarningModal({
  open,
  items,
  onConfirm,
  onCancel,
}: ExecutableCodeWarningModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeOnBackdropClick={false}
      className="flex items-center justify-center p-4"
      zIndex={70}
    >
      <div className="bg-emphasized rounded-sm border border-danger-border p-6 w-full max-w-xl max-h-[85vh] flex flex-col space-y-4 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border-default pb-3">
          <span className="text-2xl" role="img" aria-label="warning">
            ⚠️
          </span>
          <div>
            <h2 className="text-lg font-semibold text-danger-text">Security Warning: Executable Code Detected</h2>
            <p className="text-xs text-muted">This export archive contains custom scripts that execute in your browser.</p>
          </div>
        </div>

        <div className="p-3.5 bg-danger-bg border border-danger-border rounded text-sm text-danger-text space-y-2">
          <div className="font-semibold text-sm">Why is this dangerous?</div>
          <p className="text-xs leading-relaxed">
            The selected items contain custom JavaScript code (prompt template output parsers). When prompt chains are used, these scripts are executed directly in your browser with full application privileges.
          </p>
          <ul className="text-xs list-disc list-inside space-y-1">
            <li>
              <strong>Credential Theft:</strong> Malicious scripts can access and exfiltrate your stored LLM API keys (OpenAI, Anthropic, OpenRouter, Gemini, etc.).
            </li>
            <li>
              <strong>Private Data Exposure:</strong> Scripts have unrestricted access to your local database, including private chats, character definitions, uploaded images, and memories.
            </li>
            <li>
              <strong>Unauthorized Actions:</strong> Arbitrary code can silently make background network requests or modify and corrupt your local data.
            </li>
          </ul>
          <p className="text-xs font-medium pt-1">
            Only proceed if you know and completely trust the source that created this export archive.
          </p>
        </div>

        {items.length > 0 && (
          <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
            <div className="text-xs font-medium text-secondary">
              Items with executable code ({items.length}):
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-surface-soft border border-border-default rounded">
              {items.map((item) => (
                <div
                  key={`${item.groupId}:${item.chainId}`}
                  className="flex items-center justify-between text-xs py-1 px-2 bg-surface rounded border border-border-default/60"
                >
                  <div className="truncate pr-2">
                    <span className="font-medium text-primary">{item.title}</span>
                    <span className="text-muted ml-2">({item.groupId})</span>
                  </div>
                  <span className="text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap bg-warning-bg text-warning-text border-warning-border">
                    Executable Code
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-default">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-secondary hover:text-primary rounded border border-border-default hover:bg-surface-hover cursor-pointer"
          >
            Cancel Import
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium rounded bg-danger-solid text-on-accent hover:bg-danger-solid-hover cursor-pointer"
          >
            I Understand the Risks, Import Code
          </button>
        </div>
      </div>
    </Modal>
  );
}

