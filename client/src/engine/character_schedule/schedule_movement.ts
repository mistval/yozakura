import { findById, getRequiredRandomChoice } from '../../util/array.js';
import { breadthFirstSearch, findNearestReachable } from '../map/graph_search.js';
import type {
  Character,
  MapZone,
  MovementPolicy,
  ScenarioCharacterGroup,
  ScenarioCharacterGroupSchedule,
  ScheduleSegment,
  WorldMapLocation,
} from '../types.js';

export interface ScheduledMove {
  destinationLocationId: string;
  forceMove: boolean;
  consumesTurn: boolean;
  movementPolicy?: MovementPolicy | undefined;
}

export type MoveHighlight = 'urgent' | 'gentle' | 'allowed';

export interface UserMovementSuggestion {
  suggestedLocationIds: string[];
  highlightByLocationId: Record<string, MoveHighlight>;
  consumesTurnByLocationId: Record<string, boolean>;
  highlightWait: boolean;
  forbiddenLocationIds: string[];
}

interface ScheduleMovementInput {
  character: Pick<Character, 'id' | 'locationId' | 'groupIds'>;
  turnNumber: number;
  locations: WorldMapLocation[];
  mapZones: MapZone[];
  groupSchedulesByGroupId: Record<string, ScenarioCharacterGroupSchedule>;
  characterGroups: ScenarioCharacterGroup[];
  npcChatRate?: number | undefined;
}

const POLICY_PERMISSIVENESS: Record<MovementPolicy, number> = {
  teleport: 0,
  jump: 1,
  rush: 2,
  casual: 3,
};

function mostUrgentPolicy(a: MovementPolicy | undefined, b: MovementPolicy): MovementPolicy {
  if (a === undefined) {
    return b;
  }
  return POLICY_PERMISSIVENESS[a] >= POLICY_PERMISSIVENESS[b] ? b : a;
}

function isSegmentActive(
  segment: { startTurn: number; endTurn: number },
  lengthInTurns: number,
  turnNumber: number
): boolean {
  const position = ((turnNumber % lengthInTurns) + lengthInTurns) % lengthInTurns;
  return position >= segment.startTurn && position < segment.endTurn;
}

function turnsUntilSegmentActive(
  segment: { startTurn: number; endTurn: number },
  lengthInTurns: number,
  turnNumber: number
): number {
  const position = ((turnNumber % lengthInTurns) + lengthInTurns) % lengthInTurns;
  if (position >= segment.startTurn && position < segment.endTurn) {
    return 0;
  }
  return (segment.startTurn - position + lengthInTurns) % lengthInTurns;
}

function estimateTravelTurns(pathLength: number, policy: MovementPolicy, npcChatRate: number): number {
  if (policy !== 'casual') {
    return pathLength;
  }
  const moveRate = 1 - npcChatRate;
  if (moveRate <= 0) {
    return pathLength <= 0 ? 0 : Infinity;
  }
  return pathLength / moveRate;
}

function neighborLookup(locations: WorldMapLocation[]): (locationId: string) => string[] {
  const adjacencyByLocationId = new Map(locations.map((l) => [l.id, l.adjacency] as const));
  return (locationId) => adjacencyByLocationId.get(locationId) ?? [];
}

export function resolveForbiddenLocationIds(input: {
  character: Pick<Character, 'groupIds'>;
  characterGroups: ScenarioCharacterGroup[];
  mapZones: MapZone[];
}): Set<string> {
  const forbidden = new Set<string>();
  const groupsForPrivateZone = new Map<string, string[]>();
  for (const group of input.characterGroups) {
    for (const zoneId of group.privateZones) {
      groupsForPrivateZone.set(zoneId, (groupsForPrivateZone.get(zoneId) ?? []).concat(group.id));
    }
  }

  for (const zone of input.mapZones) {
    const allowedGroups = groupsForPrivateZone.get(zone.id);
    if (!allowedGroups) {
      continue;
    }

    const isMember = allowedGroups.some((groupId) => input.character.groupIds.includes(groupId));
    if (isMember) {
      continue;
    }

    for (const locationId of zone.locationIds) {
      forbidden.add(locationId);
    }
  }

  return forbidden;
}

