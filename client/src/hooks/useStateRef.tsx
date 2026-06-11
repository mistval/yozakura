import { useState, useRef, useCallback, type Dispatch, type SetStateAction, type RefObject } from 'react';

export function useStateRef<T>(initialValue: T): [T, Dispatch<SetStateAction<T>>, RefObject<T>] {
  const [state, setStateInternal] = useState<T>(initialValue);
  const ref = useRef<T>(initialValue);

  const setState: Dispatch<SetStateAction<T>> = useCallback((value) => {
    ref.current = typeof value === 'function' ? (value as (value: T) => T)(ref.current) : value;
    setStateInternal(ref.current);
  }, []);

  return [state, setState, ref];
}
