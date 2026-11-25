import { useNavigate } from 'react-router';
import { useMapStore } from '../state/map_store.js';
import { useMemo, useState } from 'react';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';
import { useMapModal } from '../components/MapModalContext.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import type { WorldMap } from '../engine/types.js';
import { createEmptyWorldMap } from '../engine/map/map_factories.js';
import { newId } from '../util/id.js';

export default function MapList() {
  const navigate = useNavigate();
  const maps = useMapStore((s) => s.maps);
  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const { openSettings } = useSettingsModal();
  const { showMap } = useMapModal();
  const [mapPendingDelete, setMapPendingDelete] = useState<WorldMap | undefined>(undefined);

  const sortedMaps = useMemo(() => {
    return maps.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [maps]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-semibold">Map Editor</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/')}>
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              const newMap = createEmptyWorldMap();
              useMapStore.getState().saveMap(newMap);
              showMap(newMap.id);
            }}
          >
            Create New Map
          </button>
          <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
            ⚙
          </button>
        </div>
      </div>

      {!mapsAreLoaded && <div className="text-sm text-secondary">Loading maps...</div>}

      {mapsAreLoaded && maps.length === 0 && <div className="text-sm text-secondary">No maps found.</div>}

      <div className="grid gap-3">
        {sortedMaps.map((map) => (
          <div key={map.id} className="relative">
            <button
              type="button"
              className="w-full text-left border rounded-sm p-4 pr-20 hover:bg-surface-hover"
              onClick={() => showMap(map.id)}
            >
              <div className="font-semibold">{map.name}</div>
              <div className="text-sm text-secondary">{map.description}</div>
              <div className="text-xs text-muted mt-2">
                Locations: {map.locations.length} · Updated: {new Date(map.updatedAt).toLocaleString()}
              </div>
            </button>

            <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
              <button
                type="button"
                className="text-sm leading-none px-1"
                onClick={(event) => {
                  event.stopPropagation();
                  const now = new Date().toISOString();
                  const duplicatedMap: WorldMap = {
                    ...map,
                    id: newId(),
                    name: `${map.name} (Copy)`,
                    createdAt: now,
                    updatedAt: now,
                  };
                  useMapStore.getState().saveMap(duplicatedMap);
                }}
                aria-label={`Copy map ${map.name}`}
                title="Copy map"
              >
                📋
              </button>
              <button
                type="button"
                className="text-sm leading-none px-1"
                onClick={(event) => {
                  event.stopPropagation();
                  setMapPendingDelete(map);
                }}
                aria-label={`Delete map ${map.name}`}
                title="Delete map"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(mapPendingDelete)}
        onClose={() => setMapPendingDelete(undefined)}
        title="Delete Map"
        message={`Delete map "${mapPendingDelete?.name ?? ''}"? This will permanently remove the map.`}
        confirmLabel="Delete Map"
        onConfirm={() => {
          if (!mapPendingDelete) {
            return;
          }

          useMapStore.getState().deleteMap(mapPendingDelete.id);
          setMapPendingDelete(undefined);
        }}
      />
    </div>
  );
}
