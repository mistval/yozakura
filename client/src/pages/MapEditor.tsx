import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryParam } from '../util/queryParams.js';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';
import DeleteButton from '../components/ui/DeleteButton.js';
import Tabs from '../components/ui/Tabs.js';
import type { WorldMap } from '../engine/types.js';
import { validateWorldMap } from '../engine/map/world_map.js';
import { useMapStore } from '../state/map_store.js';
import MapGraphEditor from '../components/MapGraphEditor.js';
import MapZoneEditor from '../components/map_zones/MapZoneEditor.js';

export default function MapEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { openSettings } = useSettingsModal();

  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const map = useMapStore((s) => (id ? s.mapsById[id] : undefined));
  const updateMap = useMapStore((s) => s.updateMap);
  const deleteMap = useMapStore((s) => s.deleteMap);

  const [tabParam, setTabParam] = useQueryParam('tab');
  const tab = tabParam === 'zones' ? 'zones' : 'locations';

  const validationErrors = useMemo(() => (map ? validateWorldMap(map) : []), [map]);

  if (!mapsAreLoaded) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-sm text-secondary">Loading map...</div>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-3">
        <div className="text-sm text-secondary">Map not found.</div>
        <button type="button" onClick={() => navigate('/maps')}>
          Back
        </button>
      </div>
    );
  }

  const updateThisMap = (mutator: (prev: WorldMap) => WorldMap) => {
    updateMap(map.id, mutator);
  };

  return (
    <div className="p-6 px-16 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Edit Map</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/maps')}>
            Back
          </button>
          <DeleteButton
            label="Delete map"
            confirmTitle="Delete Map"
            confirmLabel="Delete Map"
            confirmMessage={`Delete map "${map.name}"? This will permanently remove the map.`}
            onConfirm={() => {
              deleteMap(map.id);
              navigate('/maps');
            }}
          />
          <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
            ⚙
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="map-name">
          Map Name
        </label>
        <input
          id="map-name"
          className="w-full border rounded-sm px-3 py-2 bg-inset"
          value={map.name}
          onChange={(event) => updateThisMap((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Map name"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="map-description">
          Map Description
        </label>
        <textarea
          id="map-description"
          className="w-full min-h-24 border rounded-sm px-3 py-2 bg-inset"
          value={map.description}
          onChange={(event) => updateThisMap((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Describe the world setting..."
        />
      </div>

      <Tabs
        tabs={[
          { id: 'locations', label: 'Locations' },
          { id: 'zones', label: 'Map Zones' },
        ]}
        activeId={tab}
        onChange={(id) => setTabParam(id === 'zones' ? 'zones' : undefined)}
      >
        {tab === 'locations' ? (
          <MapGraphEditor map={map} updateMap={updateThisMap} className="h-[80vh]" />
        ) : (
          <div className="space-y-3">
            <p>Group map locations into zones for use in the schedule system</p>
            <MapZoneEditor
              map={map}
              updateMap={updateThisMap}
              isGlobalContext={true}
              mapClasses={['min-h-200']}
            />
          </div>
        )}
      </Tabs>

      {validationErrors.length > 0 && (
        <div className="rounded-sm border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text space-y-1">
          <div className="font-medium">This map is incomplete:</div>
          {validationErrors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}
      <p>Map changes are saved automatically.</p>
    </div>
  );
}
