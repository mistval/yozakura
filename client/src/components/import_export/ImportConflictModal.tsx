import { useState } from 'react';
import Modal from '../ui/Modal.js';
import type { ConflictAction, EntityConflict } from './importConflictResolver.js';

type ImportConflictModalProps = {
  open: boolean;
  conflicts: EntityConflict[];
  onConfirm: (resolutionMap: Record<string, ConflictAction>) => void;
  onCancel: () => void;
};

export default function ImportConflictModal({
  open,
  conflicts,
  onConfirm,
  onCancel,
}: ImportConflictModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, ConflictAction>>(() => {
    return Object.fromEntries(conflicts.map((c) => [c.id, c.action]));
  });

  const handleChange = (id: string, action: ConflictAction) => {
    setResolutions((prev) => ({ ...prev, [id]: action }));
  };

  const handleSetAll = (action: ConflictAction) => {
    setResolutions(Object.fromEntries(conflicts.map((c) => [c.id, action])));
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeOnBackdropClick={false}
      className="flex items-center justify-center p-4"
      zIndex={70}
    >
      <div className="bg-emphasized rounded-sm border border-border-default p-6 w-full max-w-xl max-h-[85vh] flex flex-col space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <h2 className="text-lg font-semibold text-primary">Resolve Entity Conflicts</h2>
        </div>

        <p className="text-sm text-secondary">
          The following global items already exist in your local library. Please choose how each conflict
          should be handled:
        </p>

        <div className="flex items-center gap-2 pb-1 text-xs">
          <span className="text-muted">Set all to:</span>
          <button
            type="button"
            onClick={() => handleSetAll('skip')}
            className="px-2 py-1 rounded bg-surface hover:bg-surface-elevated text-secondary text-xs"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => handleSetAll('overwrite')}
            className="px-2 py-1 rounded bg-surface hover:bg-surface-elevated text-secondary text-xs"
          >
            Overwrite
          </button>
          <button
            type="button"
            onClick={() => handleSetAll('copy')}
            className="px-2 py-1 rounded bg-surface hover:bg-surface-elevated text-secondary text-xs"
          >
            Make a Copy
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-80">
          {conflicts.map((conflict) => {
            const currentAction = resolutions[conflict.id] ?? 'skip';
            return (
              <div
                key={conflict.id}
                className="bg-surface/60 border border-border-default/60 rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="text-sm font-medium text-primary">{conflict.name}</div>
                  <div className="text-xs text-muted">
                    {conflict.kind === 'map' ? 'Global Map' : 'Global Character'} (ID: {conflict.id})
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name={`action-${conflict.id}`}
                      checked={currentAction === 'skip'}
                      onChange={() => handleChange(conflict.id, 'skip')}
                      className="text-accent"
                    />
                    <span className="text-secondary">Skip</span>
                  </label>

                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name={`action-${conflict.id}`}
                      checked={currentAction === 'overwrite'}
                      onChange={() => handleChange(conflict.id, 'overwrite')}
                      className="text-accent"
                    />
                    <span className="text-secondary">Overwrite</span>
                  </label>

                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name={`action-${conflict.id}`}
                      checked={currentAction === 'copy'}
                      onChange={() => handleChange(conflict.id, 'copy')}
                      className="text-accent"
                    />
                    <span className="text-secondary">Make a Copy</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-default">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded bg-surface hover:bg-surface-elevated text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(resolutions)}
            className="px-4 py-2 text-sm rounded bg-accent hover:bg-accent-hover text-accent-contrast font-medium transition-colors"
          >
            Continue Import
          </button>
        </div>
      </div>
    </Modal>
  );
}
