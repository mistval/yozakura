import { useCallback, useRef, useState } from 'react';

export function useCopyToClipboard(resetDelayMs = 1500) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);

  const copy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimerRef.current !== undefined) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = undefined;
      }, resetDelayMs);
    },
    [resetDelayMs]
  );

  return { copied, copy };
}
