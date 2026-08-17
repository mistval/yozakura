import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useQueryParams } from '../util/queryParams.js';

type MapModalContextType = {
  open: boolean;
  showMap: () => void;
  showMapZones: () => void;
  closeMap: () => void;
};

const MapModalContext = createContext<MapModalContextType | undefined>(undefined);

export function MapModalProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useQueryParams();

  const open = params.has('map') && params.get('map') !== 'false';
  const showMap = () => setParams({ map: true, mapview: undefined });
  const showMapZones = () => setParams({ map: true, mapview: 'zones' });
  const closeMap = () => setParams({ map: undefined, mapview: undefined });

  const value = useMemo(() => ({ open, showMap, showMapZones, closeMap }), [open, params]);

  return <MapModalContext.Provider value={value}>{children}</MapModalContext.Provider>;
}

export function useMapModal() {
  const ctx = useContext(MapModalContext);
  if (!ctx) throw new Error('useMapModal must be used inside MapModalProvider');
  return ctx;
}
