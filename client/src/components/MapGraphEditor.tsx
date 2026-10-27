import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraphCanvas, type GraphCanvasRef } from 'reagraph';
import { useGraphTheme } from '../theme/graph_themes.js';
import type { Character, WorldMap, WorldMapLocation } from '../engine/types.js';
import { createEmptyMapLocation } from '../engine/map/map_factories.js';
import { removeMapLocation, setMapAdjacency } from '../engine/map/world_map.js';
import DeleteButton from './ui/DeleteButton.js';
import { useMapStore } from '../state/map_store.js';
import { useShallow } from 'zustand/react/shallow';

function CharacterAvatar({
  character,
  interactive,
  onClick,
}: {
  character: Character;
  interactive?: boolean | undefined;
  onClick?: ((e: React.MouseEvent) => void) | undefined;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-sm text-left ${interactive ? '' : 'pointer-events-none'}`}
      onClick={onClick}
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border-default bg-emphasized">
        <img
          src={character.imagePath}
          alt={`${character.firstName} ${character.lastName}`}
          className="h-full w-full object-cover object-top"
        />
      </div>
      <div className="min-w-0 truncate text-sm">
        {character.firstName} {character.lastName}
      </div>
    </button>
  );
}

function LocationEntryItem({
  mapId,
  locationId,
  characters,
  showCharacters,
  isSelected,
  isHovered,
  groupRefs,
  toggleSelectedLocation,
  setHoveredLocationId,
  onCharacterClick,
}: {
  mapId: string;
  locationId: string;
  characters: Character[];
  showCharacters: boolean;
  isSelected: boolean;
  isHovered: boolean;
  groupRefs: React.RefObject<Map<string, HTMLDivElement>>;
  toggleSelectedLocation: (locationId: string, args?: { center?: boolean } | undefined) => void;
  setHoveredLocationId: (id: string | ((prev: string | undefined) => string | undefined)) => void;
  onCharacterClick?: ((char: Character) => void) | undefined;
}) {
  const name = useMapStore((s) => s.mapsById[mapId]?.locations.find((l) => l.id === locationId)?.name);
  const description = useMapStore((s) =>
    showCharacters ? undefined : s.mapsById[mapId]?.locations.find((l) => l.id === locationId)?.description
  );

  const ringClass = isSelected
    ? 'ring-2 ring-success-ring border-transparent'
    : isHovered
      ? 'ring-2 ring-focus-ring border-transparent'
      : 'border-border-default';

  return (
    <div
      ref={(node) => {
        if (node) {
          groupRefs.current.set(locationId, node);
        } else {
          groupRefs.current.delete(locationId);
        }
      }}
      className={`cursor-pointer space-y-2 rounded-sm border bg-inset p-3 transition-shadow ${ringClass}`}
      onClick={() => toggleSelectedLocation(locationId, { center: true })}
      onMouseEnter={() => setHoveredLocationId(locationId)}
      onMouseLeave={() => setHoveredLocationId((current) => (current === locationId ? undefined : current))}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold">{name || 'Untitled Location'}</h3>
        {showCharacters && <span className="shrink-0 text-xs text-muted">{characters.length}</span>}
      </div>

      {showCharacters ? (
        <div className="space-y-2">
          {characters.length === 0 ? (
            <div className="text-sm text-muted">Nobody is here.</div>
          ) : (
            characters.map((character) => (
              <CharacterAvatar
                key={character.id}
                character={character}
                interactive={isSelected && Boolean(onCharacterClick)}
                onClick={(e) => {
                  e.stopPropagation();
                  onCharacterClick?.(character);
                }}
              />
            ))
          )}
        </div>
      ) : (
        <div className="line-clamp-3 text-sm text-secondary">
          {description || <span className="text-muted">No description.</span>}
        </div>
      )}
    </div>
  );
}

function LocationEntriesBar({
  mapId,
  charactersByLocationId,
  selectedLocationId,
  hoveredLocationId,
  groupRefs,
  toggleSelectedLocation,
  setHoveredLocationId,
  onCharacterClick,
}: {
  mapId: string;
  charactersByLocationId?: Record<string, Character[]> | undefined;
  hoveredLocationId: string | undefined;
  selectedLocationId: string | undefined;
  groupRefs: React.RefObject<Map<string, HTMLDivElement>>;
  toggleSelectedLocation: (locationId: string, args?: { center?: boolean } | undefined) => void;
  setHoveredLocationId: (id: string | ((prev: string | undefined) => string | undefined)) => void;
  onCharacterClick?: ((char: Character) => void) | undefined;
}) {
  const showCharacters = charactersByLocationId !== undefined;

  const locationIds = useMapStore(useShallow((s) => s.mapsById[mapId]?.locations.map((l) => l.id) ?? []));

  const sortedLocationIds = useMemo(() => {
    if (!showCharacters) {
      return locationIds;
    }

    return [...locationIds].sort((a, b) => {
      const countA = charactersByLocationId?.[a]?.length ?? 0;
      const countB = charactersByLocationId?.[b]?.length ?? 0;
      return (countA > 0 ? 0 : 1) - (countB > 0 ? 0 : 1);
    });
  }, [locationIds, showCharacters, charactersByLocationId]);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 scrollbar-none">
      {sortedLocationIds.map((locationId) => (
        <LocationEntryItem
          key={locationId}
          mapId={mapId}
          locationId={locationId}
          characters={charactersByLocationId?.[locationId] ?? []}
          showCharacters={showCharacters}
          isSelected={selectedLocationId === locationId}
          isHovered={hoveredLocationId === locationId}
          groupRefs={groupRefs}
          toggleSelectedLocation={toggleSelectedLocation}
          setHoveredLocationId={setHoveredLocationId}
          onCharacterClick={onCharacterClick}
        />
      ))}
    </div>
  );
}

function useMapGraph(mapId: string) {
  const graphDataRef = useRef<{
    nodes: { id: string; label: string }[];
    edges: { id: string; source: string; target: string }[];
  }>({ nodes: [], edges: [] });
  const keyRef = useRef<string>('');

  const graphKey = useMapStore((s) => {
    const locations = s.mapsById[mapId]?.locations;
    if (!locations) return '';
    return locations.map((l) => `${l.id}:${l.name}:${l.adjacency.join(',')}`).join('|');
  });

  if (graphKey !== keyRef.current) {
    keyRef.current = graphKey;
    const map = useMapStore.getState().mapsById[mapId];
    if (map) {
      const nodes = map.locations.map((location) => ({
        id: location.id,
        label: location.name || 'Untitled',
      }));
      const edges = map.locations.flatMap((location) =>
        location.adjacency.map((targetId) => ({
          id: `${location.id}->${targetId}`,
          source: location.id,
          target: targetId,
        }))
      );
      graphDataRef.current = { nodes, edges };
    } else {
      graphDataRef.current = { nodes: [], edges: [] };
    }
  }

  return graphDataRef.current;
}

function MapGraphCanvas({
  mapId,
  graphRef,
  actives,
  graphTheme,
  onNodePointerOver,
  onNodePointerOut,
  onNodeClick,
  onCanvasClick,
}: {
  mapId: string;
  graphRef: React.RefObject<GraphCanvasRef | null>;
  actives: string[];
  graphTheme: ReturnType<typeof useGraphTheme>;
  onNodePointerOver: (node: { id: string }) => void;
  onNodePointerOut: () => void;
  onNodeClick: (node: { id: string }) => void;
  onCanvasClick: () => void;
}) {
  const graph = useMapGraph(mapId);

  if (graph.nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
        No locations to display.
      </div>
    );
  }

  return (
    <GraphCanvas
      ref={graphRef}
      nodes={graph.nodes}
      edges={graph.edges}
      theme={graphTheme}
      actives={actives}
      onNodePointerOver={onNodePointerOver}
      onNodePointerOut={onNodePointerOut}
      onNodeClick={onNodeClick}
      onCanvasClick={onCanvasClick}
    />
  );
}

function SelectedLocationDetails({
  mapId,
  locationId,
  patchLocation,
  deleteLocation,
  updateMap,
}: {
  mapId: string;
  locationId: string;
  patchLocation: (
    locationId: string,
    fields: Partial<Pick<WorldMapLocation, 'name' | 'description'>>
  ) => void;
  deleteLocation: (locationId: string) => void;
  updateMap: (mutator: (prev: WorldMap) => WorldMap) => void;
}) {
  const location = useMapStore((s) => s.mapsById[mapId]?.locations.find((l) => l.id === locationId));
  const canDelete = useMapStore((s) => (s.mapsById[mapId]?.locations.length ?? 0) > 1);
  const otherLocations = useMapStore(
    useShallow((s) => s.mapsById[mapId]?.locations.filter((l) => l.id !== locationId) ?? [])
  );

  if (!location) {
    return null;
  }

  return (
    <div className="bordered-section mt-4 max-h-[45%] shrink-0 overflow-y-auto">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="block text-sm font-medium" htmlFor="map-location-name">
            Name
          </label>
          <input
            id="map-location-name"
            className="w-full border rounded-sm px-3 py-2 bg-inset"
            value={location.name}
            onChange={(event) => patchLocation(location.id, { name: event.target.value })}
            placeholder="Location name"
          />
        </div>
        <DeleteButton
          className="self-end"
          label="Delete location"
          disabled={!canDelete}
          confirmTitle="Delete Location"
          confirmLabel="Delete Location"
          confirmMessage={`Delete location "${location.name || 'Untitled Location'}"? This removes it from the map, its connections, and any zones.`}
          onConfirm={() => deleteLocation(location.id)}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="map-location-description">
          Description
        </label>
        <textarea
          id="map-location-description"
          className="w-full min-h-20 border rounded-sm px-3 py-2 bg-inset"
          value={location.description}
          onChange={(event) => patchLocation(location.id, { description: event.target.value })}
          placeholder="Location description"
        />
      </div>

      {otherLocations.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Adjacent Locations</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {otherLocations.map((targetLocation) => (
              <label
                key={targetLocation.id}
                className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 text-sm leading-5"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 translate-y-0.5 rounded-sm border-border-accent accent-focus-ring"
                  checked={location.adjacency.includes(targetLocation.id)}
                  onChange={(event) => {
                    updateMap((prev) =>
                      setMapAdjacency(prev, location.id, targetLocation.id, event.target.checked)
                    );
                  }}
                />
                <span>{targetLocation.name || 'Untitled Location'}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapGraphEditor({
  mapId,
  updateMap,
  charactersByLocationId,
  onCharacterClick,
  highlightedLocationIds,
  className = '',
}: {
  mapId: string;
  updateMap: (mutator: (prev: WorldMap) => WorldMap) => void;
  charactersByLocationId?: Record<string, Character[]> | undefined;
  onCharacterClick?: ((character: Character) => void) | undefined;
  highlightedLocationIds?: string[] | undefined;
  className?: string | undefined;
}) {
  const graphTheme = useGraphTheme();
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());

  const [hoveredLocationId, setHoveredLocationId] = useState<string | undefined>(undefined);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);

  const actives = useMemo(
    () => (highlightedLocationIds ?? []).concat(selectedLocationId ?? []).filter(Boolean),
    [highlightedLocationIds, selectedLocationId]
  );

  useEffect(() => {
    if (!hoveredLocationId) {
      return;
    }
    groupRefs.current.get(hoveredLocationId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [hoveredLocationId]);

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }
    groupRefs.current.get(selectedLocationId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedLocationId]);

  const toggleSelectedLocation = (locationId: string, { center }: { center?: boolean } = {}) => {
    setSelectedLocationId((previous) => {
      const next = previous === locationId ? undefined : locationId;
      if (next && center) {
        graphRef.current?.centerGraph([next]);
      }
      return next;
    });
  };

  const patchLocation = (
    locationId: string,
    fields: Partial<Pick<WorldMapLocation, 'name' | 'description'>>
  ) => {
    updateMap((prev) => ({
      ...prev,
      locations: prev.locations.map((location) =>
        location.id === locationId ? { ...location, ...fields } : location
      ),
    }));
  };

  const addLocation = () => {
    const location = createEmptyMapLocation();
    updateMap((prev) => ({ ...prev, locations: [location, ...prev.locations] }));
    setSelectedLocationId(location.id);
  };

  const deleteLocation = (locationId: string) => {
    setSelectedLocationId((current) => (current === locationId ? undefined : current));
    updateMap((prev) => removeMapLocation(prev, locationId));
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-sm border border-border-default bg-surface-soft">
          <div className="shrink-0 border-b border-border-default p-2">
            <button type="button" className="w-full" onClick={addLocation}>
              + Add Location
            </button>
          </div>

          <LocationEntriesBar
            mapId={mapId}
            charactersByLocationId={charactersByLocationId}
            selectedLocationId={selectedLocationId}
            hoveredLocationId={hoveredLocationId}
            groupRefs={groupRefs}
            toggleSelectedLocation={toggleSelectedLocation}
            setHoveredLocationId={setHoveredLocationId}
            onCharacterClick={onCharacterClick}
          />
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-sm border border-border-default bg-inset">
          <MapGraphCanvas
            mapId={mapId}
            graphRef={graphRef}
            actives={actives}
            graphTheme={graphTheme}
            onNodePointerOver={(node) => setHoveredLocationId(node.id)}
            onNodePointerOut={() => setHoveredLocationId(undefined)}
            onNodeClick={(node) => toggleSelectedLocation(node.id)}
            onCanvasClick={() => setSelectedLocationId(undefined)}
          />
        </div>
      </div>

      {selectedLocationId && (
        <SelectedLocationDetails
          mapId={mapId}
          locationId={selectedLocationId}
          patchLocation={patchLocation}
          deleteLocation={deleteLocation}
          updateMap={updateMap}
        />
      )}
    </div>
  );
}
