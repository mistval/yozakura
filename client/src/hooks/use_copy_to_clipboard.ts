import { useCallback } from 'react';
import { useTemporaryFlag } from './use_temporary_flag.js';

export function useCopyToClipboard(resetDelayMs = 1500) {
  const { active: copied, trigger } = useTemporaryFlag(resetDelayMs);

  const copy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      trigger();
    },
    [trigger]
  );

  return { copied, copy };
}