export function resolveScheduledLocations(
  input: {
    character: Pick<Character, 'groupIds'> & { locationId?: string | undefined };
    turnNumber: number;
    groupSchedulesByGroupId: Record<string, ScenarioCharacterGroupSchedule>;
    mapZones: MapZone[];
    characterGroups: ScenarioCharacterGroup[];
    locations?: WorldMapLocation[] | undefined;
    npcChatRate?: number | undefined;
  },
  random?: () => number
): {
  scheduledLocations: Set<string>;
  policyByLocationId: Map<string, MovementPolicy>;
  reasonByLocationId: Map<string, string>;
  forbidden: Set<string>;
} {
  const scheduledLocations = new Set<string>();
  const policyByLocationId = new Map<string, MovementPolicy>();
  const reasonByLocationId = new Map<string, string>();
  const forbidden = resolveForbiddenLocationIds(input);

  const addZone = (segment: ScheduleSegment) => {
    if (random && random() >= segment.obedienceRate) {
      return;
    }

    const zone = findById(input.mapZones, segment.zoneId);
    if (!zone) {
      return;
    }

    for (const locationId of zone.locationIds) {
      scheduledLocations.add(locationId);
      policyByLocationId.set(
        locationId,
        mostUrgentPolicy(policyByLocationId.get(locationId), segment.movementPolicy)
      );

      if (segment.reason && !reasonByLocationId.has(locationId)) {
        reasonByLocationId.set(locationId, segment.reason);
      }
    }
  };

  let anyActiveNow = false;
  const upcoming: { segment: ScheduleSegment; lengthInTurns: number }[] = [];

  for (const groupId of input.character.groupIds) {
    const schedule = input.groupSchedulesByGroupId[groupId];
    if (!schedule) {
      continue;
    }

    for (const segment of schedule.segments) {
      if (isSegmentActive(segment, schedule.lengthInTurns, input.turnNumber)) {
        anyActiveNow = true;
        addZone(segment);
      } else if (segment.movementPolicy === 'jump') {
        if (isSegmentActive(segment, schedule.lengthInTurns, input.turnNumber + 1)) {
          addZone(segment);
        }
      } else if (segment.movementPolicy === 'rush' || segment.movementPolicy === 'casual') {
        upcoming.push({ segment, lengthInTurns: schedule.lengthInTurns });
      }
    }
  }

  if (!anyActiveNow && upcoming.length > 0 && input.locations && input.character.locationId !== undefined) {
    const { distance } = breadthFirstSearch(input.character.locationId, neighborLookup(input.locations), {
      canEnter: (locationId) => !forbidden.has(locationId),
    });
    const chatRate = input.npcChatRate ?? 0;

    for (const { segment, lengthInTurns } of upcoming) {
      const zone = findById(input.mapZones, segment.zoneId);
      if (!zone) {
        continue;
      }

      let pathLength = Infinity;
      for (const locationId of zone.locationIds) {
        const hops = distance.get(locationId);
        if (hops !== undefined && hops < pathLength) {
          pathLength = hops;
        }
      }
      if (!Number.isFinite(pathLength)) {
        continue;
      }

      const turnsUntilActive = turnsUntilSegmentActive(segment, lengthInTurns, input.turnNumber);
      if (estimateTravelTurns(pathLength, segment.movementPolicy, chatRate) >= turnsUntilActive) {
        addZone(segment);
      }
    }
  }

  for (const locationId of forbidden) {
    scheduledLocations.delete(locationId);
    policyByLocationId.delete(locationId);
  }

  return { scheduledLocations, policyByLocationId, reasonByLocationId, forbidden };
}

function warpTargetsFrom(
  scheduledLocations: Set<string>,
  policyByLocationId: Map<string, MovementPolicy>
): string[] {
  return [...scheduledLocations].filter((locationId) => {
    const policy = policyByLocationId.get(locationId);
    return policy === 'teleport' || policy === 'jump';
  });
}

export function resolveScheduledMove(
  input: ScheduleMovementInput,
  choose: <T>(items: T[]) => T = getRequiredRandomChoice,
  random: () => number = Math.random
): ScheduledMove {
  const { scheduledLocations, policyByLocationId, forbidden } = resolveScheduledLocations(input, random);

  const getNeighbors = neighborLookup(input.locations);
  const current = input.character.locationId;
  const currentAdjacency = getNeighbors(current);

  const moveWithoutScheduledLocations = (): ScheduledMove => {
    const candidates = [current, ...currentAdjacency].filter((id) => !forbidden.has(id));
    const pool = candidates.length > 0 ? candidates : [current];
    return { forceMove: false, destinationLocationId: choose(pool), consumesTurn: true };
  };

  if (scheduledLocations.size === 0) {
    return moveWithoutScheduledLocations();
  }

  if (scheduledLocations.has(current)) {
    const candidates = [current, ...currentAdjacency.filter((id) => scheduledLocations.has(id))];
    return { forceMove: false, destinationLocationId: choose(candidates), consumesTurn: true };
  }

  const warpTargets = warpTargetsFrom(scheduledLocations, policyByLocationId);
  if (warpTargets.length > 0) {
    const target = choose(warpTargets);
    const policy = policyByLocationId.get(target)!;
    return {
      forceMove: true,
      destinationLocationId: target,
      consumesTurn: policy === 'jump',
      movementPolicy: policy,
    };
  }

  const { targets, firstStepsToward } = findNearestReachable(
    current,
    getNeighbors,
    (locationId) => scheduledLocations.has(locationId),
    (locationId) => !forbidden.has(locationId)
  );

  if (targets.length === 0) {
    return moveWithoutScheduledLocations();
  }

  const target = choose(targets);
  const policy = policyByLocationId.get(target)!;
  const firstStep = choose(firstStepsToward(target));
  return {
    forceMove: policy === 'rush',
    destinationLocationId: firstStep,
    consumesTurn: true,
    movementPolicy: policy,
  };
}

