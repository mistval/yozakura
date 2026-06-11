import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useModalQueryParam } from '../hooks/useModalQueryParam.js';

type MapModalContextType = {
  open: boolean;
  showMap: () => void;
  closeMap: () => void;
};

const MapModalContext = createContext<MapModalContextType | undefined>(undefined);

export function MapModalProvider({ children }: { children: ReactNode }) {
  const { open, openModal: showMap, closeModal: closeMap } = useModalQueryParam('map');

  const value = useMemo(() => ({ open, showMap, closeMap }), [open]);

  return <MapModalContext.Provider value={value}>{children}</MapModalContext.Provider>;
}

export function useMapModal() {
  const ctx = useContext(MapModalContext);
  if (!ctx) throw new Error('useMapModal must be used inside MapModalProvider');
  return ctx;
}
