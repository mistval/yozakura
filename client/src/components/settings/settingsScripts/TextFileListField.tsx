import { useState } from 'react';
import { useUserTextFileList } from './useUserTextFileList.js';
import SettingFieldLabel from '../ui/SettingFieldLabel.js';
import DeleteButton from '../../ui/DeleteButton.js';

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
  const { files, error, busy, create, save, remove } = useUserTextFileList(groupKey);
  const [isCreating, setIsCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [content, setContent] = useState('');

  const selectedFile = files.find((file) => file.id === value);

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
    const id = await create(nameDraft, content);
    if (id) {
      setIsCreating(false);
      onChange(id);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) {
      return;
    }
    const nextId = await remove(selectedFile.id);
    onChange(nextId ?? '');
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
        {!isCreating && !value && <option value="">Select a file…</option>}
        {!isCreating && value && !selectedFile && <option value={value}>{value}</option>}
        {files.map((file) => (
          <option key={file.id} value={file.id}>
            {file.fileName}
          </option>
        ))}
        <option value={NEW_OPTION}>+ New…</option>
      </select>

      {isCreating ? (
        <div className="space-y-2 bordered-section">
          <input
            aria-label="New file name"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="File name"
            className="rounded-input"
          />
          <textarea
            aria-label="File content"
            rows={12}
            spellCheck={false}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="rounded-input font-mono text-sm w-full"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1 border rounded-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busy}
              className="px-3 py-1 border rounded-sm"
            >
              Create
            </button>
          </div>
        </div>
      ) : selectedFile ? (
        <div className="space-y-2 bordered-section">
          <textarea
            aria-label="File content"
            rows={12}
            spellCheck={false}
            value={selectedFile.fileContent}
            onChange={(event) => void save(selectedFile.id, selectedFile.fileName, event.target.value)}
            className="rounded-input font-mono text-sm w-full"
          />
          <div className="flex justify-end">
            <DeleteButton
              onConfirm={handleDelete}
              disabled={busy}
              confirmTitle="Delete File"
              confirmLabel="Delete File"
              label="Delete file"
              confirmMessage={`Delete "${selectedFile.fileName || 'Untitled'}"? This cannot be undone.`}
            />
          </div>
        </div>
      ) : null}

      {error && <div className="error-card">{error}</div>}
    </div>
  );
}
