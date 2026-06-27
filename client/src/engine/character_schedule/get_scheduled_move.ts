import { useCharacterGroupStore } from '../../state/character_group_store.js';
import { getRequiredActiveScenario, getRequiredActiveScenarioMap } from '../../state/scenario_store.js';
import { useSettingsStore } from '../../state/settings_store.js';
import type { Character } from '../types.js';
import {
  resolveCharacterMovementConstraint,
  resolveScheduledMove,
  resolveUserMovementSuggestion,
  type CharacterMovementConstraint,
  type UserMovementSuggestion,
} from './schedule_movement.js';

function getScheduleMovementInput(character: Pick<Character, 'id' | 'locationId' | 'groupIds'>) {
  const scenario = getRequiredActiveScenario();
  const map = getRequiredActiveScenarioMap();

  return {
    character,
    turnNumber: scenario.turnNumber,
    locations: map.locations,
    mapZones: map.zones,
    characterGroups: useCharacterGroupStore.getState().groups,
    groupSchedulesByGroupId: useCharacterGroupStore.getState().schedulesByGroupId,
    npcChatRate: useSettingsStore.getState().npcChatRate,
  };
}

export function getScheduledMoveForNpc(npc: Pick<Character, 'id' | 'locationId' | 'groupIds'>) {
  return resolveScheduledMove(getScheduleMovementInput(npc));
}

export function getUserMovementSuggestion(
  user: Pick<Character, 'id' | 'locationId' | 'groupIds'>
): UserMovementSuggestion | undefined {
  return resolveUserMovementSuggestion(getScheduleMovementInput(user));
}

export function getCharacterMovementConstraint(
  character: Pick<Character, 'id' | 'locationId' | 'groupIds'>
): CharacterMovementConstraint | undefined {
  return resolveCharacterMovementConstraint(getScheduleMovementInput(character));
}
