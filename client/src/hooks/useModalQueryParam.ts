import { useQueryParam, useQueryParams } from 'use-query-params';
import { useLocation } from 'react-router-dom';
import type { QueryParamConfig } from 'use-query-params';

export const FlagParam: QueryParamConfig<boolean, boolean> = {
  encode: (value) => (value ? 'true' : undefined),
  decode: (value) => value !== undefined && value !== null,
};

export function useModalQueryParam(name: string) {
  const [open, setOpen] = useQueryParam(name, FlagParam);

  const openModal = () => setOpen(true);
  const closeModal = () => setOpen(undefined as unknown as boolean);

  return { open: open ?? false, openModal, closeModal };
}

export function useModalStackZIndex(name: string): number {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const keys = [...params.keys()];
  const index = keys.indexOf(name);
  const base = 50;
  return base + (index === -1 ? 0 : index + 1) * 100;
}

export { useQueryParams };
