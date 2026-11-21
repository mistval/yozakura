import _ from 'lodash';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQueryParam } from '../util/queryParams.js';
import RoutedModalFrame from './ui/RoutedModalFrame.js';
import type { Character } from '../engine/types.js';
import { useActiveScenarioMap, useScenarioStore } from '../state/scenario_store.js';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { doAsDataRead, mainDatabase } from '../backend_bridge/database.js';
import type { ScenarioEvent, MovementPolicy } from '../engine/types.js';
import { useCharacterOverview } from './character_overview/CharacterOverviewContext.js';
import { useMapModal } from './MapModalContext.js';
import MapGraphEditor from './MapGraphEditor.js';
import MapZoneEditor from './map_zones/MapZoneEditor.js';
import DeleteButton from './ui/DeleteButton.js';
import { useMapStore } from '../state/map_store.js';
import CharacterAvatar from './CharacterAvatar.js';

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
  const numMaps = useMapStore((s) => s.maps.length);
  const activeMap = useActiveScenarioMap();
  const mapId = activeMap?.id;
  const mapName = activeMap?.name;
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const { showCharacterOverview } = useCharacterOverview();

  const [viewParam, setViewParam] = useQueryParam('mapview');
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
        const result = await doAsDataRead(
          () => mainDatabase.loadScenarioEventPage(scenario.id, logPage - 1),
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

  const showCharacter = (character: Character) => {
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
      maxWidthClassName="max-w-none"
      panelClassName="flex h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] flex-col overflow-hidden"
      headerActions={
        <>
          <button
            type="button"
            className={view === 'characters' ? 'button-emphasized' : ''}
            onClick={() => setView('characters')}
          >
            Location
          </button>
          <button
            type="button"
            className={view === 'zones' ? 'button-emphasized' : ''}
            onClick={() => setView('zones')}
          >
            Zone
          </button>
          <button
            type="button"
            className={view === 'log' ? 'button-emphasized' : ''}
            onClick={() => setView('log')}
          >
            Movement
          </button>
        </>
      }
    >
      {view === 'zones' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {mapId && (
            <MapZoneEditor
              mapId={mapId}
              isGlobalContext={false}
              updateMap={(mutator) => updateMap(mapId, mutator)}
            />
          )}
        </div>
      )}

      {view === 'log' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                      <CharacterAvatar
                        imagePath={character?.imagePath}
                        name={entry.characterName}
                        className="h-8 w-8"
                      />
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
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-default pt-3">
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
        (mapId ? (
          <MapGraphEditor
            className="min-h-0 flex-1"
            mapId={mapId}
            updateMap={(mutator) => updateMap(mapId, mutator)}
            charactersByLocationId={charactersByLocationId}
            onCharacterClick={showCharacter}
            leadingElement={({ addLocation }) => (
              <div className="shrink-0 flex flex-col items-start gap-2 rounded-sm border border-border-default bg-inset p-2.5 max-w-52">
                <h2 className="text-base sm:text-lg font-semibold leading-tight wrap-break-word">
                  {mapName || 'Loading...'}
                </h2>

                <button
                  type="button"
                  onClick={addLocation}
                  className="w-full px-2.5! py-1! text-xs sm:text-sm whitespace-nowrap"
                >
                  Add Location
                </button>
                <DeleteButton
                  label="Delete map"
                  buttonText="Delete Map"
                  disabled={numMaps <= 1}
                  confirmTitle="Delete Map"
                  confirmLabel="Delete Map"
                  confirmMessage={`Delete map "${mapName}"? This will permanently remove the map, and this scenario will switch to another one.`}
                  className="w-full px-2.5! py-1! text-xs sm:text-sm whitespace-nowrap bg-danger-solid! border-danger-border-accent!"
                  onConfirm={() => useMapStore.getState().deleteMap(mapId)}
                />
              </div>
            )}
          />
        ) : (
          <div className="text-sm text-muted">No map available.</div>
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
