import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import type { ScenarioCharacterGroup, ScenarioCharacterGroupSchedule } from '../engine/types.js';
import { assert } from '../errors/application_error.js';
import { concatUniqueById, removeById } from '../util/array.js';
import { getRequiredActiveScenario, useScenarioStore } from './scenario_store.js';
import { useScenarioCharacterStore } from './scenario_character_store.js';
import _ from 'lodash';

const DATABASE_OBJECT_NAME = 'scenario_character_group';
const SCHEDULE_DATABASE_OBJECT_NAME = 'scenario_character_group_schedule';

type CharacterGroupStoreState = {
  groups: ScenarioCharacterGroup[];
  schedulesByGroupId: Record<string, ScenarioCharacterGroupSchedule>;
  groupsAreLoaded: boolean;

  loadGroups: () => Promise<void>;
  saveGroup: (group: ScenarioCharacterGroup) => void;
  createGroup: (name: string) => ScenarioCharacterGroup;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  setCharacterGroups: (characterId: string, groupIds: string[]) => void;
  getCharactersInGroup: (groupId: string) => string[];
  saveSchedule: (schedule: ScenarioCharacterGroupSchedule) => void;
  ensureSchedule: (groupId: string) => ScenarioCharacterGroupSchedule;
  removeZoneFromAllSchedules: (zoneId: string) => void;
  togglePrivateMapZone: (groupId: string, mapId: string) => void;
};

const DEFAULT_SCHEDULE_LENGTH_IN_TURNS = 56;

export const useCharacterGroupStore = create<CharacterGroupStoreState>((set, get) => ({
  groups: [],
  schedulesByGroupId: {},
  groupsAreLoaded: false,

  loadGroups: async () => {
    set({ groups: [], schedulesByGroupId: {}, groupsAreLoaded: false });

    const scenario = useScenarioStore.getState().activeScenario;
    if (!scenario) {
      return;
    }

    const [groups, schedules] = await Database.doAsDataRead(async () => {
      return Promise.all([
        Database.loadScenarioCharacterGroups(scenario.id),
        Database.loadGroupSchedules(scenario.id),
      ]);
    }, `${DATABASE_OBJECT_NAME}.${scenario.id}.all`);

    set({
      groups,
      schedulesByGroupId: Object.fromEntries(schedules.map((s) => [s.groupId, s])),
      groupsAreLoaded: true,
    });
  },

  createGroup: (name) => {
    const scenarioId = getRequiredActiveScenario().id;
    const group: ScenarioCharacterGroup = Database.createPersistedObject({
      scenarioId,
      name,
      privateZones: [],
    });

    get().saveGroup(group);

    return group;
  },

  renameGroup: (groupId, name) => {
    const group = get().groups.find((g) => g.id === groupId);
    assert(group, 'renameGroup called for unknown group');

    const updated = { ...group, name };
    get().saveGroup(updated);
  },

  deleteGroup: (groupId) => {
    const { [groupId]: _removed, ...remainingSchedules } = get().schedulesByGroupId;
    set({
      groups: removeById(get().groups, groupId),
      schedulesByGroupId: remainingSchedules,
    });

    const characterStore = useScenarioCharacterStore.getState();
    const updatedCharacters = characterStore.scenarioCharacters
      .filter((c) => c.groupIds.includes(groupId))
      .map((c) => ({ ...c, groupIds: c.groupIds.filter((id) => id !== groupId) }));

    characterStore.saveScenarioCharacters(updatedCharacters);

    void Database.doAsDataWrite(async () => {
      await Database.deleteScenarioCharacterGroup(groupId);
    }, DATABASE_OBJECT_NAME);
  },

  setCharacterGroups: (characterId, groupIds) => {
    useScenarioCharacterStore.getState().saveScenarioCharacterFields(characterId, { groupIds });
  },

  getCharactersInGroup: (groupId) => {
    return useScenarioCharacterStore
      .getState()
      .scenarioCharacters.filter((c) => c.groupIds.includes(groupId))
      .map((c) => c.id);
  },

  saveSchedule: (schedule) => {
    set({ schedulesByGroupId: { ...get().schedulesByGroupId, [schedule.groupId]: schedule } });

    void Database.doAsDataWrite(
      async () => {
        const latest = get().schedulesByGroupId[schedule.groupId];
        if (latest) {
          await Database.storeGroupSchedule(latest);
        }
      },
      SCHEDULE_DATABASE_OBJECT_NAME,
      { debouncerKey: schedule.groupId }
    );
  },

  ensureSchedule: (groupId) => {
    const existing = get().schedulesByGroupId[groupId];
    if (existing) {
      return existing;
    }

    const scenarioId = getRequiredActiveScenario().id;
    const schedule = Database.createPersistedObject({
      scenarioId,
      groupId,
      lengthInTurns: DEFAULT_SCHEDULE_LENGTH_IN_TURNS,
      segments: [],
    });

    get().saveSchedule(schedule);
    return schedule;
  },

  removeZoneFromAllSchedules: (zoneId) => {
    for (const schedule of Object.values(get().schedulesByGroupId)) {
      if (!schedule.segments.some((segment) => segment.zoneId === zoneId)) {
        continue;
      }
      get().saveSchedule({
        ...schedule,
        segments: schedule.segments.filter((segment) => segment.zoneId !== zoneId),
      });
    }
  },

  togglePrivateMapZone: (groupId, zoneId) => {
    const group = get().groups.find((g) => g.id === groupId);
    assert(group, 'renameGroup called for unknown group');

    const isPrivate = group.privateZones.includes(zoneId);
    const newPrivateZones = isPrivate
      ? _.without(group.privateZones, zoneId)
      : group.privateZones.concat(zoneId);

    const updated: ScenarioCharacterGroup = { ...group, privateZones: newPrivateZones };
    get().saveGroup(updated);
  },

  saveGroup: (group) => {
    set({ groups: concatUniqueById(get().groups, group) });

    void Database.doAsDataWrite(
      async () => {
        const latest = get().groups.find((g) => g.id === group.id);
        if (latest) {
          await Database.storeScenarioCharacterGroups([latest]);
        }
      },
      DATABASE_OBJECT_NAME,
      { debouncerKey: group.id }
    );
  },
}));

useScenarioStore.subscribe((newScenario, prevScenario) => {
  if (newScenario.activeScenario && prevScenario.activeScenario?.id !== newScenario.activeScenario.id) {
    void useCharacterGroupStore.getState().loadGroups();
  }
});

if (useScenarioStore.getState().activeScenario) {
  await useCharacterGroupStore.getState().loadGroups();
}
