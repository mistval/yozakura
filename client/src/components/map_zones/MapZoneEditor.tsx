import * as Database from '../../backend_bridge/database.js';
import { useEffect, useMemo, useState } from 'react';
import { GraphCanvas } from 'reagraph';
import { useGraphTheme } from '../../theme/graph_themes.js';
import type { MapZone, WardrobeTrigger, WorldMap } from '../../engine/types.js';
import DeleteButton from '../ui/DeleteButton.js';
import InfoTooltip from './../ui/InfoTooltip';
import { useCharacterGroupStore } from '../../state/character_group_store.js';
import {
  concatUniqueById,
  findById,
  findRequiredById,
  removeById,
  removeByIdentity,
} from '../../util/array.js';
import { assertNonNullish } from '../../errors/application_error.js';
import { useCharacterOverview } from '../character_overview/CharacterOverviewContext.js';
import { useMapModal } from '../MapModalContext.js';
import { useDraft } from '../../hooks/useDraft.js';
import { formatWardrobeTriggers, parseWardrobeTriggers } from '../../engine/wardrobes.js';
import { useMapStore } from '../../state/map_store.js';

function ZoneWardrobeTriggersInput({
  triggers,
  onChange,
}: {
  triggers: WardrobeTrigger[];
  onChange: (nextTriggers: WardrobeTrigger[]) => void;
}) {
  const sourceString = useMemo(() => formatWardrobeTriggers(triggers ?? []), [triggers]);
  const [draft, setDraft] = useDraft(sourceString);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setErrors([]);
  }, [sourceString]);

  const handleBlur = () => {
    const { triggers: parsedTriggers, errors: parseErrors } = parseWardrobeTriggers(draft);
    setErrors(parseErrors);
    if (parseErrors.length === 0) {
      onChange(parsedTriggers);
      setDraft(formatWardrobeTriggers(parsedTriggers));
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="block text-sm font-medium" htmlFor="zone-wardrobe-triggers">
          Wardrobe Triggers
        </label>
        <InfoTooltip
          label="Wardrobe Triggers"
          html='Comma-separated wardrobe triggers applied when a character in this zone begins a chat (e.g. <code>disable:*,enable:work_uniform,enable_one:work_tie</code>). Use <code>disable:*</code> to disable all wardrobes. Tokens without a command prefix default to <code>enable</code> (e.g. <code>work_uniform</code> becomes <code>enable:work_uniform</code>). For details, see the <a href="https://mistval.github.io/yozakura/docs/wardrobes">Wardrobes documentation</a>.'
        />
      </div>
      <input
        id="zone-wardrobe-triggers"
        className={`w-full border rounded-sm px-3 py-2 bg-inset ${errors.length > 0 ? 'border-red-500' : ''}`}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (errors.length > 0) {
            setErrors([]);
          }
        }}
        onBlur={handleBlur}
        placeholder="e.g. disable:casual_clothes,enable:work_uniform,enable_one:work_tie"
      />
      {errors.length > 0 && (
        <div className="text-xs text-red-500 space-y-0.5">
          {errors.map((error, idx) => (
            <div key={idx}>{error}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export type ZoneEdits = Partial<Pick<MapZone, 'name' | 'locationIds'>>;

function editZone(zones: MapZone[], zoneUpdate: Partial<MapZone> & Pick<MapZone, 'id'>) {
  const targetZone = findRequiredById(zones, zoneUpdate.id);
  return concatUniqueById(zones, {
    ...targetZone,
    ...zoneUpdate,
  });
}

export default function MapZoneEditor({
  isGlobalContext,
  mapId,
  updateMap,
  mapClasses = [],
}: {
  isGlobalContext: boolean;
  mapId: string;
  updateMap: (mutator: (prev: WorldMap) => WorldMap) => void;
  mapClasses?: string[];
}) {
  const map = useMapStore((s) => s.mapsById[mapId]);
  assertNonNullish(map);

  const graphTheme = useGraphTheme();
  const { closeMap } = useMapModal();
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>(undefined);
  const { showCharacterOverview, open: characterOverviewIsOpen } = useCharacterOverview();
  const groups = useCharacterGroupStore((s) => s.groups);
  const selectedZone = findById(map.zones, selectedZoneId ?? '');
  const zoneMembers = selectedZone?.locationIds ?? [];

  const toggleZoneSelection = (zoneId: string) => {
    setSelectedZoneId((current) => (current === zoneId ? undefined : zoneId));
  };

  const graph = useMemo(() => {
    const nodes = map.locations.map((location) => ({
      id: location.id,
      label: location.name,
    }));

    const edges = map.locations.flatMap((location) =>
      location.adjacency.map((targetId) => ({
        id: `${location.id}->${targetId}`,
        source: location.id,
        target: targetId,
      }))
    );

    return { nodes, edges };
  }, [map.locations, zoneMembers]);

  const privateZoneSet = useMemo(() => {
    return new Set(groups.flatMap((g) => g.privateZones));
  }, [groups]);

  const toggleLocationMembership = (locationId: string) => {
    if (!selectedZone) {
      return;
    }

    updateMap((prev) => {
      const editTarget = findRequiredById(prev.zones, selectedZone.id);
      const nextLocationIds = editTarget.locationIds.includes(locationId)
        ? removeByIdentity(editTarget.locationIds, locationId)
        : editTarget.locationIds.concat(locationId);

      return {
        ...prev,
        zones: editZone(prev.zones, { id: selectedZone.id, locationIds: nextLocationIds }),
      };
    });
  };

  const addZone = () => {
    const newZone = Database.createPersistedObject({
      name: 'New Zone',
      locationIds: [],
      wardrobeTriggers: [],
    });

    updateMap((prev) => {
      const newZones = prev.zones.concat(newZone);

      return {
        ...prev,
        zones: newZones,
      };
    });

    setSelectedZoneId(newZone.id);
  };

  const changeZoneName = (newName: string) => {
    assertNonNullish(selectedZone, 'No selected zone');

    updateMap((prev) => {
      const editTarget = findRequiredById(prev.zones, selectedZone.id);

      return {
        ...prev,
        zones: editZone(prev.zones, {
          id: editTarget.id,
          name: newName,
        }),
      };
    });
  };

  const changeZoneWardrobeTriggers = (newTriggers: WardrobeTrigger[]) => {
    assertNonNullish(selectedZone, 'No selected zone');

    updateMap((prev) => {
      const editTarget = findRequiredById(prev.zones, selectedZone.id);

      return {
        ...prev,
        zones: editZone(prev.zones, {
          id: editTarget.id,
          wardrobeTriggers: newTriggers,
        }),
      };
    });
  };

  const deleteZone = () => {
    assertNonNullish(selectedZone, 'No selected zone');
    setSelectedZoneId(undefined);

    updateMap((prev) => {
      return {
        ...prev,
        zones: removeById(prev.zones, selectedZone.id),
      };
    });
  };

  const togglePrivateGroup = (groupId: string) => {
    if (!selectedZone) {
      return;
    }

    // TODO: Should clean up the private zone array on scenario characters lazily sometime
    useCharacterGroupStore.getState().togglePrivateMapZone(groupId, selectedZone.id);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {map.zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={zone.id === selectedZoneId ? 'button-emphasized' : ''}
              onClick={() => toggleZoneSelection(zone.id)}
            >
              {zone.name || 'Untitled Zone'}
              {privateZoneSet.has(zone.id) ? ' 🔒' : ''}
            </button>
          ))}
          <button type="button" onClick={addZone}>
            + Add Zone
          </button>
        </div>

        {selectedZone && (
          <div className="bordered-section space-y-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="zone-name">
                Zone Name
              </label>
              <div className="flex gap-2">
                <input
                  id="zone-name"
                  className="w-full border rounded-sm px-3 py-2 bg-inset"
                  value={selectedZone.name}
                  onChange={(event) => changeZoneName(event.target.value)}
                  placeholder="Zone name"
                />
                <DeleteButton
                  label="Delete zone"
                  confirmTitle="Delete Zone"
                  confirmLabel="Delete Zone"
                  confirmMessage={`Delete zone "${selectedZone.name || 'Untitled Zone'}"? Any schedule segments that use it will be removed.`}
                  onConfirm={deleteZone}
                />
              </div>
            </div>

            <ZoneWardrobeTriggersInput
              triggers={selectedZone.wardrobeTriggers ?? []}
              onChange={changeZoneWardrobeTriggers}
            />

            {!isGlobalContext && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-sm font-medium">Private to groups</div>
                  <InfoTooltip
                    label="About batch size"
                    html="If any groups are selected here, only members of these groups will be allowed to enter this zone (even if other groups have schedules that want them to be here)."
                  />
                </div>
                {groups.length === 0 ? (
                  <div className="text-sm text-muted">No character groups yet.</div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {groups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-sm border-border-accent accent-focus-ring"
                          checked={group.privateZones.includes(selectedZone.id)}
                          onChange={() => togglePrivateGroup(group.id)}
                        />
                        <span>{group.name || 'Untitled Group'}</span>
                      </label>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    if (characterOverviewIsOpen) {
                      closeMap();
                    }

                    showCharacterOverview({
                      target: 'groups',
                    });
                  }}
                >
                  🙋‍♂️ Create Character Group
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedZone && (
        <div className="text-xs text-muted">
          Click a location on the map to toggle whether it's part of this zone.
        </div>
      )}

      <div
        className={`relative min-w-0 flex-1 min-h-[600px] overflow-hidden rounded-sm border border-border-default bg-inset ${mapClasses.join(' ')}`}
      >
        {graph.nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            No locations to display.
          </div>
        ) : (
          <GraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            theme={graphTheme}
            actives={selectedZone?.locationIds ?? []}
            onNodeClick={(node) => toggleLocationMembership(node.id)}
          />
        )}
      </div>
    </div>
  );
}
