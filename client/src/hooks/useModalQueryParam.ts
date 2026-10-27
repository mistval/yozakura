import { useCallback } from 'react';
import { useLocation } from 'react-router';
import { useQueryParams } from '../util/queryParams.js';

export function useModalQueryParam(name: string) {
  const [params, setParams] = useQueryParams();

  const open = params.has(name) && params.get(name) !== 'false';
  const openModal = useCallback(() => setParams({ [name]: true }), [name, setParams]);
  const closeModal = useCallback(() => setParams({ [name]: undefined }), [name, setParams]);

  return { open, openModal, closeModal };
}

export function useModalStackZIndex(name: string): number {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const keys = [...params.keys()];
  const index = keys.indexOf(name);
  const base = 50;
  return base + (index === -1 ? 0 : index + 1) * 100;
}
