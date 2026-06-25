import { describe, expect, it } from 'vitest';
import type {
  MapZone,
  MovementPolicy,
  ScenarioCharacterGroup,
  ScenarioCharacterGroupSchedule,
  ScheduleSegment,
  WorldMapLocation,
} from '../types';
import {
  resolveCharacterMovementConstraint,
  resolveScheduledLocations,
  resolveScheduledMove,
  resolveUserMovementSuggestion,
} from './schedule_movement';

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

const DIAMOND_LOCATIONS: WorldMapLocation[] = [
  makeLocation('A', ['B', 'C']),
  makeLocation('B', ['A', 'D']),
  makeLocation('C', ['A', 'D']),
  makeLocation('D', ['B', 'C']),
];

function chooseLast<T>(items: T[]): T {
  return items[items.length - 1]!;
}

function makeZone(id: string, locationIds: string[], extra: Partial<MapZone> = {}): MapZone {
  return {
    id,
    name: id,
    locationIds,
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function makeGroup(id: string, privateZones: string[]): ScenarioCharacterGroup {
  return { id, scenarioId: 's1', name: id, privateZones, createdAt: '', updatedAt: '' };
}

function makeSegment(
  zoneId: string,
  movementPolicy: MovementPolicy,
  startTurn: number,
  endTurn: number,
  reason?: string,
  obedienceRate = 1
): ScheduleSegment {
  return { id: `${zoneId}-seg`, startTurn, endTurn, zoneId, movementPolicy, obedienceRate, reason };
}

function makeSchedule(
  groupId: string,
  lengthInTurns: number,
  segments: ScheduleSegment[]
): ScenarioCharacterGroupSchedule {
  return {
    id: `${groupId}-sched`,
    scenarioId: 's1',
    groupId,
    lengthInTurns,
    segments,
    createdAt: '',
    updatedAt: '',
  };
}

describe('resolveScheduledMove', () => {
  it('returns wait with no groups and no zones', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: [] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [],
        groupSchedulesByGroupId: {},
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: false,
      destinationLocationId: 'A',
      consumesTurn: true,
    });
  });

  it('teleports straight to the nearest allowed location when out of zone', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: true,
      destinationLocationId: 'C',
      consumesTurn: false,
      movementPolicy: 'teleport',
    });
  });

  it('jumps straight to the nearest allowed location, consuming the turn', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'jump', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: true,
      destinationLocationId: 'C',
      consumesTurn: true,
      movementPolicy: 'jump',
    });
  });

  it('rushes one step toward the nearest allowed location when out of zone', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'rush', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: true,
      destinationLocationId: 'B',
      consumesTurn: true,
      movementPolicy: 'rush',
    });
  });

  it('casually moves one step toward the nearest allowed location, allowing chat', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'casual', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: false,
      destinationLocationId: 'B',
      consumesTurn: true,
      movementPolicy: 'casual',
    });
  });

  it('returns multiple valid moves', () => {
    const casualMove = (choose: <T>(items: T[]) => T) =>
      resolveScheduledMove(
        {
          character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
          turnNumber: 0,
          locations: DIAMOND_LOCATIONS,
          mapZones: [makeZone('zoneD', ['D'])],
          groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneD', 'casual', 0, 4)]) },
          characterGroups: [],
        },
        choose
      );

    expect(casualMove(chooseFirst)).toEqual({
      forceMove: false,
      destinationLocationId: 'B',
      consumesTurn: true,
      movementPolicy: 'casual',
    });
    expect(casualMove(chooseLast)).toEqual({
      forceMove: false,
      destinationLocationId: 'C',
      consumesTurn: true,
      movementPolicy: 'casual',
    });
  });

  it('does not force a move when already in an allowed zone', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'C', groupIds: ['g1'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [makeZone('zoneCD', ['C', 'D'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result?.forceMove).toBe(false);
    expect(['C', 'D']).toContain(result?.destinationLocationId);
  });

  it('unions overlapping segments into one allowed set', () => {
    const { scheduledLocations: allowed } = resolveScheduledLocations({
      character: { groupIds: ['g1'] },
      turnNumber: 0,
      mapZones: [makeZone('zoneC', ['C']), makeZone('zoneD', ['D'])],
      groupSchedulesByGroupId: {
        g1: makeSchedule('g1', 4, [
          makeSegment('zoneC', 'teleport', 0, 4),
          makeSegment('zoneD', 'rush', 0, 4),
        ]),
      },
      characterGroups: [],
    });
    expect([...allowed].sort()).toEqual(['C', 'D']);
  });

  it('prioritizes a teleport target over a closer rush target across groups', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1', 'g2'] },
        turnNumber: 0,
        locations: LINE_LOCATIONS,
        mapZones: [makeZone('zoneC', ['C']), makeZone('zoneD', ['D'])],
        groupSchedulesByGroupId: {
          g1: makeSchedule('g1', 4, [makeSegment('zoneD', 'teleport', 0, 4)]),
          g2: makeSchedule('g2', 4, [makeSegment('zoneC', 'rush', 0, 4)]),
        },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: true,
      destinationLocationId: 'D',
      consumesTurn: false,
      movementPolicy: 'teleport',
    });
  });

  it('keeps a non-member from teleporting into a private zone but lets a member in', () => {
    const baseInput = {
      locationId: 'A',
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('privateD', ['D'])],
      groupSchedulesByGroupId: {
        sched: makeSchedule('sched', 4, [makeSegment('privateD', 'teleport', 0, 4)]),
      },
      characterGroups: [makeGroup('insiders', ['privateD'])],
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
    expect(member).toEqual({
      forceMove: true,
      destinationLocationId: 'D',
      consumesTurn: false,
      movementPolicy: 'teleport',
    });
  });

  it('teleports into a disconnected zone, ignoring connectivity', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: [...LINE_LOCATIONS, makeLocation('Z', [])],
        mapZones: [makeZone('zoneZ', ['Z'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneZ', 'teleport', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result).toEqual({
      forceMove: true,
      destinationLocationId: 'Z',
      consumesTurn: false,
      movementPolicy: 'teleport',
    });
  });

  it('falls back to plain movement when a walked-to zone is unreachable', () => {
    const result = resolveScheduledMove(
      {
        character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
        turnNumber: 0,
        locations: [...LINE_LOCATIONS, makeLocation('Z', [])],
        mapZones: [makeZone('zoneZ', ['Z'])],
        groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneZ', 'rush', 0, 4)]) },
        characterGroups: [],
      },
      chooseFirst
    );
    expect(result?.forceMove).toBe(false);
    expect(['A', 'B']).toContain(result?.destinationLocationId);
  });

  it('ignores a segment when the obedience roll fails', () => {
    const input = {
      character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: {
        g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4, undefined, 0.5)]),
      },
      characterGroups: [],
    };

    const disobeyed = resolveScheduledMove(input, chooseFirst, () => 0.9);
    expect(disobeyed.forceMove).toBe(false);
    expect(['A', 'B']).toContain(disobeyed.destinationLocationId);

    const obeyed = resolveScheduledMove(input, chooseFirst, () => 0.1);
    expect(obeyed).toEqual({
      forceMove: true,
      destinationLocationId: 'C',
      consumesTurn: false,
      movementPolicy: 'teleport',
    });
  });

  it('selects the same segment after a full period wrap', () => {
    const build = (turnNumber: number) =>
      resolveScheduledMove(
        {
          character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
          turnNumber,
          locations: LINE_LOCATIONS,
          mapZones: [makeZone('zoneCD', ['C', 'D'])],
          groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 2)]) },
          characterGroups: [],
        },
        chooseFirst
      );

    expect(build(1)).toEqual(build(5));
    expect(build(1)).toEqual({
      forceMove: true,
      destinationLocationId: 'C',
      consumesTurn: false,
      movementPolicy: 'teleport',
    });
  });

  describe('starts moving one turn before a segment begins', () => {
    const earlyInput = (movementPolicy: MovementPolicy) => ({
      character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 3,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: {
        g1: makeSchedule('g1', 4, [makeSegment('zoneCD', movementPolicy, 0, 2)]),
      },
      characterGroups: [],
    });

    it('does not start early for teleport (no headstart)', () => {
      expect(resolveScheduledMove(earlyInput('teleport'), chooseFirst)).toEqual({
        forceMove: false,
        destinationLocationId: 'A',
        consumesTurn: true,
      });
    });

    it('rushes one step the turn before', () => {
      expect(resolveScheduledMove(earlyInput('rush'), chooseFirst)).toEqual({
        forceMove: true,
        destinationLocationId: 'B',
        consumesTurn: true,
        movementPolicy: 'rush',
      });
    });

    it('casual one step the turn before', () => {
      expect(resolveScheduledMove(earlyInput('casual'), chooseFirst)).toEqual({
        forceMove: false,
        destinationLocationId: 'B',
        consumesTurn: true,
        movementPolicy: 'casual',
      });
    });

    it('starts rushing several turns early when the zone is far', () => {
      const farRush = (turnNumber: number) =>
        resolveScheduledMove(
          {
            character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
            turnNumber,
            locations: LINE_LOCATIONS,
            mapZones: [makeZone('zoneD', ['D'])],
            groupSchedulesByGroupId: { g1: makeSchedule('g1', 8, [makeSegment('zoneD', 'rush', 4, 5)]) },
            characterGroups: [],
          },
          chooseFirst
        );

      // 4 turns out, a 3-hop journey: still has slack, so it waits.
      expect(farRush(0)).toEqual({ forceMove: false, destinationLocationId: 'A', consumesTurn: true });
      // 3 turns out, a 3-hop journey: must leave now.
      expect(farRush(1)).toEqual({
        forceMove: true,
        destinationLocationId: 'B',
        consumesTurn: true,
        movementPolicy: 'rush',
      });
    });

    it('factors NPC chat rate into the casual head start', () => {
      const casualLookahead = (npcChatRate: number) =>
        resolveScheduledMove(
          {
            character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
            turnNumber: 0,
            locations: LINE_LOCATIONS,
            mapZones: [makeZone('zoneD', ['D'])],
            groupSchedulesByGroupId: { g1: makeSchedule('g1', 8, [makeSegment('zoneD', 'casual', 5, 6)]) },
            characterGroups: [],
            npcChatRate,
          },
          chooseFirst
        );

      // 5 turns out, 3 hops: at full speed (no chatting) there's still slack.
      expect(casualLookahead(0)).toEqual({
        forceMove: false,
        destinationLocationId: 'A',
        consumesTurn: true,
      });
      // Same turn, but a 50% chat rate doubles the estimate to 6 turns, so it leaves now.
      expect(casualLookahead(0.5)).toEqual({
        forceMove: false,
        destinationLocationId: 'B',
        consumesTurn: true,
        movementPolicy: 'casual',
      });
    });

    it('does not move early when already inside a back-to-back zone', () => {
      const result = resolveScheduledMove(
        {
          character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
          turnNumber: 1,
          locations: LINE_LOCATIONS,
          mapZones: [makeZone('zoneAB', ['A', 'B']), makeZone('zoneCD', ['C', 'D'])],
          groupSchedulesByGroupId: {
            g1: makeSchedule('g1', 4, [
              makeSegment('zoneAB', 'teleport', 0, 2),
              makeSegment('zoneCD', 'teleport', 2, 4),
            ]),
          },
          characterGroups: [],
        },
        chooseFirst
      );
      expect(result?.forceMove).toBe(false);
      expect(['A', 'B']).toContain(result?.destinationLocationId);
    });
  });
});

