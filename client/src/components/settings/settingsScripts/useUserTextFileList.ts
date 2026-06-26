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

export function useUserTextFileList(groupKey: string) {
  const [files, setFiles] = useState<UserTextFileSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setFiles(await listUserTextFiles(groupKey));
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
        await saveUserTextFile({ id, groupKey, fileName: fileName.trim() || 'Untitled', fileContent });
        await refresh();
        return id;
      } catch (e) {
        setError(getErrorMessage(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [groupKey, refresh]
  );

  const save = useCallback(
    async (id: string, fileName: string, fileContent: string): Promise<void> => {
      setBusy(true);
      setError('');
      try {
        await saveUserTextFile({ id, groupKey, fileName, fileContent });
        await refresh();
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [groupKey, refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<string | undefined> => {
      setBusy(true);
      setError('');
      try {
        await deleteUserTextFile(id);
        const remaining = await listUserTextFiles(groupKey);
        setFiles(remaining);
        return remaining[0]?.id;
      } catch (e) {
        setError(getErrorMessage(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [groupKey]
  );

  const loadContent = useCallback((id: string) => loadUserTextFileContent(groupKey, id), [groupKey]);

  return { files, error, busy, setError, refresh, create, save, remove, loadContent };
}