export function resolveUserMovementSuggestion(
  input: ScheduleMovementInput
): UserMovementSuggestion | undefined {
  const { scheduledLocations, policyByLocationId, forbidden } = resolveScheduledLocations(input);
  const forbiddenLocationIds = [...forbidden];

  const locksOnly = (): UserMovementSuggestion | undefined => {
    if (forbiddenLocationIds.length === 0) {
      return undefined;
    }
    return {
      suggestedLocationIds: [],
      highlightByLocationId: {},
      consumesTurnByLocationId: {},
      highlightWait: false,
      forbiddenLocationIds,
    };
  };

  if (scheduledLocations.size === 0) {
    return locksOnly();
  }

  const getNeighbors = neighborLookup(input.locations);
  const current = input.character.locationId;

  if (scheduledLocations.has(current)) {
    const highlightByLocationId: Record<string, MoveHighlight> = {};
    const consumesTurnByLocationId: Record<string, boolean> = {};
    for (const neighbor of getNeighbors(current)) {
      if (scheduledLocations.has(neighbor)) {
        highlightByLocationId[neighbor] = 'allowed';
        consumesTurnByLocationId[neighbor] = true;
      }
    }
    return {
      suggestedLocationIds: [],
      highlightByLocationId,
      consumesTurnByLocationId,
      highlightWait: true,
      forbiddenLocationIds,
    };
  }

  const suggestedLocationIds: string[] = [];
  const highlightByLocationId: Record<string, MoveHighlight> = {};
  const consumesTurnByLocationId: Record<string, boolean> = {};

  const surface = (locationId: string, highlight: MoveHighlight, consumesTurn: boolean) => {
    if (highlightByLocationId[locationId] === undefined) {
      suggestedLocationIds.push(locationId);
      highlightByLocationId[locationId] = highlight;
      consumesTurnByLocationId[locationId] = consumesTurn;
    } else {
      if (highlight === 'urgent') {
        highlightByLocationId[locationId] = 'urgent';
      }
      if (consumesTurn) {
        consumesTurnByLocationId[locationId] = true;
      }
    }
  };

  const warpTargets = warpTargetsFrom(scheduledLocations, policyByLocationId);
  if (warpTargets.length > 0) {
    for (const target of warpTargets) {
      surface(target, 'urgent', policyByLocationId.get(target) === 'jump');
    }
    return {
      suggestedLocationIds,
      highlightByLocationId,
      consumesTurnByLocationId,
      highlightWait: false,
      forbiddenLocationIds,
    };
  }

  const { targets, firstStepsToward } = findNearestReachable(
    current,
    getNeighbors,
    (locationId) => scheduledLocations.has(locationId),
    (locationId) => !forbidden.has(locationId)
  );

  if (targets.length === 0) {
    return locksOnly();
  }

  for (const target of targets) {
    const policy = policyByLocationId.get(target)!;
    if (policy === 'casual') {
      for (const step of firstStepsToward(target)) {
        surface(step, 'gentle', true);
      }
    } else {
      surface(firstStepsToward(target)[0]!, 'urgent', true);
    }
  }

  return {
    suggestedLocationIds,
    highlightByLocationId,
    consumesTurnByLocationId,
    highlightWait: false,
    forbiddenLocationIds,
  };
}

export interface CharacterMovementConstraint {
  status: 'in_designated_zone' | 'moving_towards_designated_zone';
  reason: string | undefined;
  targetLocationName?: string | undefined;
}

export function resolveCharacterMovementConstraint(
  input: ScheduleMovementInput
): CharacterMovementConstraint | undefined {
  const { scheduledLocations, policyByLocationId, reasonByLocationId, forbidden } =
    resolveScheduledLocations(input);

  if (scheduledLocations.size === 0) {
    return undefined;
  }

  const current = input.character.locationId;

  if (scheduledLocations.has(current)) {
    return { status: 'in_designated_zone', reason: reasonByLocationId.get(current) };
  }

  const warpTargets = warpTargetsFrom(scheduledLocations, policyByLocationId);
  let target = warpTargets[0];

  if (target === undefined) {
    const { targets } = findNearestReachable(
      current,
      neighborLookup(input.locations),
      (locationId) => scheduledLocations.has(locationId),
      (locationId) => !forbidden.has(locationId)
    );
    target = targets[0];
  }

  if (target === undefined) {
    return undefined;
  }

  return {
    status: 'moving_towards_designated_zone',
    reason: reasonByLocationId.get(target),
    targetLocationName: input.locations.find((location) => location.id === target)?.name,
  };
}
