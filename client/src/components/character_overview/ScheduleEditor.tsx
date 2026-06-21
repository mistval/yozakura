import { useMemo, useState } from 'react';
import {
  movementPolicySchema,
  type MapZone,
  type ScenarioCharacterGroupSchedule,
  type ScheduleSegment,
} from '../../engine/types.js';
import { getEffectiveZones } from '../../engine/map/map_zone.js';
import { useCharacterGroupStore } from '../../state/character_group_store.js';
import { useMapZoneStore } from '../../state/map_zone_store.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { newId } from '../../util/id.js';

const SEGMENT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];
const LANE_HEIGHT_PX = 28;

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assignLanes(segments: ScheduleSegment[]): { laneBySegmentId: Record<string, number>; laneCount: number } {
  const ordered = [...segments].sort((a, b) => a.startTurn - b.startTurn || a.endTurn - b.endTurn);
  const laneEndTurns: number[] = [];
  const laneBySegmentId: Record<string, number> = {};

  for (const segment of ordered) {
    let lane = laneEndTurns.findIndex((endTurn) => endTurn <= segment.startTurn);
    if (lane === -1) {
      lane = laneEndTurns.length;
      laneEndTurns.push(segment.endTurn);
    } else {
      laneEndTurns[lane] = segment.endTurn;
    }
    laneBySegmentId[segment.id] = lane;
  }

  return { laneBySegmentId, laneCount: Math.max(1, laneEndTurns.length) };
}

export default function ScheduleEditor({ groupId }: { groupId: string }) {
  const storedSchedule = useCharacterGroupStore((state) => state.schedulesByGroupId[groupId]);
  const zones = useMapZoneStore((state) => state.zones);
  const scenario = useScenarioStore((state) => state.activeScenario);

  const effectiveZones: MapZone[] = useMemo(
    () => (scenario ? getEffectiveZones(scenario.id, scenario.mapId, zones) : []),
    [scenario, zones]
  );

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | undefined>(undefined);

  const lengthInTurns = storedSchedule?.lengthInTurns ?? 4;
  const segments = storedSchedule?.segments ?? [];
  const turnNumber = scenario?.turnNumber ?? 0;
  const nowPercent = (((turnNumber % lengthInTurns) + lengthInTurns) % lengthInTurns / lengthInTurns) * 100;

  const { laneBySegmentId, laneCount } = useMemo(() => assignLanes(segments), [segments]);
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId);

  const mutate = (updater: (prev: ScenarioCharacterGroupSchedule) => ScenarioCharacterGroupSchedule) => {
    const base = useCharacterGroupStore.getState().ensureSchedule(groupId);
    useCharacterGroupStore.getState().saveSchedule(updater(base));
  };

  const updateSegment = (segmentId: string, changes: Partial<ScheduleSegment>) => {
    mutate((prev) => ({
      ...prev,
      segments: prev.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...changes } : segment
      ),
    }));
  };

  const addSegment = () => {
    const segment: ScheduleSegment = {
      id: newId(),
      startTurn: 0,
      endTurn: lengthInTurns,
      zoneId: effectiveZones[0]?.id ?? '',
      movementPolicy: 'teleport',
    };
    mutate((prev) => ({ ...prev, segments: prev.segments.concat(segment) }));
    setSelectedSegmentId(segment.id);
  };

  const deleteSegment = (segmentId: string) => {
    mutate((prev) => ({ ...prev, segments: prev.segments.filter((segment) => segment.id !== segmentId) }));
    setSelectedSegmentId(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="schedule-length">
            Length in turns
          </label>
          <input
            id="schedule-length"
            type="number"
            min={1}
            className="w-28 border rounded-sm px-3 py-2 bg-inset"
            value={lengthInTurns}
            onChange={(event) =>
              mutate((prev) => ({ ...prev, lengthInTurns: parsePositiveInt(event.target.value, prev.lengthInTurns) }))
            }
          />
        </div>
        <button type="button" onClick={addSegment} disabled={effectiveZones.length === 0}>
          + Add Segment
        </button>
        {effectiveZones.length === 0 && (
          <span className="text-sm text-muted">Create a map zone first (Map → Zones).</span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted">
          <span>Turn 0</span>
          <span>Turn {lengthInTurns}</span>
        </div>
        <div
          className="relative w-full rounded-sm border border-border-default bg-inset"
          style={{ height: `${laneCount * LANE_HEIGHT_PX + 8}px` }}
        >
          {segments.map((segment, index) => {
            const lane = laneBySegmentId[segment.id] ?? 0;
            const left = (Math.min(segment.startTurn, lengthInTurns) / lengthInTurns) * 100;
            const width = (Math.max(0, segment.endTurn - segment.startTurn) / lengthInTurns) * 100;
            const zoneName = effectiveZones.find((zone) => zone.id === segment.zoneId)?.name ?? 'No zone';
            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => setSelectedSegmentId(segment.id)}
                className={`absolute truncate rounded-sm px-2 text-left text-xs text-white ${
                  segment.id === selectedSegmentId ? 'ring-2 ring-focus-ring' : ''
                }`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  top: `${lane * LANE_HEIGHT_PX + 4}px`,
                  height: `${LANE_HEIGHT_PX - 4}px`,
                  backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                }}
                title={`${zoneName} (${segment.movementPolicy})`}
              >
                {zoneName} · {segment.movementPolicy}
              </button>
            );
          })}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-error-text"
            style={{ left: `${nowPercent}%` }}
            title={`Now: turn ${turnNumber % lengthInTurns}`}
          />
        </div>
      </div>

      {selectedSegment ? (
        <div className="space-y-3 rounded-sm border border-border-default bg-surface-soft p-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Segment</h4>
            <button type="button" onClick={() => deleteSegment(selectedSegment.id)}>
              Delete Segment
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm" htmlFor="segment-zone">
                Allowed zone
              </label>
              <select
                id="segment-zone"
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={selectedSegment.zoneId}
                onChange={(event) => updateSegment(selectedSegment.id, { zoneId: event.target.value })}
              >
                {effectiveZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name || 'Untitled Zone'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm" htmlFor="segment-policy">
                Movement policy
              </label>
              <select
                id="segment-policy"
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={selectedSegment.movementPolicy}
                onChange={(event) =>
                  updateSegment(selectedSegment.id, {
                    movementPolicy: movementPolicySchema.parse(event.target.value),
                  })
                }
              >
                {movementPolicySchema.options.map((policy) => (
                  <option key={policy} value={policy}>
                    {policy}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm" htmlFor="segment-start">
                Start turn
              </label>
              <input
                id="segment-start"
                type="number"
                min={0}
                max={lengthInTurns - 1}
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={selectedSegment.startTurn}
                onChange={(event) =>
                  updateSegment(selectedSegment.id, {
                    startTurn: Math.max(0, Math.min(Math.trunc(Number(event.target.value)), selectedSegment.endTurn - 1)),
                  })
                }
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm" htmlFor="segment-end">
                End turn
              </label>
              <input
                id="segment-end"
                type="number"
                min={1}
                max={lengthInTurns}
                className="w-full border rounded-sm px-3 py-2 bg-inset"
                value={selectedSegment.endTurn}
                onChange={(event) =>
                  updateSegment(selectedSegment.id, {
                    endTurn: Math.min(
                      lengthInTurns,
                      Math.max(Math.trunc(Number(event.target.value)), selectedSegment.startTurn + 1)
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">Select a segment to edit it, or add a new one.</div>
      )}
    </div>
  );
}
