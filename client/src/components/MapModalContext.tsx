import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useModalQueryParam } from '../hooks/useModalQueryParam.js';

export type MapModalView = 'characters' | 'zones' | 'log';

const MAP_MODAL_OWNED_KEYS = ['map_id', 'mapview'] as const;

type MapModalContextType = {
  open: boolean;
  mapId: string | undefined;
  viewParam: string | undefined;
  setViewParam: (next: string | undefined) => void;
  showMap: (mapId?: string) => void;
  showMapZones: () => void;
  closeMap: () => void;
};

const MapModalContext = createContext<MapModalContextType | undefined>(undefined);

export function MapModalProvider({ children }: { children: ReactNode }) {
  const { open, pushModal, closeModal, updateModalParams, layerParams } = useModalQueryParam(
    'map',
    MAP_MODAL_OWNED_KEYS
  );

  const mapId = layerParams.get('map_id') ?? undefined;
  const viewParam = layerParams.get('mapview') ?? undefined;

  const setViewParam = useCallback(
    (next: string | undefined) => updateModalParams({ mapview: next }),
    [updateModalParams]
  );

  const showMap = useCallback(
    (id?: string) => pushModal({ map_id: id ?? undefined, mapview: undefined }),
    [pushModal]
  );
  const showMapZones = useCallback(() => pushModal({ mapview: 'zones' }), [pushModal]);
  const closeMap = closeModal;

  const value = useMemo(
    () => ({ open, mapId, viewParam, setViewParam, showMap, showMapZones, closeMap }),
    [open, mapId, viewParam, setViewParam, showMap, showMapZones, closeMap]
  );

  return <MapModalContext.Provider value={value}>{children}</MapModalContext.Provider>;
}

export function useMapModal() {
  const ctx = useContext(MapModalContext);
  if (!ctx) throw new Error('useMapModal must be used inside MapModalProvider');
  return ctx;
}
