import { useCallback, useEffect, useState } from 'react';
import * as Database from '../../../backend_bridge/database.js';
import { getErrorMessage } from '../../../errors/error_util.js';
import { newId } from '../../../util/id.js';
import { concatUniqueById, findById, removeById } from '../../../util/array.js';

export function useUserTextFileList(groupKey: string) {
  const [files, setFiles] = useState<Database.UserTextFileSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const saveDebounced = useCallback((file: Database.UserTextFileSummary) => {
    setFiles((prev) => concatUniqueById(prev, file));
    void Database.doAsDataWrite(() => Database.saveUserTextFile(file), 'user_text_file', {
      debouncerKey: file.id,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      setFiles(await Database.loadUserTextFiles(groupKey));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [groupKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (fileName: string, fileContent = ''): Promise<string | undefined> => {
      setBusy(true);
      setError('');
      try {
        const id = newId();
        const file = { id, groupKey, fileName: fileName.trim() || 'Untitled', fileContent };
        saveDebounced(file);
        return id;
      } catch (e) {
        setError(getErrorMessage(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [groupKey, saveDebounced]
  );

  const save = useCallback(
    async (id: string, fileName: string, fileContent: string): Promise<void> => {
      setBusy(true);
      setError('');
      try {
        const file = { id, groupKey, fileName, fileContent };
        saveDebounced(file);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [groupKey, saveDebounced]
  );

  const remove = useCallback(
    async (id: string): Promise<string | undefined> => {
      setBusy(true);
      setError('');
      try {
        const remaining = removeById(files, id);
        setFiles(remaining);
        await Database.doAsDataWrite(() => Database.deleteUserTextFile(id), 'user_text_file');
        return remaining[0]?.id;
      } catch (e) {
        setError(getErrorMessage(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [files]
  );

  const loadContent = useCallback((id: string) => findById(files, id)?.fileContent, [files]);

  return { files, error, busy, loadContent, setError, refresh, create, save, remove };
}
