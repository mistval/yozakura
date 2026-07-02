import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraphCanvas, type GraphCanvasRef } from 'reagraph';
import { useGraphTheme } from '../theme/graph_themes.js';
import type { Character, WorldMap, WorldMapLocation } from '../engine/types.js';
import { createEmptyMapLocation } from '../engine/map/map_factories.js';
import { removeMapLocation, setMapAdjacency } from '../engine/map/world_map.js';
import DeleteButton from './ui/DeleteButton.js';

function CharacterAvatar({
  character,
  interactive,
  onClick,
}: {
  character: Character;
  interactive?: boolean;
  onClick?: (e: React.MouseEvent) => void;
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

export default function MapGraphEditor({
  map,
  updateMap,
  charactersByLocationId,
  onCharacterClick,
  highlightedLocationIds,
  className = '',
}: {
  map: WorldMap;
  updateMap: (mutator: (prev: WorldMap) => WorldMap) => void;
  charactersByLocationId?: Record<string, Character[]>;
  onCharacterClick?: (character: Character) => void;
  highlightedLocationIds?: string[];
  className?: string;
}) {
  const graphTheme = useGraphTheme();
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());

  const [hoveredLocationId, setHoveredLocationId] = useState<string | undefined>(undefined);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);

  const showCharacters = charactersByLocationId !== undefined;

  // Locations with characters in them are shown first when characters are displayed.
  const locationEntries = useMemo(() => {
    const entries = map.locations.map((location) => ({
      location,
      characters: charactersByLocationId?.[location.id] ?? [],
    }));

    if (!showCharacters) {
      return entries;
    }

    return entries.sort((a, b) => (a.characters.length > 0 ? 0 : 1) - (b.characters.length > 0 ? 0 : 1));
  }, [map.locations, charactersByLocationId]);

  const graph = useMemo(() => {
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
    return { nodes, edges };
  }, [map.locations]);

  const actives = useMemo(
    () => (highlightedLocationIds ?? []).concat(selectedLocationId ?? []).filter(Boolean),
    [highlightedLocationIds, selectedLocationId]
  );

  const selectedLocation = map.locations.find((location) => location.id === selectedLocationId);

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

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 scrollbar-none">
            {locationEntries.map(({ location, characters }) => {
              const isSelected = selectedLocationId === location.id;
              const isHovered = hoveredLocationId === location.id;
              const ringClass = isSelected
                ? 'ring-2 ring-success-ring border-transparent'
                : isHovered
                  ? 'ring-2 ring-focus-ring border-transparent'
                  : 'border-border-default';

              return (
                <div
                  key={location.id}
                  ref={(node) => {
                    if (node) {
                      groupRefs.current.set(location.id, node);
                    } else {
                      groupRefs.current.delete(location.id);
                    }
                  }}
                  className={`cursor-pointer space-y-2 rounded-sm border bg-inset p-3 transition-shadow ${ringClass}`}
                  onClick={() => toggleSelectedLocation(location.id, { center: true })}
                  onMouseEnter={() => setHoveredLocationId(location.id)}
                  onMouseLeave={() =>
                    setHoveredLocationId((current) => (current === location.id ? undefined : current))
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold">{location.name || 'Untitled Location'}</h3>
                    {showCharacters && (
                      <span className="shrink-0 text-xs text-muted">{characters.length}</span>
                    )}
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
                      {location.description || <span className="text-muted">No description.</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-sm border border-border-default bg-inset">
          {graph.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              No locations to display.
            </div>
          ) : (
            <GraphCanvas
              ref={graphRef}
              nodes={graph.nodes}
              edges={graph.edges}
              theme={graphTheme}
              actives={actives}
              onNodePointerOver={(node) => setHoveredLocationId(node.id)}
              onNodePointerOut={() => setHoveredLocationId(undefined)}
              onNodeClick={(node) => toggleSelectedLocation(node.id)}
              onCanvasClick={() => setSelectedLocationId(undefined)}
            />
          )}
        </div>
      </div>

      {selectedLocation && (
        <div className="bordered-section mt-4 max-h-[45%] shrink-0 overflow-y-auto">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="block text-sm font-medium" htmlFor="map-location-name">
                Name
              </label>
              <input
                id="map-location-name"
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={selectedLocation.name}
                onChange={(event) => patchLocation(selectedLocation.id, { name: event.target.value })}
                placeholder="Location name"
              />
            </div>
            <DeleteButton
              className="self-end"
              label="Delete location"
              disabled={map.locations.length <= 1}
              confirmTitle="Delete Location"
              confirmLabel="Delete Location"
              confirmMessage={`Delete location "${selectedLocation.name || 'Untitled Location'}"? This removes it from the map, its connections, and any zones.`}
              onConfirm={() => deleteLocation(selectedLocation.id)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="map-location-description">
              Description
            </label>
            <textarea
              id="map-location-description"
              className="w-full min-h-20 border rounded-sm px-3 py-2 bg-inset"
              value={selectedLocation.description}
              onChange={(event) => patchLocation(selectedLocation.id, { description: event.target.value })}
              placeholder="Location description"
            />
          </div>

          {map.locations.length > 1 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Adjacent Locations</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {map.locations
                  .filter((entry) => entry.id !== selectedLocation.id)
                  .map((targetLocation) => (
                    <label
                      key={targetLocation.id}
                      className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 text-sm leading-5"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 translate-y-0.5 rounded-sm border-border-accent accent-focus-ring"
                        checked={selectedLocation.adjacency.includes(targetLocation.id)}
                        onChange={(event) => {
                          updateMap((prev) =>
                            setMapAdjacency(
                              prev,
                              selectedLocation.id,
                              targetLocation.id,
                              event.target.checked
                            )
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
      )}
    </div>
  );
}
