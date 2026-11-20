import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks a transient boolean flag that automatically resets after `resetDelayMs`.
 */
export function useTemporaryFlag(resetDelayMs = 1500) {
  const [active, setActive] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== undefined) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => clearResetTimer, [clearResetTimer]);

  const trigger = useCallback(() => {
    setActive(true);
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      setActive(false);
      resetTimerRef.current = undefined;
    }, resetDelayMs);
  }, [clearResetTimer, resetDelayMs]);

  return { active, trigger };
}
