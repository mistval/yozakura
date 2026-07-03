import { useNavigate } from 'react-router-dom';
import { useMapStore } from '../state/map_store.js';
import { useMemo } from 'react';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';
import { createEmptyWorldMap } from '../engine/map/map_factories.js';

export default function MapList() {
  const navigate = useNavigate();
  const maps = useMapStore((s) => s.maps);
  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const { openSettings } = useSettingsModal();

  const sortedMaps = useMemo(() => {
    return [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [maps]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Map Editor</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/')}>
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              const newMap = createEmptyWorldMap();
              useMapStore.getState().saveMap(newMap);
              navigate(`/maps/${newMap.id}`);
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
          <button
            key={map.id}
            type="button"
            className="text-left border rounded-sm p-4 hover:bg-surface-hover"
            onClick={() => navigate(`/maps/${map.id}`)}
          >
            <div className="font-semibold">{map.name}</div>
            <div className="text-sm text-secondary">{map.description}</div>
            <div className="text-xs text-muted mt-2">
              Locations: {map.locations.length} · Updated: {new Date(map.updatedAt).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
