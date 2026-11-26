import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export type QueryParamsMap = Record<
  string,
  string | number | boolean | (string | number)[] | undefined | null
>;

function appendParamEntries(target: URLSearchParams, updates: QueryParamsMap, skipKeys?: Set<string>): void {
  for (const [key, value] of Object.entries(updates)) {
    if (skipKeys?.has(key)) {
      continue;
    }
    if (value === undefined || value === null || value === false || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') {
          target.append(key, String(item));
        }
      }
    } else if (value === true) {
      target.append(key, 'true');
    } else {
      target.append(key, String(value));
    }
  }
}

export function createParams(prevParams: URLSearchParams | string, updates: QueryParamsMap): URLSearchParams {
  const oldSearchParams = typeof prevParams === 'string' ? new URLSearchParams(prevParams) : prevParams;
  const newSearchParams = new URLSearchParams();

  const setKeySet = new Set(Object.keys(updates));

  for (const [key, value] of oldSearchParams.entries()) {
    if (!setKeySet.has(key)) {
      newSearchParams.append(key, value);
    }
  }

  appendParamEntries(newSearchParams, updates);

  return newSearchParams;
}

/**
 * Appends a new modal layer (`modalKey=true` plus optional initial sub-params) to the end of
 * `prevParams` without removing earlier occurrences so identical modals can stack in z-order.
 */
export function pushModalParams(
  prevParams: URLSearchParams | string,
  modalKey: string,
  extraParams: QueryParamsMap = {}
): URLSearchParams {
  const oldSearchParams = typeof prevParams === 'string' ? new URLSearchParams(prevParams) : prevParams;
  const nextParams = new URLSearchParams();
  for (const [key, value] of oldSearchParams.entries()) {
    nextParams.append(key, value);
  }
  nextParams.append(modalKey, 'true');
  appendParamEntries(nextParams, extraParams, new Set([modalKey]));
  return nextParams;
}

/**
 * Pops only the topmost (last) occurrence of `modalKey` and any `ownedKeys` belonging to that layer,
 * leaving any earlier stacked occurrences and unrelated params intact.
 */
export function popModalParams(
  prevParams: URLSearchParams | string,
  modalKey: string,
  ownedKeys: readonly string[] = []
): URLSearchParams {
  const oldSearchParams = typeof prevParams === 'string' ? new URLSearchParams(prevParams) : prevParams;
  const entries = [...oldSearchParams.entries()];
  const lastModalIndex = entries.findLastIndex(([key]) => key === modalKey);

  if (lastModalIndex === -1) {
    return new URLSearchParams(oldSearchParams);
  }

  const ownedKeySet = new Set(ownedKeys);
  const nextParams = new URLSearchParams();
  entries.forEach(([key, value], index) => {
    if (index === lastModalIndex) {
      return;
    }
    if (index > lastModalIndex && ownedKeySet.has(key)) {
      return;
    }
    nextParams.append(key, value);
  });
  return nextParams;
}

/**
 * Updates sub-params belonging only to the topmost occurrence of `modalKey`, preserving any earlier
 * stacked modal layer's sub-params untouched.
 */
export function updateModalLayerParams(
  prevParams: URLSearchParams | string,
  modalKey: string,
  updates: QueryParamsMap
): URLSearchParams {
  const oldSearchParams = typeof prevParams === 'string' ? new URLSearchParams(prevParams) : prevParams;
  const entries = [...oldSearchParams.entries()];
  const lastModalIndex = entries.findLastIndex(([key]) => key === modalKey);

  if (lastModalIndex === -1) {
    return createParams(oldSearchParams, updates);
  }

  const updateKeySet = new Set(Object.keys(updates));
  const nextParams = new URLSearchParams();

  entries.forEach(([key, value], index) => {
    if (index <= lastModalIndex || !updateKeySet.has(key)) {
      nextParams.append(key, value);
    }
  });

  appendParamEntries(nextParams, updates);
  return nextParams;
}

/**
 * Returns the subset of query params from the topmost occurrence of `modalKey` onward.
 */
export function getModalLayerParams(params: URLSearchParams, modalKey: string): URLSearchParams {
  if (!modalKey) {
    return new URLSearchParams();
  }
  const entries = [...params.entries()];
  const lastModalIndex = entries.findLastIndex(([key]) => key === modalKey);
  if (lastModalIndex === -1) {
    return new URLSearchParams();
  }
  const layerParams = new URLSearchParams();
  for (let index = lastModalIndex; index < entries.length; index += 1) {
    const entry = entries[index]!;
    layerParams.append(entry[0], entry[1]);
  }
  return layerParams;
}

/**
 * Returns `true` if any query params not owned by the topmost `modalKey` layer appear after it,
 * indicating another modal layer or overlay has been pushed on top.
 */
export function hasParamsAfterModalLayer(
  params: URLSearchParams,
  modalKey: string,
  ownedKeys: readonly string[] = []
): boolean {
  if (!modalKey) {
    return false;
  }
  const entries = [...params.entries()];
  const lastModalIndex = entries.findLastIndex(([key]) => key === modalKey);
  if (lastModalIndex === -1) {
    return false;
  }
  const ownedKeySet = new Set(ownedKeys);
  return entries.slice(lastModalIndex + 1).some(([key]) => key !== modalKey && !ownedKeySet.has(key));
}

export function useQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const setQueryParams = useCallback(
    (updates: QueryParamsMap) => {
      setSearchParams((prev) => {
        return createParams(prev, updates);
      });
    },
    [setSearchParams]
  );

  return [searchParams, setQueryParams] as const;
}

export function useQueryParam(name: string): [string | undefined, (val: string | undefined) => void] {
  const [params, setParams] = useQueryParams();
  const value = params.getAll(name).at(-1);
  const setValue = (val: string | undefined) => setParams({ [name]: val });
  return [value, setValue];
}
