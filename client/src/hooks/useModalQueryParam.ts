import { useLocation } from 'react-router';
import { useQueryParams } from '../util/queryParams.js';

export function useModalQueryParam(name: string) {
  const [params, setParams] = useQueryParams();

  const open = params.has(name) && params.get(name) !== 'false';
  const openModal = () => setParams({ [name]: true });
  const closeModal = () => setParams({ [name]: undefined });

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
