import { useMemo, useState } from 'react';
import { GraphCanvas } from 'reagraph';
import { useGraphTheme } from '../../theme/graph_themes.js';
import type { MapZone, ScenarioCharacterGroup, WorldMapLocation } from '../../engine/types.js';
import DeleteButton from '../ui/DeleteButton.js';
import InfoTooltip from './../ui/InfoTooltip';

export type ZoneEdits = Partial<Pick<MapZone, 'name' | 'locationIds' | 'privateToGroupIds'>>;

export type ZoneEditorController = {
  zones: MapZone[];
  groups: ScenarioCharacterGroup[];
  ready: boolean;
  allowPrivate: boolean;
  allowResync: boolean;
  mapClasses?: string[];
  createZone: (name: string) => MapZone;
  editZone: (zoneId: string, changes: ZoneEdits) => string;
  deleteZone: (zoneId: string) => void;
  resyncZone?: (zoneId: string, direction: 'push' | 'discard') => string;
};

const MEMBER_FILL = '#22c55e';

export default function MapZoneEditor({
  locations,
  controller,
}: {
  locations: WorldMapLocation[];
  controller: ZoneEditorController;
}) {
  const graphTheme = useGraphTheme();
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>(undefined);

  const selectedZone = controller.zones.find((zone) => zone.id === selectedZoneId);
  const memberSet = useMemo(() => new Set(selectedZone?.locationIds ?? []), [selectedZone]);

  const toggleZoneSelection = (zoneId: string) => {
    setSelectedZoneId((current) => (current === zoneId ? undefined : zoneId));
  };

  const graph = useMemo(() => {
    const nodes = locations.map((location) => ({
      id: location.id,
      label: location.name || 'Untitled',
      ...(memberSet.has(location.id) ? { fill: MEMBER_FILL } : {}),
    }));
    const edges = locations.flatMap((location) =>
      location.adjacency.map((targetId) => ({
        id: `${location.id}->${targetId}`,
        source: location.id,
        target: targetId,
      }))
    );
    return { nodes, edges };
  }, [locations, memberSet]);

  const toggleMembership = (locationId: string) => {
    if (!selectedZone) {
      return;
    }
    const nextLocationIds = memberSet.has(locationId)
      ? selectedZone.locationIds.filter((id) => id !== locationId)
      : selectedZone.locationIds.concat(locationId);
    setSelectedZoneId(controller.editZone(selectedZone.id, { locationIds: nextLocationIds }));
  };

  const togglePrivateGroup = (groupId: string) => {
    if (!selectedZone) {
      return;
    }
    const current = selectedZone.privateToGroupIds;
    const next = current.includes(groupId) ? current.filter((id) => id !== groupId) : current.concat(groupId);
    setSelectedZoneId(controller.editZone(selectedZone.id, { privateToGroupIds: next }));
  };

  const isOverride = Boolean(selectedZone?.parentZoneId);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {controller.zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={zone.id === selectedZoneId ? 'button-emphasized' : ''}
              onClick={() => toggleZoneSelection(zone.id)}
            >
              {zone.name || 'Untitled Zone'}
              {zone.privateToGroupIds.length > 0 ? ' 🔒' : ''}
            </button>
          ))}
          <button type="button" onClick={() => setSelectedZoneId(controller.createZone('New Zone').id)}>
            + Add Zone
          </button>
        </div>

        {!controller.ready && controller.zones.length === 0 && (
          <div className="text-sm text-muted">Loading zones…</div>
        )}

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
                  onChange={(event) =>
                    setSelectedZoneId(controller.editZone(selectedZone.id, { name: event.target.value }))
                  }
                  placeholder="Zone name"
                />
                <DeleteButton
                  label="Delete zone"
                  confirmTitle="Delete Zone"
                  confirmLabel="Delete Zone"
                  confirmMessage={`Delete zone "${selectedZone.name || 'Untitled Zone'}"? Any schedule segments that use it will be removed.`}
                  onConfirm={() => {
                    controller.deleteZone(selectedZone.id);
                    setSelectedZoneId(controller.zones.find((zone) => zone.id !== selectedZone.id)?.id);
                  }}
                />
              </div>
            </div>

            {controller.allowResync && isOverride && (
              <div className="space-y-2 rounded-sm border border-border-default bg-inset p-2 text-sm">
                <div className="text-muted">This zone overrides a global map zone for this scenario.</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedZoneId(controller.resyncZone?.(selectedZone.id, 'push') ?? undefined)
                    }
                  >
                    Apply to global map
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedZoneId(controller.resyncZone?.(selectedZone.id, 'discard') ?? undefined)
                    }
                  >
                    Revert to global
                  </button>
                </div>
              </div>
            )}

            {controller.allowPrivate && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-sm font-medium">Private to groups</div>
                  <InfoTooltip
                    label="About batch size"
                    html="If any groups are selected here, only members of these groups will be allowed to enter this zone (even if other groups have schedules that want them to be here)."
                  />
                </div>
                {controller.groups.length === 0 ? (
                  <div className="text-sm text-muted">No character groups yet.</div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {controller.groups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-sm border-border-accent accent-focus-ring"
                          checked={selectedZone.privateToGroupIds.includes(group.id)}
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
        className={`relative min-w-0 flex-1 overflow-hidden rounded-sm border border-border-default bg-inset ${controller.mapClasses?.join(' ') ?? ''}`}
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
            onNodeClick={(node) => toggleMembership(node.id)}
          />
        )}
      </div>
    </div>
  );
}
