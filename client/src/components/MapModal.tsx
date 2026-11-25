import _ from 'lodash';
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useQueryParam } from '../util/queryParams.js';
import RoutedModalFrame from './ui/RoutedModalFrame.js';
import type { Character } from '../engine/types.js';
import { useActiveScenarioMap, useScenarioStore } from '../state/scenario_store.js';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { doAsDataRead, mainDatabase } from '../backend_bridge/database.js';
import type { ScenarioEvent, MovementPolicy } from '../engine/types.js';
import { useCharacterOverview } from './character_overview/CharacterOverviewContext.js';
import { useMapModal } from './MapModalContext.js';
import { useObjectEditor } from './object_editor/ObjectEditorContext.js';
import MapGraphEditor from './MapGraphEditor.js';
import MapZoneEditor from './map_zones/MapZoneEditor.js';
import { useMapStore } from '../state/map_store.js';
import CharacterAvatar from './CharacterAvatar.js';
import { useDraft } from '../hooks/useDraft.js';

const MOVEMENT_VERB: Record<MovementPolicy, string> = {
  teleport: 'teleported',
  jump: 'jumped',
  rush: 'rushed',
  casual: 'strolled',
};

function movementVerb(policy: MovementPolicy | undefined): string {
  return policy ? MOVEMENT_VERB[policy] : 'moved';
}

function EditFieldButton({ fieldLabel, onClick }: { fieldLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Edit ${fieldLabel}`}
      aria-label={`Edit ${fieldLabel}`}
      className="shrink-0 px-2! py-0.5! text-xs sm:text-sm leading-none"
    >
      ✎
    </button>
  );
}

/**
 * Shared inline editor for map metadata cards so name and description edits use one save/discard flow.
 */
function InlineEditableField({
  value,
  multiline = false,
  fieldLabel,
  placeholder,
  inputClassName,
  onSave,
  children,
}: {
  value: string;
  multiline?: boolean | undefined;
  fieldLabel: string;
  placeholder: string;
  inputClassName: string;
  onSave: (nextValue: string) => void;
  children: (startEditing: () => void) => ReactNode;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useDraft(value);

  const startEditing = () => {
    setDraft(value);
    setIsEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const save = () => {
    onSave(draft);
    setIsEditing(false);
  };

  if (!isEditing) {
    return <>{children(startEditing)}</>;
  }

  return (
    <div className={`flex w-full gap-1.5 ${multiline ? 'items-start' : 'items-center'}`}>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              save();
            }
          }}
          placeholder={placeholder}
          aria-label={fieldLabel}
          autoFocus
          className={inputClassName}
        />
      ) : (
        <input
          type="text"
          value={draft}
          size={Math.max(18, Math.min(draft.length + 2, 60))}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            } else if (e.key === 'Enter') {
              save();
            }
          }}
          placeholder={placeholder}
          aria-label={fieldLabel}
          autoFocus
          className={inputClassName}
        />
      )}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={save}
          title={`Save ${fieldLabel}`}
          aria-label={`Save ${fieldLabel}`}
          className="button-emphasized px-2! py-0.5! text-xs sm:text-sm leading-none"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={cancel}
          title={`Discard ${fieldLabel}`}
          aria-label={`Discard ${fieldLabel}`}
          className="px-2! py-0.5! text-xs sm:text-sm leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function MapModalInner() {
  const { closeMap, open, mapId: explicitMapId } = useMapModal();
  const { openMapObjectEditor } = useObjectEditor();
  const updateMap = useMapStore((s) => s.updateMap);
  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const explicitMap = useMapStore((s) => (explicitMapId ? s.mapsById[explicitMapId] : undefined));
  const activeScenarioMap = useActiveScenarioMap();
  const isGlobalContext = explicitMapId !== undefined;
  const targetMap = isGlobalContext ? explicitMap : activeScenarioMap;
  const mapId = targetMap?.id;
  const mapName = targetMap?.name;
  const mapDescription = targetMap?.description;
  const emptyMapMessage = isGlobalContext
    ? mapsAreLoaded
      ? 'Map not found.'
      : 'Loading map...'
    : 'No map available.';
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const { showCharacterOverview } = useCharacterOverview();

  const [viewParam, setViewParam] = useQueryParam('mapview');
  const view =
    viewParam === 'zones' ? 'zones' : !isGlobalContext && viewParam === 'log' ? 'log' : 'characters';
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
          {!isGlobalContext && (
            <button
              type="button"
              className={view === 'log' ? 'button-emphasized' : ''}
              onClick={() => setView('log')}
            >
              Movement
            </button>
          )}
          <button
            type="button"
            disabled={!mapId}
            onClick={() => {
              if (mapId) {
                openMapObjectEditor(mapId);
              }
            }}
          >
            🤖 AI Edit
          </button>
        </>
      }
    >
      {view === 'zones' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {mapId ? (
            <MapZoneEditor
              mapId={mapId}
              isGlobalContext={isGlobalContext}
              updateMap={(mutator) => updateMap(mapId, mutator)}
            />
          ) : (
            <div className="text-sm text-muted">{emptyMapMessage}</div>
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
            charactersByLocationId={isGlobalContext ? undefined : charactersByLocationId}
            onCharacterClick={isGlobalContext ? undefined : showCharacter}
            leadingElement={({ addLocation }) => (
              <>
                <div className="shrink-0 flex flex-col items-start gap-2 rounded-sm border border-border-default bg-inset p-2.5">
                  <InlineEditableField
                    key={`name-${mapId}`}
                    value={mapName ?? ''}
                    fieldLabel="map name"
                    placeholder="Map name"
                    inputClassName="min-w-44 flex-1 border border-border-strong rounded-sm px-2 py-1 text-sm sm:text-base font-semibold bg-surface-soft"
                    onSave={(name) => updateMap(mapId, (prev) => ({ ...prev, name }))}
                  >
                    {(startEditing) => (
                      <div className="flex w-full items-center justify-between gap-2">
                        <h2 className="text-base sm:text-lg font-semibold leading-tight whitespace-nowrap">
                          {mapName || 'Untitled Map'}
                        </h2>
                        <EditFieldButton fieldLabel="map name" onClick={startEditing} />
                      </div>
                    )}
                  </InlineEditableField>

                  <button
                    type="button"
                    onClick={addLocation}
                    className="button-emphasized w-full px-2.5! py-1! text-xs sm:text-sm font-medium whitespace-nowrap"
                  >
                    Add Location
                  </button>
                </div>

                <div className="shrink-0 w-64 sm:w-72 flex flex-col gap-2 rounded-sm border border-border-default bg-inset p-2.5">
                  <InlineEditableField
                    key={`description-${mapId}`}
                    value={mapDescription ?? ''}
                    multiline
                    fieldLabel="map description"
                    placeholder="Describe the world setting..."
                    inputClassName="min-w-0 flex-1 min-h-20 border border-border-strong rounded-sm px-2 py-1 text-xs sm:text-sm bg-surface-soft resize-y"
                    onSave={(description) => updateMap(mapId, (prev) => ({ ...prev, description }))}
                  >
                    {(startEditing) => (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">Description</h3>
                          <EditFieldButton fieldLabel="map description" onClick={startEditing} />
                        </div>
                        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs sm:text-sm text-secondary">
                          {mapDescription || <span className="text-muted">No description.</span>}
                        </div>
                      </>
                    )}
                  </InlineEditableField>
                </div>
              </>
            )}
          />
        ) : (
          <div className="text-sm text-muted">{emptyMapMessage}</div>
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
