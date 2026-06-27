import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { StringParam, useQueryParams } from 'use-query-params';
import { FlagParam } from '../hooks/useModalQueryParam.js';

type MapModalContextType = {
  open: boolean;
  showMap: () => void;
  showMapZones: () => void;
  closeMap: () => void;
};

const MapModalContext = createContext<MapModalContextType | undefined>(undefined);

export function MapModalProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useQueryParams({ map: FlagParam, mapview: StringParam });

  const open = params.map ?? false;
  const showMap = () => setParams({ map: true, mapview: undefined });
  const showMapZones = () => setParams({ map: true, mapview: 'zones' });
  const closeMap = () => setParams({ map: undefined as unknown as boolean, mapview: undefined });

  const value = useMemo(() => ({ open, showMap, showMapZones, closeMap }), [open]);

  return <MapModalContext.Provider value={value}>{children}</MapModalContext.Provider>;
}

export function useMapModal() {
  const ctx = useContext(MapModalContext);
  if (!ctx) throw new Error('useMapModal must be used inside MapModalProvider');
  return ctx;
}
