import { getRequiredRandomChoice } from '../../util/array.js';
import { findNearestReachable } from '../map/graph_search.js';
import { resolveZoneById } from '../map/map_zone.js';
import type {
  Character,
  MapZone,
  MovementPolicy,
  ScenarioCharacterGroupSchedule,
  WorldMapLocation,
} from '../types.js';

export interface ScheduledMove {
  destinationLocationId: string;
  forceMove: boolean;
  consumesTurn: boolean;
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
  effectiveZones: MapZone[];
  groupSchedulesByGroupId: Record<string, ScenarioCharacterGroupSchedule>;
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

export function resolveForbiddenLocationIds(input: {
  character: Pick<Character, 'groupIds'>;
  effectiveZones: MapZone[];
}): Set<string> {
  const forbidden = new Set<string>();

  for (const zone of input.effectiveZones) {
    if (zone.privateToGroupIds.length === 0) {
      continue;
    }

    const isMember = zone.privateToGroupIds.some((groupId) => input.character.groupIds.includes(groupId));
    if (isMember) {
      continue;
    }

    for (const locationId of zone.locationIds) {
      forbidden.add(locationId);
    }
  }

  return forbidden;
}

// Return locations the character is scheduled to be in
// along with a policy for how to move to each location
export function resolveScheduledLocations(
  input: {
    character: Pick<Character, 'groupIds'>;
    turnNumber: number;
    groupSchedulesByGroupId: Record<string, ScenarioCharacterGroupSchedule>;
    effectiveZones: MapZone[];
  },
  random?: () => number
): {
  scheduledLocations: Set<string>;
  policyByLocationId: Map<string, MovementPolicy>;
  reasonByLocationId: Map<string, string>;
} {
  const scheduledLocations = new Set<string>();
  const policyByLocationId = new Map<string, MovementPolicy>();
  const reasonByLocationId = new Map<string, string>();

  for (const groupId of input.character.groupIds) {
    const schedule = input.groupSchedulesByGroupId[groupId];
    if (!schedule) {
      continue;
    }

    for (const segment of schedule.segments) {
      const activeNow = isSegmentActive(segment, schedule.lengthInTurns, input.turnNumber);
      const activeNextTurn = isSegmentActive(segment, schedule.lengthInTurns, input.turnNumber + 1);
      const active = segment.movementPolicy === 'teleport' ? activeNow : activeNow || activeNextTurn;
      if (!active) {
        continue;
      }

      if (random && random() >= segment.obedienceRate) {
        continue;
      }

      const zone = resolveZoneById(segment.zoneId, input.effectiveZones);
      if (!zone) {
        // TODO: Warning log
        continue;
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
    }
  }

  return { scheduledLocations, policyByLocationId, reasonByLocationId };
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
  const forbidden = resolveForbiddenLocationIds(input);
  const { scheduledLocations, policyByLocationId } = resolveScheduledLocations(input, random);

  for (const locationId of forbidden) {
    scheduledLocations.delete(locationId);
    policyByLocationId.delete(locationId);
  }

  const adjacencyByLocationId = new Map(input.locations.map((l) => [l.id, l.adjacency] as const));
  const getNeighbors = (locationId: string) => adjacencyByLocationId.get(locationId) ?? [];

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

  // Teleport and jump ignore connectivity and distance entirely: the character may
  // warp to any scheduled location with that policy, even one in a disconnected zone.
  const warpTargets = warpTargetsFrom(scheduledLocations, policyByLocationId);
  if (warpTargets.length > 0) {
    const target = choose(warpTargets);
    const policy = policyByLocationId.get(target)!;
    return { forceMove: true, destinationLocationId: target, consumesTurn: policy === 'jump' };
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

  const firstSteps = firstStepsToward(target);
  const firstStep = choose(firstSteps);
  const forceMove = policy === 'rush';
  return { forceMove, destinationLocationId: firstStep, consumesTurn: true };
}

export function resolveUserMovementSuggestion(
  input: ScheduleMovementInput
): UserMovementSuggestion | undefined {
  const forbidden = resolveForbiddenLocationIds(input);
  const { scheduledLocations, policyByLocationId } = resolveScheduledLocations(input);

  for (const locationId of forbidden) {
    scheduledLocations.delete(locationId);
    policyByLocationId.delete(locationId);
  }

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

  const adjacencyByLocationId = new Map(input.locations.map((l) => [l.id, l.adjacency] as const));
  const getNeighbors = (locationId: string) => adjacencyByLocationId.get(locationId) ?? [];

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

  // Teleport and jump destinations are surfaced directly, even across disconnected zones
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
  const forbidden = resolveForbiddenLocationIds(input);
  const { scheduledLocations, policyByLocationId, reasonByLocationId } = resolveScheduledLocations(input);

  for (const locationId of forbidden) {
    scheduledLocations.delete(locationId);
    policyByLocationId.delete(locationId);
  }

  if (scheduledLocations.size === 0) {
    return undefined;
  }

  const current = input.character.locationId;

  if (scheduledLocations.has(current)) {
    return { status: 'in_designated_zone', reason: reasonByLocationId.get(current) };
  }

  // A reachable warp destination takes priority
  const warpTargets = warpTargetsFrom(scheduledLocations, policyByLocationId);
  let target = warpTargets[0];

  if (target === undefined) {
    const adjacencyByLocationId = new Map(input.locations.map((l) => [l.id, l.adjacency] as const));
    const getNeighbors = (locationId: string) => adjacencyByLocationId.get(locationId) ?? [];

    const { targets } = findNearestReachable(
      current,
      getNeighbors,
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
