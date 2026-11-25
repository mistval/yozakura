import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useQueryParams } from '../util/queryParams.js';

type MapModalContextType = {
  open: boolean;
  mapId: string | undefined;
  showMap: (mapId?: string) => void;
  showMapZones: () => void;
  closeMap: () => void;
};

const MapModalContext = createContext<MapModalContextType | undefined>(undefined);

export function MapModalProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useQueryParams();

  const open = params.has('map') && params.get('map') !== 'false';
  const mapId = params.get('map_id') ?? undefined;
  const showMap = useCallback(
    (id?: string) => setParams({ map: true, map_id: id ?? undefined, mapview: undefined }),
    [setParams]
  );
  const showMapZones = useCallback(
    () => setParams({ map: true, map_id: undefined, mapview: 'zones' }),
    [setParams]
  );
  const closeMap = useCallback(
    () => setParams({ map: undefined, map_id: undefined, mapview: undefined }),
    [setParams]
  );

  const value = useMemo(
    () => ({ open, mapId, showMap, showMapZones, closeMap }),
    [open, mapId, showMap, showMapZones, closeMap]
  );

  return <MapModalContext.Provider value={value}>{children}</MapModalContext.Provider>;
}

export function useMapModal() {
  const ctx = useContext(MapModalContext);
  if (!ctx) throw new Error('useMapModal must be used inside MapModalProvider');
  return ctx;
}
