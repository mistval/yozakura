import { useSearchParams } from 'react-router';

export type QueryParamsMap = Record<
  string,
  string | number | boolean | (string | number)[] | undefined | null
>;

export function createParams(prevParams: URLSearchParams | string, updates: QueryParamsMap): URLSearchParams {
  const oldSearchParams = typeof prevParams === 'string' ? new URLSearchParams(prevParams) : prevParams;
  const newSearchParams = new URLSearchParams();

  const setKeySet = new Set(Object.keys(updates));

  for (const [key, value] of oldSearchParams.entries()) {
    if (!setKeySet.has(key)) {
      newSearchParams.append(key, value);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === false || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') {
          newSearchParams.append(key, String(item));
        }
      }
    } else if (value === true) {
      newSearchParams.append(key, 'true');
    } else {
      newSearchParams.append(key, String(value));
    }
  }

  return newSearchParams;
}

export function useQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const setQueryParams = (updates: QueryParamsMap) => {
    setSearchParams((prev) => {
      return createParams(prev, updates);
    });
  };

  return [searchParams, setQueryParams] as const;
}

export function useQueryParam(name: string): [string | undefined, (val: string | undefined) => void] {
  const [params, setParams] = useQueryParams();
  const value = params.get(name) ?? undefined;
  const setValue = (val: string | undefined) => setParams({ [name]: val });
  return [value, setValue];
}
