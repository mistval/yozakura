import { useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
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
import InfoTooltip from './../ui/InfoTooltip';
import { newId } from '../../util/id.js';
import DeleteButton from '../ui/DeleteButton.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import RangeNumberInput from '../settings/ui/RangeNumberInput.js';
import { clampUnitRate, toPercent } from '../../util/numeric.js';

const SEGMENT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];
const LANE_HEIGHT_PX = 28;
const RULER_HEIGHT_PX = 18;
const DEFAULT_PIXELS_PER_TURN = 56;
const MIN_PIXELS_PER_TURN = 14;
const MAX_PIXELS_PER_TURN = 220;
const ZOOM_STEP = 1.15;
const REASON_TOOLTIP =
  'Explain why the character should be here at this time, completing the thought: "They are here because …". This may be injected into the character\'s system prompt while their schedule keeps them in this zone.';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assignLanes(segments: ScheduleSegment[]): {
  laneBySegmentId: Record<string, number>;
  laneCount: number;
} {
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const [pixelsPerTurn, setPixelsPerTurn] = useState(DEFAULT_PIXELS_PER_TURN);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lengthInTurns = storedSchedule?.lengthInTurns ?? 56;
  const segments = storedSchedule?.segments ?? [];
  const turnNumber = scenario?.turnNumber ?? 0;
  const nowTurn = ((turnNumber % lengthInTurns) + lengthInTurns) % lengthInTurns;

  const { laneBySegmentId, laneCount } = useMemo(() => assignLanes(segments), [segments]);
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId);

  const contentWidth = lengthInTurns * pixelsPerTurn;
  const contentHeight = RULER_HEIGHT_PX + laneCount * LANE_HEIGHT_PX + 8;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const pointerOffset = event.clientX - rect.left;
      const pointerContentX = pointerOffset + el.scrollLeft;
      setPixelsPerTurn((prev) => {
        const next = clamp(
          prev * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
          MIN_PIXELS_PER_TURN,
          MAX_PIXELS_PER_TURN
        );
        const turnAtPointer = pointerContentX / prev;
        const nextScrollLeft = turnAtPointer * next - pointerOffset;
        requestAnimationFrame(() => {
          el.scrollLeft = nextScrollLeft;
        });
        return next;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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

  const addSegment = (atTurn?: number) => {
    const el = scrollRef.current;
    const defaultTurn = el ? (el.scrollLeft + el.clientWidth / 2) / pixelsPerTurn : lengthInTurns / 2;
    const startTurn = clamp(Math.round(atTurn ?? defaultTurn), 0, lengthInTurns - 1);
    const segment: ScheduleSegment = {
      id: newId(),
      startTurn,
      endTurn: Math.min(lengthInTurns, startTurn + 1),
      zoneId: effectiveZones[0]?.id ?? '',
      movementPolicy: 'teleport',
      obedienceRate: 1,
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
          <div className="flex items-center gap-2">
            <label className="block text-sm font-medium" htmlFor="schedule-length">
              Length in turns
            </label>
            <InfoTooltip
              label="About length in turns"
              html="The schedule will repeat from the beginning after this many turns. Check the vertical <b>now</b> indicator line on the calendar bar to see where on the schedule we currently are. By default, there are eight turns per day, so set this to 8 if you want a single-day schedule, or 56 (8 x 7) if you want a week-long schedule. The number of turns per day may be different if you have changed the <b>Temporal Context</b> in Scenario Settings."
            />
          </div>
          <input
            id="schedule-length"
            type="number"
            min={1}
            className="w-28 border rounded-sm px-3 py-2 bg-inset"
            value={lengthInTurns}
            onChange={(event) =>
              mutate((prev) => ({
                ...prev,
                lengthInTurns: parsePositiveInt(event.target.value, prev.lengthInTurns),
              }))
            }
          />
        </div>
        <button type="button" onClick={() => addSegment()} disabled={effectiveZones.length === 0}>
          ➕ Add Schedule Segment
        </button>
        {effectiveZones.length === 0 && (
          <span className="text-sm text-muted">Create a map zone first (Map → Zones).</span>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted">
          Drag a segment to move it, drag its edges to resize, scroll to zoom.
        </div>
        <div
          ref={scrollRef}
          className="w-full overflow-x-auto rounded-sm border border-border-default bg-inset"
        >
          <div
            className="relative"
            style={{ width: `${contentWidth}px`, height: `${contentHeight}px` }}
            onDoubleClick={(event) => {
              if (effectiveZones.length === 0) return;
              const el = scrollRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const clickX = event.clientX - rect.left + el.scrollLeft;
              addSegment(clickX / pixelsPerTurn - 0.5);
            }}
          >
            {Array.from({ length: lengthInTurns + 1 }, (_, turn) => (
              <div
                key={turn}
                className="absolute top-0 bottom-0 border-l border-border-default/60"
                style={{ left: `${turn * pixelsPerTurn}px` }}
              >
                {turn < lengthInTurns && (
                  <span className="absolute left-1 top-0 text-[10px] leading-none text-muted">{turn}</span>
                )}
              </div>
            ))}

            {segments.map((segment, index) => {
              const lane = laneBySegmentId[segment.id] ?? 0;
              const zoneName = effectiveZones.find((zone) => zone.id === segment.zoneId)?.name ?? 'No zone';
              const isSelected = segment.id === selectedSegmentId;
              return (
                <Rnd
                  key={segment.id}
                  bounds="parent"
                  dragAxis="x"
                  dragGrid={[pixelsPerTurn, LANE_HEIGHT_PX]}
                  resizeGrid={[pixelsPerTurn, LANE_HEIGHT_PX]}
                  enableResizing={{ left: true, right: true }}
                  minWidth={pixelsPerTurn}
                  size={{
                    width: Math.max(0, segment.endTurn - segment.startTurn) * pixelsPerTurn,
                    height: LANE_HEIGHT_PX - 4,
                  }}
                  position={{
                    x: segment.startTurn * pixelsPerTurn,
                    y: RULER_HEIGHT_PX + lane * LANE_HEIGHT_PX + 4,
                  }}
                  onDragStop={(_event, data) => {
                    const duration = segment.endTurn - segment.startTurn;
                    const start = clamp(Math.round(data.x / pixelsPerTurn), 0, lengthInTurns - duration);
                    if (start !== segment.startTurn) {
                      updateSegment(segment.id, { startTurn: start, endTurn: start + duration });
                    }
                  }}
                  onResizeStop={(_event, _direction, ref, _delta, position) => {
                    const start = clamp(Math.round(position.x / pixelsPerTurn), 0, lengthInTurns - 1);
                    const turns = Math.max(1, Math.round(ref.offsetWidth / pixelsPerTurn));
                    const end = Math.min(lengthInTurns, start + turns);
                    updateSegment(segment.id, { startTurn: start, endTurn: Math.max(start + 1, end) });
                  }}
                >
                  <div
                    onClick={() => setSelectedSegmentId(segment.id)}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setPendingDeleteId(segment.id);
                    }}
                    className={`h-full w-full cursor-pointer truncate rounded-sm px-2 text-left text-xs leading-6 text-white ${
                      isSelected ? 'ring-2 ring-focus-ring' : ''
                    }`}
                    style={{ backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
                    title={`${zoneName} (${segment.movementPolicy})`}
                  >
                    {zoneName} · {segment.movementPolicy}
                  </div>
                </Rnd>
              );
            })}

            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-danger-solid"
              style={{ left: `${nowTurn * pixelsPerTurn + Math.floor(pixelsPerTurn / 2)}px` }}
              title={`Now: turn ${nowTurn}`}
            >
              <span className="absolute left-0.5 top-0 rounded-sm bg-danger-solid px-1 text-[10px] leading-none text-white">
                now
              </span>
            </div>
          </div>
        </div>
      </div>

      {selectedSegment ? (
        <div className="space-y-3 rounded-sm border border-border-default bg-surface-soft p-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Schedule Segment</h4>
            <DeleteButton
              onConfirm={() => deleteSegment(selectedSegment.id)}
              confirmMessage="Are you sure you want to delete this schedule segment?"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="block text-sm" htmlFor="segment-zone">
                  Allowed zone
                </label>
                <InfoTooltip
                  label="About movement policy"
                  html="The character is required to be in this zone when this schedule segment is active. If a character has multiple active schedule segments, they are allowed to be in any one the zones they are assigned to, and will move toward the nearest."
                />
              </div>
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
              <div className="flex items-center gap-2">
                <label className="block text-sm" htmlFor="segment-policy">
                  Movement policy
                </label>
                <InfoTooltip
                  label="About movement policy"
                  html="<strong>Teleport</strong> means the character will instantly warp to the zone when their schedule requires them to be there, and then they still get a turn. <strong>Jump</strong> similarly means the character will instantly warp, but it consumes their turn. <strong>Rush</strong> means the character will move towards the zone one hop at a time, never stopping to initiate chats (although other characters can still initiate chats with them). <strong>Casual</strong> means the character will move towards the zone one hop at a time, while occasionally stopping to initiate chats, at the rate specified in Behavior Settings."
                />
              </div>
              <select
                id="segment-policy"
                className="w-full border rounded-sm px-3 py-2 bg-inset capitalize"
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
                    startTurn: Math.max(
                      0,
                      Math.min(Math.trunc(Number(event.target.value)), selectedSegment.endTurn - 1)
                    ),
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

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="block text-sm" htmlFor="segment-obedience">
                Obedience rate ({toPercent(selectedSegment.obedienceRate)}%)
              </label>
              <InfoTooltip
                label="About obedience rate"
                html="How often characters actually follow this schedule segment. At 100% they always obey. Lower it to add spontaneity: on a turn where the roll fails, the segment is ignored as if it weren't scheduled, so the character is free to wander or stay put — like deciding not to go to bed because they couldn't sleep."
              />
            </div>
            <RangeNumberInput
              id="segment-obedience"
              ariaLabel="Obedience rate value"
              min={0}
              max={100}
              step={1}
              value={toPercent(selectedSegment.obedienceRate)}
              onChange={(next) =>
                updateSegment(selectedSegment.id, { obedienceRate: clampUnitRate(next / 100) })
              }
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="block text-sm" htmlFor="segment-reason" title={REASON_TOOLTIP}>
                Reason (optional)
              </label>
              <InfoTooltip
                label="About movement policy"
                html="The reason why the character should be here at the specified time. Should complete the thought: <strong>They are here because ... </strong>. For example: <strong>they work here</strong>. This information will be injected into their system prompt (unless you have edited the Chat System Prompt to do otherwise)."
              />
            </div>
            <textarea
              id="segment-reason"
              title={REASON_TOOLTIP}
              className="w-full min-h-20 border rounded-sm px-3 py-2 bg-inset"
              value={selectedSegment.reason ?? ''}
              onChange={(event) => updateSegment(selectedSegment.id, { reason: event.target.value })}
              placeholder="They are here because…"
            />
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">Select a segment to edit it, or add a new one.</div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== undefined}
        title="Delete Schedule Segment"
        message="Are you sure you want to delete this schedule segment?"
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteId) {
            deleteSegment(pendingDeleteId);
          }
          setPendingDeleteId(undefined);
        }}
        onClose={() => setPendingDeleteId(undefined)}
      />
    </div>
  );
}
