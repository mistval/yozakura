import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import { useDraft } from '../../hooks/useDraft.js';

export function SpoilerSection({
  title,
  children,
  initialValue,
  defaultRevealed,
  className = '',
  onSave,
  onDelete,
}: {
  title: string;
  children: ReactNode;
  initialValue?: string;
  defaultRevealed?: boolean;
  className?: string;
  onSave?: (value: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const [revealed, setRevealed] = useState(defaultRevealed ?? false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving, savingRef] = useStateRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const editable = typeof onSave === 'function';
  const sourceValue = initialValue ?? '';
  const [draft, setDraft] = useDraft(sourceValue);
  const dirty = draft !== sourceValue;

  useEffect(() => {
    setSaved(false);
  }, [sourceValue]);

  useEffect(() => {
    if (!revealed || !editable || !textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [revealed, editable, draft]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    },
    []
  );

  const handleSave = async () => {
    if (!editable || !dirty || savingRef.current) return;
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaved(false);
      }, 1500);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || savingRef.current) return;
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`border rounded-sm p-3 ${className}`}>
      <button
        type="button"
        className="flex items-center gap-2 font-medium text-sm w-full text-left"
        onClick={() => setRevealed((prev) => !prev)}
      >
        <span>{revealed ? '▾' : '▸'}</span>
        <span>{title}</span>
        {!revealed && <span className="text-xs text-muted-soft ml-auto">click to reveal</span>}
      </button>
      {revealed && editable ? (
        <div className="mt-2 space-y-2">
          <textarea
            ref={textareaRef}
            className="w-full border rounded-sm p-2 text-sm resize-none overflow-hidden"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            {onDelete && (
              <button
                type="button"
                className="border-danger-border-accent bg-danger-solid text-on-accent hover:bg-danger-solid-hover"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            )}
            {saved ? (
              <span className="text-sm text-success-text">Saved ✓</span>
            ) : (
              <button type="button" onClick={handleSave} disabled={!dirty || saving}>
                Save
              </button>
            )}
          </div>
        </div>
      ) : revealed ? (
        <div className="mt-2 whitespace-pre-wrap text-sm">{children}</div>
      ) : null}
    </div>
  );
}
