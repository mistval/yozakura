import { describe, expect, it } from 'vitest';
import type {
  MapZone,
  MovementPolicy,
  ScenarioCharacterGroupSchedule,
  ScheduleSegment,
  WorldMapLocation,
} from '../types';
import { resolveScheduleAllowedLocations, resolveScheduledMove } from './schedule_movement';

function chooseFirst<T>(items: T[]): T {
  return items[0]!;
}

function makeLocation(id: string, adjacency: string[]): WorldMapLocation {
  return { id, name: id, description: '', adjacency, isEphemeral: false, createdAt: '', updatedAt: '' };
}

const LINE_LOCATIONS: WorldMapLocation[] = [
  makeLocation('A', ['B']),
  makeLocation('B', ['A', 'C']),
  makeLocation('C', ['B', 'D']),
  makeLocation('D', ['C']),
];

function makeZone(id: string, locationIds: string[], extra: Partial<MapZone> = {}): MapZone {
  return {
    id,
    mapId: 'map1',
    name: id,
    locationIds,
    privateToGroupIds: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function makeSegment(
  zoneId: string,
  movementPolicy: MovementPolicy,
  startTurn: number,
  endTurn: number
): ScheduleSegment {
  return { id: `${zoneId}-seg`, startTurn, endTurn, zoneId, movementPolicy };
}

function makeSchedule(
  groupId: string,
  lengthInTurns: number,
  segments: ScheduleSegment[]
): ScenarioCharacterGroupSchedule {
  return { id: `${groupId}-sched`, scenarioId: 's1', groupId, lengthInTurns, segments, createdAt: '', updatedAt: '' };
}

describe('resolveScheduledMove', () => {
  it('returns undefined with no groups and no zones', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: [] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        effectiveZones: [],
        groupSchedulesByGroupId: {},
      },
      chooseFirst
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined during a schedule gap with no private zones', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 3,
        locations: LINE_LOCATIONS,
        effectiveZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 2)]) },
      },
      chooseFirst
    );
    expect(result).toBeUndefined();
  });

  it('teleports straight to the nearest allowed location when out of zone', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        effectiveZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
      },
      chooseFirst
    );
    expect(result).toEqual({ forceMove: true, destinationLocationId: 'C' });
  });

  it('rushes one step toward the nearest allowed location when out of zone', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        effectiveZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'rush', 0, 4)]) },
      },
      chooseFirst
    );
    expect(result).toEqual({ forceMove: true, destinationLocationId: 'B' });
  });

  it('meanders one step toward the nearest allowed location, allowing chat', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        effectiveZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'meander', 0, 4)]) },
      },
      chooseFirst
    );
    expect(result).toEqual({ forceMove: false, destinationLocationId: 'B' });
  });

  it('does not force a move when already in an allowed zone', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'C', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        effectiveZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
      },
      chooseFirst
    );
    expect(result?.forceMove).toBe(false);
    expect(['C', 'D']).toContain(result?.destinationLocationId);
  });

  it('unions overlapping segments into one allowed set', () => {
    const { allowed } = resolveScheduleAllowedLocations({
      character: { groupIds: ['g1'] },
      turnNumber: 0,
      effectiveZones: [makeZone('zoneC', ['C']), makeZone('zoneD', ['D'])],
      groupSchedulesByGroupId: {
        g1: makeSchedule('g1', 4, [makeSegment('zoneC', 'teleport', 0, 4), makeSegment('zoneD', 'rush', 0, 4)]),
      },
    });
    expect([...allowed].sort()).toEqual(['C', 'D']);
  });

  it('unions zones across groups and applies the nearest target policy', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1', 'g2'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        effectiveZones: [makeZone('zoneC', ['C']), makeZone('zoneD', ['D'])],
        groupSchedulesByGroupId: {
          g1: makeSchedule('g1', 4, [makeSegment('zoneD', 'teleport', 0, 4)]),
          g2: makeSchedule('g2', 4, [makeSegment('zoneC', 'rush', 0, 4)]),
        },
      },
      chooseFirst
    );
    expect(result).toEqual({ forceMove: true, destinationLocationId: 'B' });
  });

  it('keeps a non-member out of a private zone but lets a member through', () => {
    const baseInput = {
      locationId: 'A',
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      effectiveZones: [
        makeZone('zoneD', ['D']),
        makeZone('privateC', ['C'], { privateToGroupIds: ['insiders'] }),
      ],
      groupSchedulesByGroupId: { sched: makeSchedule('sched', 4, [makeSegment('zoneD', 'teleport', 0, 4)]) },
    };

    const nonMember = resolveScheduledMove(
      {
        ...baseInput,
        character: { id: 'npc', locationId: 'A', groupIds: ['sched'] },
      },
      chooseFirst
    );
    expect(nonMember?.destinationLocationId).toBe('A');

    const member = resolveScheduledMove(
      {
        ...baseInput,
        character: { id: 'npc', locationId: 'A', groupIds: ['sched', 'insiders'] },
      },
      chooseFirst
    );
    expect(member).toEqual({ forceMove: true, destinationLocationId: 'D' });
  });

  it('falls back to plain movement when the allowed zone is unreachable', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: [...LINE_LOCATIONS, makeLocation('Z', [])],
        effectiveZones: [makeZone('zoneZ', ['Z'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneZ', 'teleport', 0, 4)]) },
      },
      chooseFirst
    );
    expect(result?.forceMove).toBe(false);
    expect(['A', 'B']).toContain(result?.destinationLocationId);
  });

  it('selects the same segment after a full period wrap', () => {
    const build = (turnNumber: number) =>
      resolveScheduledMove(
        {
          character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
          turnNumber,
          locations: LINE_LOCATIONS,
          effectiveZones: [makeZone('zoneCD', ['C', 'D'])],
          groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 2)]) },
        },
        chooseFirst
      );

    expect(build(1)).toEqual(build(5));
    expect(build(1)).toEqual({ forceMove: true, destinationLocationId: 'C' });
  });
});
