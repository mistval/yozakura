import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import {
  getModalLayerParams,
  hasParamsAfterModalLayer,
  popModalParams,
  pushModalParams,
  updateModalLayerParams,
  type QueryParamsMap,
} from '../util/queryParams.js';

export function useModalQueryParam(name: string, ownedKeys: readonly string[] = []) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ownedKeysKey = ownedKeys.join('\0');

  const lastValue = name ? searchParams.getAll(name).at(-1) : undefined;
  const open = lastValue !== undefined && lastValue !== 'false';

  const openModal = useCallback(() => {
    setSearchParams((prev) => pushModalParams(prev, name));
  }, [name, setSearchParams]);

  const pushModal = useCallback(
    (extraParams?: QueryParamsMap) => {
      setSearchParams((prev) => pushModalParams(prev, name, extraParams));
    },
    [name, setSearchParams]
  );

  const closeModal = useCallback(() => {
    setSearchParams((prev) => popModalParams(prev, name, ownedKeys));
  }, [name, ownedKeysKey, setSearchParams]);

  const updateModalParams = useCallback(
    (updates: QueryParamsMap) => {
      setSearchParams((prev) => updateModalLayerParams(prev, name, updates));
    },
    [name, setSearchParams]
  );

  const layerParams = useMemo(() => getModalLayerParams(searchParams, name), [searchParams, name]);
  const hasOverlayAbove = useMemo(
    () => hasParamsAfterModalLayer(searchParams, name, ownedKeys),
    [searchParams, name, ownedKeysKey]
  );

  return { open, openModal, pushModal, closeModal, updateModalParams, layerParams, hasOverlayAbove };
}

export function useModalStackZIndex(name: string): number {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const keys = [...params.keys()];
  const index = keys.lastIndexOf(name);
  const base = 50;
  return base + (index === -1 ? 0 : index + 1) * 100;
}
