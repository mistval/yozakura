import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import type { WorldMap, WorldMapLocation } from '../engine/types.js';
import { getConnectivityIslands, validateWorldMap } from '../engine/map/world_map.js';
import { useMapStore } from '../state/map_store.js';
import * as Database from '../backend_bridge/database.js';
import { assert } from '../errors/application_error.js';
import MapZoneEditor from '../components/map_zones/MapZoneEditor.js';

function createEmptyLocation(): WorldMapLocation {
  return Database.createPersistedObject({
    name: '',
    description: '',
    adjacency: [] as string[],
    isEphemeral: false,
  });
}

function createEmptyMap(): WorldMap {
  return Database.createPersistedObject({
    name: '',
    description: '',
    locations: [createEmptyLocation()],
    zones: [],
  });
}

export default function MapEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { openSettings } = useSettingsModal();

  const isNew = !id;

  const [error, setError] = useState('');
  const [currentMap, setCurrentMap] = useState<WorldMap>(createEmptyMap());
  const [mapPendingDelete, setMapPendingDelete] = useState<WorldMap | undefined>(undefined);
  const maps = useMapStore((s) => s.maps);
  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const existingMap = useMemo(() => {
    return maps.find((m) => m.id === id);
  }, [maps]);

  const connectivityIslands = useMemo(
    () => getConnectivityIslands(currentMap.locations),
    [currentMap.locations]
  );

  useEffect(() => {
    if (!mapsAreLoaded || !existingMap) {
      return;
    }

    setCurrentMap(existingMap);
  }, [mapsAreLoaded, existingMap]);

  const updateLocation = (id: string, updates: Partial<WorldMapLocation>) => {
    setCurrentMap((prev) => ({
      ...prev,
      locations: prev.locations.map((location) =>
        location.id === id ? { ...location, ...updates } : location
      ),
    }));
  };

  const addLocation = () => {
    setCurrentMap((prev) => ({
      ...prev,
      locations: [createEmptyLocation()].concat(prev.locations),
    }));
  };

  const deleteLocationById = (id: string) => {
    setCurrentMap((prev) => {
      const withoutLocation = prev.locations.filter((location) => location.id !== id);
      return {
        ...prev,
        locations: withoutLocation.map((location) => ({
          ...location,
          adjacency: location.adjacency.filter((target) => target !== id),
        })),
      };
    });
  };

  const setAdjacency = (locationId: string, targetId: string, checked: boolean) => {
    assert(locationId !== targetId, 'Trying to set adjacency to self');

    setCurrentMap((prev) => {
      const next = prev.locations.map((location) => ({
        ...location,
        adjacency: location.adjacency.concat(),
      }));

      const location = next.find((entry) => entry.id === locationId);
      const target = next.find((entry) => entry.id === targetId);
      assert(location && target, 'Could not find location and target');

      if (checked) {
        if (!location.adjacency.includes(targetId)) {
          location.adjacency.push(targetId);
        }
        if (!target.adjacency.includes(locationId)) {
          target.adjacency.push(locationId);
        }
      } else {
        location.adjacency = location.adjacency.filter((id) => id !== targetId);
        target.adjacency = target.adjacency.filter((id) => id !== locationId);
      }

      return { ...prev, locations: next };
    });
  };

  const handleSave = () => {
    const mapToSave: WorldMap = {
      ...currentMap,
      name: currentMap.name.trim(),
      description: currentMap.description.trim(),
      locations: currentMap.locations.map((location) => ({
        ...location,
        name: location.name.trim(),
        description: location.description.trim(),
      })),
    };

    const validationErrors = validateWorldMap(mapToSave);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' :: '));
      return;
    }

    setError('');

    useMapStore.getState().saveMap(mapToSave);
    navigate('/maps');
  };

  const performDelete = async () => {
    setError('');

    assert(mapPendingDelete, 'Trying to delete nonexistent map?');

    useMapStore.getState().deleteMap(mapPendingDelete.id);
    setMapPendingDelete(undefined);
    navigate('/maps');
  };

  if (!mapsAreLoaded) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-sm text-secondary">Loading map...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{isNew ? 'Create Map' : 'Edit Map'}</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/maps')}>
            Back
          </button>
          {!isNew && (
            <button type="button" onClick={() => existingMap && setMapPendingDelete(existingMap)}>
              Delete Map
            </button>
          )}
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
          value={currentMap.name}
          onChange={(event) => setCurrentMap((prev) => ({ ...prev, name: event.target.value }))}
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
          value={currentMap.description}
          onChange={(event) => setCurrentMap((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Describe the world setting..."
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Locations</h2>
          <button type="button" onClick={addLocation}>
            Add Location
          </button>
        </div>

        {currentMap.locations.map((location) => (
          <div key={location.id} className="border rounded-sm p-3 space-y-2 bg-surface-soft">
            <div className="space-y-2">
              <label className="block text-sm" htmlFor={`location-name-${location.id}`}>
                Name
              </label>
              <input
                id={`location-name-${location.id}`}
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={location.name}
                onChange={(event) => updateLocation(location.id, { name: event.target.value })}
                placeholder="Location name"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm" htmlFor={`location-description-${location.id}`}>
                Description
              </label>
              <textarea
                id={`location-description-${location.id}`}
                className="w-full min-h-20 border rounded-sm px-3 py-2 bg-inset"
                value={location.description}
                onChange={(event) => updateLocation(location.id, { description: event.target.value })}
                placeholder="Location description"
              />
            </div>

            <div className="space-y-2">
              {currentMap.locations.length > 1 && (
                <div className="text-sm font-medium">Adjacent Locations</div>
              )}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {currentMap.locations
                  .filter((entry) => entry.id !== location.id)
                  .map((targetLocation) => {
                    const checked = location.adjacency.includes(targetLocation.id);

                    return (
                      <label
                        key={`${location.id}-${targetLocation.id}`}
                        className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 text-sm leading-5"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 translate-y-0.5 rounded-sm border-border-accent accent-focus-ring"
                          checked={checked}
                          onChange={(event) => {
                            setAdjacency(location.id, targetLocation.id, event.target.checked);
                          }}
                        />
                        <span>
                          {targetLocation.name ||
                            `Location ${currentMap.locations.indexOf(targetLocation) + 1}`}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <div className="flex justify-end items-center">
                <button
                  type="button"
                  onClick={() => deleteLocationById(location.id)}
                  disabled={currentMap.locations.length <= 1}
                >
                  Delete Location
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error-card">{error}</div>}

      {!isNew && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Map Zones</h2>
          <MapZoneEditor
            map={currentMap}
            updateMap={setCurrentMap}
            isGlobalContext={true}
            mapClasses={['min-h-200']}
          />
        </div>
      )}

      {connectivityIslands.length > 1 && (
        <div className="rounded-sm border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text space-y-2">
          <div className="font-medium">Warning: This map has disconnected zones.</div>
          <div>
            Characters cannot move between disconnected zones through normal NPC movement. You can still move
            characters between zones manually via Character Overview.
          </div>
          <div className="space-y-1">
            {connectivityIslands.map((islandLocations, index) => (
              <div key={`island-${index}`}>
                <strong>Zone {index + 1}:</strong>{' '}
                {islandLocations.map((location) => location.name || 'Untitled Location').join(', ')}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="w-full h-20 text-4xl font-bold disabled:bg-muted flex justify-center items-center"
        >
          Save Map
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(mapPendingDelete)}
        onClose={() => setMapPendingDelete(undefined)}
        title="Delete Map"
        message={`Delete map "${mapPendingDelete?.name}"? This will permanently remove the map.`}
        confirmLabel="Delete Map"
        onConfirm={() => {
          performDelete();
        }}
      />
    </div>
  );
}
