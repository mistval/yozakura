import { useCharacterGroupStore } from '../../state/character_group_store.js';
import { useMapZoneStore } from '../../state/map_zone_store.js';
import { getRequiredActiveScenario, getRequiredActiveScenarioMap } from '../../state/scenario_store.js';
import type { Character } from '../types.js';
import { resolveScheduledMove, type ScheduledMove } from './schedule_movement.js';

export function getScheduledMoveForNpc(
  npc: Pick<Character, 'id' | 'locationId' | 'groupIds'>
): ScheduledMove | undefined {
  const scenario = getRequiredActiveScenario();
  const map = getRequiredActiveScenarioMap();

  return resolveScheduledMove({
    character: npc,
    turnNumber: scenario.turnNumber,
    locations: map.locations,
    effectiveZones: useMapZoneStore.getState().getEffectiveZones(),
    groupSchedulesByGroupId: useCharacterGroupStore.getState().schedulesByGroupId,
  });
}