describe('resolveUserMovementSuggestion', () => {
  it('returns undefined with no schedule and no private zones', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: [] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [],
      groupSchedulesByGroupId: {},
      characterGroups: [],
    });
    expect(result).toBeUndefined();
  });

  it('teleport surfaces every (non-adjacent) zone destination, urgent', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
      characterGroups: [],
    });
    expect(result).toEqual({
      suggestedLocationIds: ['C', 'D'],
      highlightByLocationId: { C: 'urgent', D: 'urgent' },
      consumesTurnByLocationId: { C: false, D: false },
      highlightWait: false,
      forbiddenLocationIds: [],
    });
  });

  it('rush surfaces the next step, urgent', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'rush', 0, 4)]) },
      characterGroups: [],
    });
    expect(result).toEqual({
      suggestedLocationIds: ['B'],
      highlightByLocationId: { B: 'urgent' },
      consumesTurnByLocationId: { B: true },
      highlightWait: false,
      forbiddenLocationIds: [],
    });
  });

  it('casual surfaces the next step, gentle', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'casual', 0, 4)]) },
      characterGroups: [],
    });
    expect(result).toEqual({
      suggestedLocationIds: ['B'],
      highlightByLocationId: { B: 'gentle' },
      consumesTurnByLocationId: { B: true },
      highlightWait: false,
      forbiddenLocationIds: [],
    });
  });

  it('casual surfaces every closer next step, gentle', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: DIAMOND_LOCATIONS,
      mapZones: [makeZone('zoneD', ['D'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneD', 'casual', 0, 4)]) },
      characterGroups: [],
    });
    expect(result).toEqual({
      suggestedLocationIds: ['B', 'C'],
      highlightByLocationId: { B: 'gentle', C: 'gentle' },
      consumesTurnByLocationId: { B: true, C: true },
      highlightWait: false,
      forbiddenLocationIds: [],
    });
  });

  it('highlights allowed moves and Wait when already in zone', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'C', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
      characterGroups: [],
    });
    expect(result).toEqual({
      suggestedLocationIds: [],
      highlightByLocationId: { D: 'allowed' },
      consumesTurnByLocationId: { D: true },
      highlightWait: true,
      forbiddenLocationIds: [],
    });
  });

  it('reports a private zone as forbidden with no other guidance', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: [] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('privateC', ['C'])],
      groupSchedulesByGroupId: {},
      characterGroups: [makeGroup('insiders', ['privateC'])],
    });
    expect(result).toEqual({
      suggestedLocationIds: [],
      highlightByLocationId: {},
      consumesTurnByLocationId: {},
      highlightWait: false,
      forbiddenLocationIds: ['C'],
    });
  });

  it('surfaces a teleport destination even when the walking path is locked', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['sched'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneD', ['D']), makeZone('privateC', ['C'])],
      groupSchedulesByGroupId: { sched: makeSchedule('sched', 4, [makeSegment('zoneD', 'teleport', 0, 4)]) },
      characterGroups: [makeGroup('insiders', ['privateC'])],
    });
    expect(result).toEqual({
      suggestedLocationIds: ['D'],
      highlightByLocationId: { D: 'urgent' },
      consumesTurnByLocationId: { D: false },
      highlightWait: false,
      forbiddenLocationIds: ['C'],
    });
  });

  it('reports locks only when a walked-to zone is unreachable behind them', () => {
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['sched'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneD', ['D']), makeZone('privateC', ['C'])],
      groupSchedulesByGroupId: { sched: makeSchedule('sched', 4, [makeSegment('zoneD', 'rush', 0, 4)]) },
      characterGroups: [makeGroup('insiders', ['privateC'])],
    });
    expect(result).toEqual({
      suggestedLocationIds: [],
      highlightByLocationId: {},
      consumesTurnByLocationId: {},
      highlightWait: false,
      forbiddenLocationIds: ['C'],
    });
  });

  it('upgrades a shared first step to urgent when targets mix policies', () => {
    const branch: WorldMapLocation[] = [
      makeLocation('A', ['X']),
      makeLocation('X', ['A', 'C', 'B']),
      makeLocation('B', ['X']),
      makeLocation('C', ['X']),
    ];
    const result = resolveUserMovementSuggestion({
      character: { id: 'user', locationId: 'A', groupIds: ['rushers', 'wanderers'] },
      turnNumber: 0,
      locations: branch,
      mapZones: [makeZone('zoneB', ['B']), makeZone('zoneC', ['C'])],
      groupSchedulesByGroupId: {
        rushers: makeSchedule('rushers', 4, [makeSegment('zoneB', 'rush', 0, 4)]),
        wanderers: makeSchedule('wanderers', 4, [makeSegment('zoneC', 'casual', 0, 4)]),
      },
      characterGroups: [],
    });
    expect(result).toEqual({
      suggestedLocationIds: ['X'],
      highlightByLocationId: { X: 'urgent' },
      consumesTurnByLocationId: { X: true },
      highlightWait: false,
      forbiddenLocationIds: [],
    });
  });
});

