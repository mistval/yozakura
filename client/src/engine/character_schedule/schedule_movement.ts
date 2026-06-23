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

function mostPermissivePolicy(a: MovementPolicy | undefined, b: MovementPolicy): MovementPolicy {
  if (a === undefined) {
    return b;
  }
  return POLICY_PERMISSIVENESS[a] >= POLICY_PERMISSIVENESS[b] ? a : b;
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

export function resolveScheduleAllowedLocations(input: {
  character: Pick<Character, 'groupIds'>;
  turnNumber: number;
  groupSchedulesByGroupId: Record<string, ScenarioCharacterGroupSchedule>;
  effectiveZones: MapZone[];
}): {
  allowed: Set<string>;
  policyByLocationId: Map<string, MovementPolicy>;
  reasonByLocationId: Map<string, string>;
} {
  const allowed = new Set<string>();
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

      const zone = resolveZoneById(segment.zoneId, input.effectiveZones);
      if (!zone) {
        continue;
      }

      for (const locationId of zone.locationIds) {
        allowed.add(locationId);
        policyByLocationId.set(
          locationId,
          mostPermissivePolicy(policyByLocationId.get(locationId), segment.movementPolicy)
        );
        if (segment.reason && !reasonByLocationId.has(locationId)) {
          reasonByLocationId.set(locationId, segment.reason);
        }
      }
    }
  }

  return { allowed, policyByLocationId, reasonByLocationId };
}

export function resolveScheduledMove(
  input: ScheduleMovementInput,
  choose: <T>(items: T[]) => T = getRequiredRandomChoice
): ScheduledMove | undefined {
  const forbidden = resolveForbiddenLocationIds(input);
  const { allowed, policyByLocationId } = resolveScheduleAllowedLocations(input);

  for (const locationId of forbidden) {
    allowed.delete(locationId);
    policyByLocationId.delete(locationId);
  }

  const adjacencyByLocationId = new Map(input.locations.map((l) => [l.id, l.adjacency] as const));
  const getNeighbors = (locationId: string) => adjacencyByLocationId.get(locationId) ?? [];

  const current = input.character.locationId;
  const currentAdjacency = getNeighbors(current);

  const plainMove = (): ScheduledMove => {
    const candidates = [current, ...currentAdjacency].filter((id) => !forbidden.has(id));
    const pool = candidates.length > 0 ? candidates : [current];
    return { forceMove: false, destinationLocationId: choose(pool), consumesTurn: false };
  };

  if (allowed.size === 0) {
    return forbidden.size === 0 ? undefined : plainMove();
  }

  if (allowed.has(current)) {
    const candidates = [current, ...currentAdjacency.filter((id) => allowed.has(id))];
    return { forceMove: false, destinationLocationId: choose(candidates), consumesTurn: false };
  }

  const { targets, firstStepsToward } = findNearestReachable(
    current,
    getNeighbors,
    (locationId) => allowed.has(locationId),
    (locationId) => !forbidden.has(locationId)
  );

  if (targets.length === 0) {
    return plainMove();
  }

  const target = choose(targets);
  const policy = policyByLocationId.get(target)!;

  if (policy === 'teleport' || policy === 'jump') {
    return { forceMove: true, destinationLocationId: target, consumesTurn: policy === 'jump' };
  }

  const firstSteps = firstStepsToward(target);
  const firstStep = policy === 'casual' ? choose(firstSteps) : firstSteps[0]!;
  const forceMove = policy === 'rush';
  return { forceMove, destinationLocationId: firstStep, consumesTurn: forceMove };
}

export function resolveUserMovementSuggestion(
  input: ScheduleMovementInput
): UserMovementSuggestion | undefined {
  const forbidden = resolveForbiddenLocationIds(input);
  const { allowed, policyByLocationId } = resolveScheduleAllowedLocations(input);

  for (const locationId of forbidden) {
    allowed.delete(locationId);
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

  if (allowed.size === 0) {
    return locksOnly();
  }

  const adjacencyByLocationId = new Map(input.locations.map((l) => [l.id, l.adjacency] as const));
  const getNeighbors = (locationId: string) => adjacencyByLocationId.get(locationId) ?? [];

  const current = input.character.locationId;

  if (allowed.has(current)) {
    const highlightByLocationId: Record<string, MoveHighlight> = {};
    const consumesTurnByLocationId: Record<string, boolean> = {};
    for (const neighbor of getNeighbors(current)) {
      if (allowed.has(neighbor)) {
        highlightByLocationId[neighbor] = 'allowed';
        consumesTurnByLocationId[neighbor] = false;
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

  const { targets, firstStepsToward } = findNearestReachable(
    current,
    getNeighbors,
    (locationId) => allowed.has(locationId),
    (locationId) => !forbidden.has(locationId)
  );

  if (targets.length === 0) {
    return locksOnly();
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

  for (const target of targets) {
    const policy = policyByLocationId.get(target)!;
    if (policy === 'teleport' || policy === 'jump') {
      surface(target, 'urgent', policy === 'jump');
    } else if (policy === 'casual') {
      for (const step of firstStepsToward(target)) {
        surface(step, 'gentle', false);
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
  const { allowed, reasonByLocationId } = resolveScheduleAllowedLocations(input);

  for (const locationId of forbidden) {
    allowed.delete(locationId);
  }

  if (allowed.size === 0) {
    return undefined;
  }

  const current = input.character.locationId;

  if (allowed.has(current)) {
    return { status: 'in_designated_zone', reason: reasonByLocationId.get(current) };
  }

  const adjacencyByLocationId = new Map(input.locations.map((l) => [l.id, l.adjacency] as const));
  const getNeighbors = (locationId: string) => adjacencyByLocationId.get(locationId) ?? [];

  const { targets } = findNearestReachable(
    current,
    getNeighbors,
    (locationId) => allowed.has(locationId),
    (locationId) => !forbidden.has(locationId)
  );

  const target = targets[0];
  if (target === undefined) {
    return undefined;
  }

  return {
    status: 'moving_towards_designated_zone',
    reason: reasonByLocationId.get(target),
    targetLocationName: input.locations.find((location) => location.id === target)?.name,
  };
}
