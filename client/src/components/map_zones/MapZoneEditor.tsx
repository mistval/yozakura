import { useEffect, useMemo, useRef, useState } from 'react';
import { GraphCanvas } from 'reagraph';
import { useGraphTheme } from '../../theme/graph_themes.js';
import type { MapZone, ScenarioCharacterGroup, WorldMapLocation } from '../../engine/types.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';

export type ZoneEdits = Partial<Pick<MapZone, 'name' | 'locationIds' | 'privateToGroupIds'>>;

export type ZoneEditorController = {
  zones: MapZone[];
  groups: ScenarioCharacterGroup[];
  ready: boolean;
  allowPrivate: boolean;
  allowResync: boolean;
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
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>(controller.zones[0]?.id);
  const [pendingDeleteZoneId, setPendingDeleteZoneId] = useState<string | undefined>(undefined);
  const didAutoCreateRef = useRef(false);

  const selectedZone = controller.zones.find((zone) => zone.id === selectedZoneId);
  const memberSet = useMemo(() => new Set(selectedZone?.locationIds ?? []), [selectedZone]);

  useEffect(() => {
    if (!controller.ready) {
      didAutoCreateRef.current = false;
      return;
    }
    if (controller.zones.length > 0 || didAutoCreateRef.current) {
      return;
    }
    didAutoCreateRef.current = true;
    setSelectedZoneId(controller.createZone('Default').id);
  }, [controller.ready, controller.zones.length]);

  useEffect(() => {
    if (!selectedZone && controller.zones.length > 0) {
      setSelectedZoneId(controller.zones[0]?.id);
    }
  }, [controller.zones, selectedZone]);

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
    const next = current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : current.concat(groupId);
    setSelectedZoneId(controller.editZone(selectedZone.id, { privateToGroupIds: next }));
  };

  const pendingDeleteZone = controller.zones.find((zone) => zone.id === pendingDeleteZoneId);
  const isOverride = Boolean(selectedZone?.parentZoneId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {controller.zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={zone.id === selectedZoneId ? 'button-emphasized' : ''}
            onClick={() => setSelectedZoneId(zone.id)}
          >
            {zone.name || 'Untitled Zone'}
            {zone.privateToGroupIds.length > 0 ? ' 🔒' : ''}
          </button>
        ))}
        <button type="button" onClick={() => setSelectedZoneId(controller.createZone('New Zone').id)}>
          + Add Zone
        </button>
      </div>

      {!selectedZone ? (
        controller.ready ? undefined : <div className="text-sm text-muted">Loading zones…</div>
      ) : (
        <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
          <div className="w-full shrink-0 space-y-3 lg:w-72">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="zone-name">
                Zone Name
              </label>
              <input
                id="zone-name"
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={selectedZone.name}
                onChange={(event) =>
                  setSelectedZoneId(controller.editZone(selectedZone.id, { name: event.target.value }))
                }
                placeholder="Zone name"
              />
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
                <div className="text-sm font-medium">Private to groups</div>
                {controller.groups.length === 0 ? (
                  <div className="text-sm text-muted">No character groups yet.</div>
                ) : (
                  <div className="space-y-1">
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
                <div className="text-xs text-muted">
                  When set, only members of the selected groups may enter this zone.
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteZoneId(selectedZone.id)}
                disabled={controller.zones.length <= 1}
              >
                Delete Zone
              </button>
            </div>

            <div className="text-xs text-muted">Click a location on the graph to toggle its membership.</div>
          </div>

          <div className="relative min-h-100 min-w-0 flex-1 overflow-hidden rounded-sm border border-border-default bg-inset">
            {graph.nodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                No locations to display.
              </div>
            ) : (
              <GraphCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                theme={graphTheme}
                actives={selectedZone.locationIds}
                onNodeClick={(node) => toggleMembership(node.id)}
              />
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteZoneId)}
        onClose={() => setPendingDeleteZoneId(undefined)}
        title="Delete Zone"
        message={`Delete zone "${pendingDeleteZone?.name || 'Untitled Zone'}"? Any schedule segments that use it will be removed.`}
        confirmLabel="Delete Zone"
        onConfirm={confirmDeleteZone}
      />
    </div>
  );

  function confirmDeleteZone() {
    if (pendingDeleteZoneId) {
      controller.deleteZone(pendingDeleteZoneId);
      if (selectedZoneId === pendingDeleteZoneId) {
        setSelectedZoneId(controller.zones.find((zone) => zone.id !== pendingDeleteZoneId)?.id);
      }
    }
    setPendingDeleteZoneId(undefined);
  }
}
