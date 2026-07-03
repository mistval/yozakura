import _ from 'lodash';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { StringParam, useQueryParam } from 'use-query-params';
import RoutedModalFrame from './ui/RoutedModalFrame.js';
import type { Character } from '../engine/types.js';
import { useScenarioStore } from '../state/scenario_store.js';
import { useScenarioCharacterStore, useUserCharacter } from '../state/scenario_character_store.js';
import * as Database from '../backend_bridge/database.js';
import type { ScenarioEvent, MovementPolicy } from '../engine/types.js';
import { useCharacterOverview } from './character_overview/CharacterOverviewContext.js';
import { useMapModal } from './MapModalContext.js';
import MapGraphEditor from './MapGraphEditor.js';
import MapZoneEditor from './map_zones/MapZoneEditor.js';
import DeleteButton from './ui/DeleteButton.js';
import { useMapStore } from '../state/map_store.js';

const MOVEMENT_VERB: Record<MovementPolicy, string> = {
  teleport: 'teleported',
  jump: 'jumped',
  rush: 'rushed',
  casual: 'strolled',
};

function movementVerb(policy: MovementPolicy | undefined): string {
  return policy ? MOVEMENT_VERB[policy] : 'moved';
}

function MapModalInner() {
  const { closeMap, open } = useMapModal();
  const updateMap = useMapStore((s) => s.updateMap);
  const maps = useMapStore((s) => s.maps);
  const map = useScenarioStore((state) => state.activeScenarioMap);
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const user = useUserCharacter();
  const { showCharacterOverview, open: characterOverviewIsOpen } = useCharacterOverview();

  const [viewParam, setViewParam] = useQueryParam('mapview', StringParam);
  const view = viewParam === 'zones' ? 'zones' : viewParam === 'log' ? 'log' : 'characters';
  const setView = (next: 'characters' | 'zones' | 'log') =>
    setViewParam(next === 'characters' ? undefined : next);

  const [logPage, setLogPage] = useState(1);
  const [logEntries, setLogEntries] = useState<ScenarioEvent[]>([]);
  const [logHasNextPage, setLogHasNextPage] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    setLogPage(1);
  }, [scenario?.id, view]);

  useEffect(() => {
    if (!open) {
      setViewParam(undefined);
    }
  }, [open]);

  useEffect(() => {
    if (view !== 'log' || !scenario || !open) {
      return;
    }

    let cancelled = false;
    setLogLoading(true);
    void (async () => {
      try {
        const result = await Database.doAsDataRead(
          () => Database.loadScenarioEventPage(scenario.id, logPage),
          'scenario_event_log'
        );
        if (!cancelled) {
          setLogEntries(result.entries);
          setLogHasNextPage(result.hasNextPage);
        }
      } finally {
        if (!cancelled) {
          setLogLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view, scenario?.id, logPage, open]);

  const charactersByLocationId = useMemo(() => {
    const groups = _.groupBy(Object.values(charactersById), 'locationId');
    return _.mapValues(groups, (characters) =>
      characters.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    );
  }, [charactersById]);

  const highlightedLocationIds = useMemo(
    () => (user?.locationId ? [user.locationId] : []),
    [user?.locationId]
  );

  const showCharacter = (character: Character) => {
    if (characterOverviewIsOpen) {
      // TODO: Quick fix for inability to control query param ordering via useQuery
      closeMap();
    }

    showCharacterOverview({
      selectedIds: [character.id],
      scrolldown: true,
      target: 'character',
    });
  };

  return (
    <RoutedModalFrame
      queryParam="map"
      onClose={closeMap}
      showClose={false}
      maxWidthClassName="max-w-none"
      panelClassName="flex h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)] flex-col overflow-hidden p-0! space-y-0!"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{map?.name || 'Loading...'}</h2>
          {map && (
            <DeleteButton
              label="Delete map"
              disabled={maps.length <= 1}
              confirmTitle="Delete Map"
              confirmLabel="Delete Map"
              confirmMessage={`Delete map "${map.name}"? This will permanently remove the map, and this scenario will switch to another one.`}
              onConfirm={() => useMapStore.getState().deleteMap(map.id)}
            />
          )}
        </div>
        <div className="inline-flex gap-2 rounded-sm border border-border-default bg-surface-frosted p-1 shadow-xs backdrop-blur-sm">
          <button
            type="button"
            className={view === 'characters' ? 'button-emphasized' : ''}
            onClick={() => setView('characters')}
          >
            Characters
          </button>
          <button
            type="button"
            className={view === 'zones' ? 'button-emphasized' : ''}
            onClick={() => setView('zones')}
          >
            Zones
          </button>
          <button
            type="button"
            className={view === 'log' ? 'button-emphasized' : ''}
            onClick={() => setView('log')}
          >
            Movement Log
          </button>
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

      {view === 'zones' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {map && (
            <MapZoneEditor
              map={map}
              isGlobalContext={false}
              updateMap={(mutator) => updateMap(map.id, mutator)}
            />
          )}
        </div>
      )}

      {view === 'log' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {logLoading && logEntries.length === 0 && (
              <div className="text-sm text-secondary">Loading movements...</div>
            )}
            {!logLoading && logEntries.length === 0 && (
              <div className="text-sm text-muted">No movements recorded yet.</div>
            )}
            <div className="space-y-2">
              {logEntries.map((entry, index) => {
                const character = charactersById[entry.characterId];
                const previous = logEntries[index - 1];
                const showTurnHeader = !previous || previous.turnNumber !== entry.turnNumber;
                return (
                  <Fragment key={entry.id}>
                    {showTurnHeader && (
                      <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        {entry.turnNumber === undefined ? 'Unknown turn' : `Turn ${entry.turnNumber}`}
                      </div>
                    )}
                    <div className="flex items-center gap-2 rounded-sm border border-border-default bg-inset p-2">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border-default bg-emphasized">
                        {character && (
                          <img
                            src={character.imagePath}
                            alt={entry.characterName}
                            className="h-full w-full object-cover object-top"
                          />
                        )}
                      </div>
                      <div className="min-w-0 text-sm">
                        <span className="font-medium">{entry.characterName}</span>{' '}
                        {movementVerb(entry.movementPolicy)} from {entry.fromLocationName} to{' '}
                        {entry.toLocationName}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {(logPage > 1 || logHasNextPage) && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-default px-4 py-3">
              <span className="mr-auto text-sm text-muted">Page {logPage}</span>
              <button
                type="button"
                disabled={logLoading || logPage <= 1}
                onClick={() => setLogPage((page) => Math.max(1, page - 1))}
              >
                Previous Page
              </button>
              <button
                type="button"
                disabled={logLoading || !logHasNextPage}
                onClick={() => setLogPage((page) => page + 1)}
              >
                Next Page
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'characters' &&
        (map ? (
          <MapGraphEditor
            className="min-h-0 flex-1 p-4"
            map={map}
            updateMap={(mutator) => updateMap(map.id, mutator)}
            charactersByLocationId={charactersByLocationId}
            onCharacterClick={showCharacter}
            highlightedLocationIds={highlightedLocationIds}
          />
        ) : (
          <div className="p-4 text-sm text-muted">No map available.</div>
        ))}
    </RoutedModalFrame>
  );
}

export default function MapModal() {
  const { open } = useMapModal();

  if (!open) {
    return;
  }

  // Optimization so this isn't rendering when not open
  return <MapModalInner />;
}
