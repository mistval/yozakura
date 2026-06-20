import { useCallback, useEffect, useState } from 'react';
import {
  deleteUserTextFile,
  listUserTextFiles,
  loadUserTextFileContent,
  saveUserTextFile,
  type UserTextFileSummary,
} from '../../../backend_bridge/database.js';
import { getErrorMessage } from '../../../errors/error_util.js';
import { newId } from '../../../util/id.js';
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
  const [files, setFiles] = useState<UserTextFileSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshFiles = useCallback(async () => {
    try {
      setFiles(await listUserTextFiles(groupKey));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [groupKey]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const selectedFile = files.find((file) => file.id === value);

  useEffect(() => {
    if (!value || isCreating) {
      setContent('');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const text = await loadUserTextFileContent(groupKey, value);
        if (!cancelled) {
          setContent(text ?? '');
        }
      } catch (e) {
        if (!cancelled) {
          setError(getErrorMessage(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupKey, value, isCreating]);

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
    setBusy(true);
    setError('');
    try {
      const id = newId();
      await saveUserTextFile({ id, groupKey, fileName: nameDraft.trim() || 'Untitled', fileContent: '' });
      await refreshFiles();
      setIsCreating(false);
      onChange(id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!selectedFile) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveUserTextFile({
        id: selectedFile.id,
        groupKey,
        fileName: nameDraft.trim() || selectedFile.fileName,
        fileContent: content,
      });
      await refreshFiles();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteUserTextFile(selectedFile.id);
      const remaining = await listUserTextFiles(groupKey);
      setFiles(remaining);
      onChange(remaining[0]?.id ?? '');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveContent = async (nextContent: string) => {
    if (!selectedFile) {
      return;
    }
    await saveUserTextFile({
      id: selectedFile.id,
      groupKey,
      fileName: selectedFile.fileName,
      fileContent: nextContent,
    });
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
