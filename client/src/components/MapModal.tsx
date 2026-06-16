import _ from 'lodash';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraphCanvas, type GraphCanvasRef } from 'reagraph';
import RoutedModalFrame from './ui/RoutedModalFrame.js';
import { useGraphTheme } from '../theme/graph_themes.js';
import type { Character } from '../engine/types.js';
import { useScenarioStore } from '../state/scenario_store.js';
import { useScenarioCharacterStore, useUserCharacter } from '../state/scenario_character_store.js';
import { useCharacterOverview } from './character_overview/CharacterOverviewContext.js';
import { useMapModal } from './MapModalContext.js';

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

export default function MapModal() {
  const { closeMap } = useMapModal();
  const map = useScenarioStore((state) => state.activeScenarioMap);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const user = useUserCharacter();
  const graphTheme = useGraphTheme();
  const { showCharacterOverview } = useCharacterOverview();

  const graphRef = useRef<GraphCanvasRef | null>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());

  const [hoveredLocationId, setHoveredLocationId] = useState<string | undefined>(undefined);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);

  // Characters grouped by location, ordered to match the map's location list.
  // Only locations that actually contain characters are shown.
  const locationGroups = useMemo(() => {
    if (!map) {
      return [];
    }

    const charactersByLocationId = _.groupBy(Object.values(charactersById), 'locationId');

    return map.locations
      .map((location) => ({
        location,
        characters: (charactersByLocationId[location.id] ?? []).sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        ),
      }))
      .sort((a, b) => (a.characters.length > 0 ? 0 : 1) - (b.characters.length > 0 ? 0 : 1));
  }, [map, charactersById]);

  const graph = useMemo(() => {
    const locations = map?.locations ?? [];
    const nodes = locations.map((location) => ({
      id: location.id,
      label: location.name || 'Untitled',
    }));
    const edges = locations.flatMap((location) =>
      location.adjacency.map((targetId) => ({
        id: `${location.id}->${targetId}`,
        source: location.id,
        target: targetId,
      }))
    );
    return { nodes, edges };
  }, [map]);

  const actives = useMemo(
    () => [user?.locationId, selectedLocationId].filter((id): id is string => Boolean(id)),
    [user?.locationId, selectedLocationId]
  );

  const selectedLocation = useMemo(
    () =>
      selectedLocationId ? (map?.locations.find((l) => l.id === selectedLocationId) ?? undefined) : undefined,
    [selectedLocationId, map]
  );

  useEffect(() => {
    if (!hoveredLocationId) {
      return;
    }
    groupRefs.current.get(hoveredLocationId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [hoveredLocationId]);

  const toggleSelectedLocation = (locationId: string, { center }: { center?: boolean } = {}) => {
    setSelectedLocationId((previous) => {
      const next = previous === locationId ? undefined : locationId;
      if (next && center) {
        graphRef.current?.centerGraph([next]);
      }
      return next;
    });
  };

  return (
    <RoutedModalFrame
      queryParam="map"
      onClose={closeMap}
      showClose={false}
      maxWidthClassName="max-w-6xl"
      panelClassName="flex h-[88vh] flex-col overflow-hidden p-0! space-y-0!"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3">
        <h2 className="text-xl font-semibold">Map</h2>
        <div className="inline-flex gap-2 rounded-sm border border-border-default bg-surface-frosted p-1 shadow-xs backdrop-blur-sm">
          <button
            type="button"
            className="button-emphasized"
            onClick={closeMap}
            aria-label="Close"
            title="Close"
          >
            X
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="w-72 shrink-0 space-y-3 overflow-y-auto pr-1 scrollbar-none">
          {locationGroups.length === 0 && <div className="text-sm text-muted">No locations to display.</div>}
          {locationGroups.map(({ location, characters }) => {
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
                  <span className="shrink-0 text-xs text-muted">{characters.length}</span>
                </div>
                <div className="space-y-2">
                  {characters.length === 0 ? (
                    <div className="text-sm text-muted">Nobody is here.</div>
                  ) : (
                    characters.map((character) => (
                      <CharacterAvatar
                        key={character.id}
                        character={character}
                        interactive={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            showCharacterOverview({ selectedIds: [character.id], scrolldown: true });
                          } else {
                            toggleSelectedLocation(location.id, { center: true });
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
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
        <div className="shrink-0 border-t border-border-default px-4 py-3 space-y-1">
          <div className="font-semibold">{selectedLocation.name || 'Untitled Location'}</div>
          {selectedLocation.description && (
            <div className="text-sm text-secondary">{selectedLocation.description}</div>
          )}
        </div>
      )}
    </RoutedModalFrame>
  );
}
