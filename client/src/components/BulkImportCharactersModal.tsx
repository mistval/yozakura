import { useMemo, useRef, useState } from 'react';
import Modal from './ui/Modal';
import type { CardImportMode } from '../engine/character_gen';
import {
  useBulkCharacterImport,
  type BulkImportItem,
  type BulkImportItemStatus,
} from '../hooks/useBulkCharacterImport';

const STATUS_ICON: Record<BulkImportItemStatus, string> = {
  pending: '·',
  importing: '⏳',
  done: '✅',
  skipped: '⏭️',
  failed: '❌',
  cancelled: '🚫',
};

function isPngFile(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
}

export default function BulkImportCharactersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, phase, run, cancel, reset } = useBulkCharacterImport();

  const [mode, setMode] = useState<CardImportMode>('convert');
  const [skipExisting, setSkipExisting] = useState<boolean>(true);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isRunning = phase === 'running' || phase === 'cancelling';

  const summary = useMemo(() => {
    const done = items.filter((item) => item.status === 'done').length;
    const skipped = items.filter((item) => item.status === 'skipped').length;
    const failed = items.filter((item) => item.status === 'failed').length;
    const cancelled = items.filter((item) => item.status === 'cancelled').length;
    return { done, skipped, failed, cancelled, total: items.length };
  }, [items]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList).filter(isPngFile);
    setFiles((prev) => {
      const seen = new Set(prev.map((file) => `${file.name}-${file.size}`));
      const merged = [...prev];
      for (const file of incoming) {
        const key = `${file.name}-${file.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
  };

  const removeFile = (target: File) => {
    setFiles((prev) => prev.filter((file) => file !== target));
  };

  const resetAll = () => {
    reset();
    setFiles([]);
  };

  const handleClose = () => {
    if (isRunning) return;
    resetAll();
    onClose();
  };

  const startImport = () => {
    if (files.length === 0) return;
    void run({ files, mode, skipExisting });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnBackdropClick={!isRunning}
      className="flex items-center justify-center p-4"
    >
      <div className="bg-emphasized rounded-sm p-5 w-full max-w-xl space-y-4">
        {phase === 'idle' ? (
          <>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Bulk Import Characters</h3>
              <p className="text-sm text-secondary-strong">
                Import several character cards at once. Drop your PNG cards below (Yozakura or SillyTavern
                cards both work) and we'll import them to your character list.
              </p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium mb-1">How should we import them?</legend>

              <label className="flex gap-3 justify-start items-start cursor-pointer">
                <input
                  type="radio"
                  name="bulk-import-mode"
                  className="h-4 w-4! mt-1"
                  checked={mode === 'convert'}
                  onChange={() => setMode('convert')}
                />
                <span>
                  <span className="block text-sm font-medium">Convert my character info</span>
                  <span className="block text-xs text-muted">
                    Use your LLM to rewrite each card into Yozakura's style (reduce focus on "the user" and
                    generate some additional types of data that SillyTavern doesn't export). Slower, but
                    produces the best results.
                  </span>
                </span>
              </label>

              <label className="flex gap-3 items-start cursor-pointer">
                <input
                  type="radio"
                  name="bulk-import-mode"
                  className="h-4 w-4! mt-1"
                  checked={mode === 'raw'}
                  onChange={() => setMode('raw')}
                />
                <span>
                  <span className="block text-sm font-medium">Import raw descriptions</span>
                  <span className="block text-xs text-muted">
                    Import each card's existing text as-is, with no LLM processing. Fast, but characters may
                    not behave as well until you edit them.
                  </span>
                </span>
              </label>
            </fieldset>

            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={skipExisting}
                onChange={(event) => setSkipExisting(event.target.checked)}
              />
              <span>Skip characters with names matching existing characters</span>
            </label>

            <div className="space-y-1">
              <p className="text-xs text-muted">Drag your cards in</p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  addFiles(event.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  dragActive ? 'border-border-accent-hover bg-surface-hover-soft' : 'border-border-strong'
                }`}
              >
                <span className="text-sm text-secondary-strong">
                  Drop PNG character cards here, or click to browse
                </span>
                <span className="text-xs text-muted">
                  {files.length > 0
                    ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
                    : 'No files selected yet'}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </div>

            {files.length > 0 && (
              <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2">
                    <span className="truncate text-secondary-strong">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      className="text-xs px-2 py-0.5"
                      onClick={() => removeFile(file)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button-emphasized font-semibold"
                disabled={files.length === 0}
                onClick={startImport}
              >
                Import {files.length} card{files.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {phase === 'done' ? (
              <div className="flex flex-col items-center text-center gap-1 py-2">
                <span
                  className="text-6xl"
                  style={{ animation: 'pulseAnim 700ms ease-out' }}
                  aria-hidden="true"
                >
                  {summary.cancelled > 0 && summary.done === 0 ? '🚫' : '✅'}
                </span>
                <h3 className="font-semibold text-xl mt-4">
                  {summary.cancelled > 0 && summary.done === 0 ? 'Import stopped' : 'Finished'}
                </h3>
                <p className="text-sm text-secondary-strong">
                  Imported {summary.done} character{summary.done === 1 ? '' : 's'}
                  {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''}
                  {summary.failed > 0 ? ` · ${summary.failed} failed` : ''}
                  {summary.cancelled > 0 ? ` · ${summary.cancelled} cancelled` : ''}.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">
                  {phase === 'cancelling' ? 'Stopping…' : 'Importing characters…'}
                </h3>
                <p className="text-sm text-muted">
                  {summary.done + summary.skipped + summary.failed} of {summary.total} processed
                </p>
              </div>
            )}

            <ul className="max-h-72 overflow-y-auto space-y-1 text-sm">
              {items.map((item) => (
                <ImportRow key={item.id} item={item} />
              ))}
            </ul>

            <div className="flex justify-end gap-2 pt-1">
              {isRunning ? (
                <button type="button" onClick={cancel} disabled={phase === 'cancelling'}>
                  {phase === 'cancelling' ? 'Stopping…' : 'Cancel'}
                </button>
              ) : (
                <>
                  <button type="button" className="button-emphasized font-semibold" onClick={handleClose}>
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ImportRow({ item }: { item: BulkImportItem }) {
  const isMuted = item.status === 'pending' || item.status === 'skipped' || item.status === 'cancelled';

  return (
    <li className={`flex items-center gap-2 ${isMuted ? 'text-muted' : ''}`}>
      <span className="w-5 shrink-0 text-center" aria-hidden="true">
        {STATUS_ICON[item.status]}
      </span>
      <span className="flex-1 truncate">{item.characterName || item.fileName}</span>
      {item.status === 'importing' && item.step && (
        <span className="text-xs text-muted shrink-0">{item.step}…</span>
      )}
      {item.status === 'failed' && item.detail && (
        <span className="text-xs text-muted truncate max-w-56" title={item.detail}>
          {item.detail}
        </span>
      )}
      {item.status === 'skipped' && <span className="text-xs text-muted shrink-0">skipped</span>}
      {item.status === 'cancelled' && <span className="text-xs text-muted shrink-0">cancelled</span>}
    </li>
  );
}
