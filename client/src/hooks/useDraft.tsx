import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function useDraft<T>(sourceValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState(sourceValue);

  useEffect(() => {
    setDraft(sourceValue);
  }, [sourceValue]);

  return [draft, setDraft];
}
