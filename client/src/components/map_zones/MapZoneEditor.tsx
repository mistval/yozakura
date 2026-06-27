import * as Database from '../../backend_bridge/database.js';
import { useMemo, useState } from 'react';
import { GraphCanvas } from 'reagraph';
import { useGraphTheme } from '../../theme/graph_themes.js';
import type { MapZone, WorldMap } from '../../engine/types.js';
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
  map,
  updateMap,
  mapClasses = [],
}: {
  isGlobalContext: boolean;
  map: WorldMap;
  updateMap: (mutator: (prev: WorldMap) => WorldMap) => void;
  mapClasses?: string[];
}) {
  const graphTheme = useGraphTheme();
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>(undefined);
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

            {!isGlobalContext && (
              <div className="space-y-1">
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
        className={`relative min-w-0 flex-1 overflow-hidden rounded-sm border border-border-default bg-inset ${mapClasses.join(' ')}`}
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
