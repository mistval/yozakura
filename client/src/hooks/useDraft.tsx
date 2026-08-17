import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function useDraft<T>(sourceValue: T, options?: { refreshFromSourceTrigger?: unknown }): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState(sourceValue);

  useEffect(() => {
    setDraft(sourceValue);
  }, [options?.refreshFromSourceTrigger ?? sourceValue]);

  return [draft, setDraft];
}