describe('resolveCharacterMovementConstraint', () => {
  it('returns undefined when there is no active schedule', () => {
    const result = resolveCharacterMovementConstraint({
      character: { id: 'npc', locationId: 'A', groupIds: [] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [],
      groupSchedulesByGroupId: {},
      characterGroups: [],
    });
    expect(result).toBeUndefined();
  });

  it('reports in_designated_zone with the segment reason', () => {
    const result = resolveCharacterMovementConstraint({
      character: { id: 'npc', locationId: 'C', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: {
        g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4, 'she works the night shift')]),
      },
      characterGroups: [],
    });
    expect(result).toEqual({ status: 'in_designated_zone', reason: 'she works the night shift' });
  });

  it('reports in_designated_zone with no reason when none is set', () => {
    const result = resolveCharacterMovementConstraint({
      character: { id: 'npc', locationId: 'C', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'teleport', 0, 4)]) },
      characterGroups: [],
    });
    expect(result).toEqual({ status: 'in_designated_zone', reason: undefined });
  });

  it('reports moving_towards_designated_zone with the target name and reason', () => {
    const result = resolveCharacterMovementConstraint({
      character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: LINE_LOCATIONS,
      mapZones: [makeZone('zoneCD', ['C', 'D'])],
      groupSchedulesByGroupId: {
        g1: makeSchedule('g1', 4, [makeSegment('zoneCD', 'rush', 0, 4, 'her shift starts soon')]),
      },
      characterGroups: [],
    });
    expect(result).toEqual({
      status: 'moving_towards_designated_zone',
      reason: 'her shift starts soon',
      targetLocationName: 'C',
    });
  });

  it('returns undefined when a walked-to zone is unreachable', () => {
    const result = resolveCharacterMovementConstraint({
      character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: [...LINE_LOCATIONS, makeLocation('Z', [])],
      mapZones: [makeZone('zoneZ', ['Z'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneZ', 'rush', 0, 4, 'r')]) },
      characterGroups: [],
    });
    expect(result).toBeUndefined();
  });

  it('reports moving toward a disconnected teleport zone', () => {
    const result = resolveCharacterMovementConstraint({
      character: { id: 'npc', locationId: 'A', groupIds: ['g1'] },
      turnNumber: 0,
      locations: [...LINE_LOCATIONS, makeLocation('Z', [])],
      mapZones: [makeZone('zoneZ', ['Z'])],
      groupSchedulesByGroupId: { g1: makeSchedule('g1', 4, [makeSegment('zoneZ', 'teleport', 0, 4, 'r')]) },
      characterGroups: [],
    });
    expect(result).toEqual({
      status: 'moving_towards_designated_zone',
      reason: 'r',
      targetLocationName: 'Z',
    });
  });
});
