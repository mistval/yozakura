import { useEffect, useState } from 'react';
import { useUserTextFileList } from './useUserTextFileList.js';
import { SpoilerSection } from '../../ui/SpoilerSection.js';
import SettingFieldLabel from '../ui/SettingFieldLabel.js';

const NEW_OPTION = '__new__';

type TextFileListFieldProps = {
  groupKey: string;
  value: string;
  onChange: (fileId: string) => void;
  label: string;
  tooltipHtml: string | undefined;
  htmlFor: string;
};

export default function TextFileListField({
  groupKey,
  value,
  onChange,
  label,
  tooltipHtml,
  htmlFor,
}: TextFileListFieldProps) {
  const { files, error, busy, create, save, remove, loadContent } = useUserTextFileList(groupKey);
  const [isCreating, setIsCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [content, setContent] = useState('');

  const selectedFile = files.find((file) => file.id === value);

  useEffect(() => {
    if (!value || isCreating) {
      setContent('');
      return;
    }

    let cancelled = false;
    void (async () => {
      const text = await loadContent(value);
      if (!cancelled) {
        setContent(text ?? '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, isCreating, loadContent]);

  useEffect(() => {
    if (!isCreating) {
      setNameDraft(selectedFile?.fileName ?? '');
    }
  }, [selectedFile?.fileName, isCreating]);

  const handleSelectChange = (next: string) => {
    if (next === NEW_OPTION) {
      setIsCreating(true);
      setNameDraft('');
      setContent('');
      return;
    }
    setIsCreating(false);
    onChange(next);
  };

  const handleCreate = async () => {
    const id = await create(nameDraft);
    if (id) {
      setIsCreating(false);
      onChange(id);
    }
  };

  const handleRename = async () => {
    if (!selectedFile) {
      return;
    }
    await save(selectedFile.id, nameDraft.trim() || selectedFile.fileName, content);
  };

  const handleDelete = async () => {
    if (!selectedFile) {
      return;
    }
    const nextId = await remove(selectedFile.id);
    onChange(nextId ?? '');
  };

  const handleSaveContent = async (nextContent: string) => {
    if (!selectedFile) {
      return;
    }
    await save(selectedFile.id, selectedFile.fileName, nextContent);
    setContent(nextContent);
  };

  return (
    <div className="space-y-2">
      <SettingFieldLabel text={label} htmlFor={htmlFor} tooltipHtml={tooltipHtml} />
      <select
        id={htmlFor}
        value={isCreating ? NEW_OPTION : value}
        onChange={(event) => handleSelectChange(event.target.value)}
        className="rounded-input"
      >
        {!isCreating && value && !selectedFile && <option value={value}>{value}</option>}
        {files.map((file) => (
          <option key={file.id} value={file.id}>
            {file.fileName}
          </option>
        ))}
        <option value={NEW_OPTION}>+ New…</option>
      </select>

      {isCreating ? (
        <div className="flex gap-2 items-center">
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="New file name"
            className="rounded-input"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy}
            className="shrink-0 px-3 py-1 border rounded-sm"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="shrink-0 px-3 py-1 border rounded-sm"
          >
            Cancel
          </button>
        </div>
      ) : selectedFile ? (
        <>
          <div className="flex gap-2 items-center">
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              className="rounded-input"
            />
            <button
              type="button"
              onClick={() => void handleRename()}
              disabled={busy}
              className="shrink-0 px-3 py-1 border rounded-sm"
            >
              Save name
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={busy}
              className="shrink-0 px-3 py-1 border rounded-sm"
            >
              Delete
            </button>
          </div>
          <SpoilerSection title="Edit file content" initialValue={content} onSave={handleSaveContent}>
            {null}
          </SpoilerSection>
        </>
      ) : null}

      {error && <div className="error-card">{error}</div>}
    </div>
  );
}
