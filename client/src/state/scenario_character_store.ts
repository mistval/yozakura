import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import * as Files from '../backend_bridge/files.js';
import { type WorldMap, type Character, type Scenario } from '../engine/types.js';
import { assertNonNullish } from '../errors/application_error.js';
import { concatUniqueByIds, getRequiredRandomChoice } from '../util/array.js';
import {
  getRequiredActiveScenario,
  getRequiredActiveScenarioMap,
  useScenarioStore,
} from './scenario_store.js';
import { addOrReplaceVersionQueryParam, newId } from '../util/id.js';
import { ephemeralStateSlice, IMMEDIATE_SYNC, type SyncOptions } from './ephemeral_state_helper.js';

type UpdatedScenarioCharacter = Character & {
  imageFile?: File;
};

type ScenarioCharacterStoreState = {
  scenarioCharactersById: Record<string, Character>;
  scenarioCharacters: Character[];
  scenarioCharactersAreLoaded: boolean;

  getCharacterById: (id: string) => Character | undefined;
  getRequiredCharacterById: (id: string) => Character;
  getCharactersByIds: (ids: string[]) => Character[];
  setScenarioCharacters: (characters: Character[]) => void;
  removeCharacterLocal: (characterId: string) => void;
  removeScenarioCharacter: (characterId: string) => Promise<void>;
  loadScenarioCharacters: () => Promise<void>;
  saveScenarioCharacters: (character: Character[], syncOptions?: SyncOptions) => void;
  saveScenarioCharacter: (
    character: Character,
    imageFile?: File,
    setter?: (prevCharacter: Character | undefined) => Character
  ) => void;
  saveInactiveScenarioCharacterImmediate: (character: Character) => Promise<void>;
  saveScenarioCharacterFields: (id: string, fields: Partial<Character>, syncOptions?: SyncOptions) => void;
  addGlobalCharacterToActiveScenario: (
    character: Character,
    scenarioArgs?: {
      scenarioId: string;
      map: WorldMap;
    }
  ) => Promise<Character>;
  copyGlobalCharactersToInactiveScenarioImmediate: (
    characters: Character[],
    scenarioId: string,
    map: WorldMap
  ) => Promise<Character[]>;
  getUserCharacter: (
    scenario?: Scenario,
    scenarioCharactersById?: Record<string, Character>
  ) => Character | undefined;
  getNPCs: () => Character[];
} & ReturnType<typeof ephemeralStateSlice<UpdatedScenarioCharacter>>;

const DATABASE_OBJECT_NAME = 'scenario_character';

async function copyGlobalCharacterForScenario(character: Character, scenarioId: string, map: WorldMap) {
  return {
    ...character,
    scenarioId: scenarioId,
    id: newId(),
    locationId: getRequiredRandomChoice(map.locations).id,
    imagePath: await Files.copyCharacterImageForScenario(scenarioId, character),
    globalCharacterId: character.id,
    groupIds: [],
  };
}

function getCharacterDataStructuresFromArray(characters: Character[]) {
  return {
    scenarioCharacters: characters,
    scenarioCharactersById: Object.fromEntries(characters.map((character) => [character.id, character])),
  } satisfies Pick<ScenarioCharacterStoreState, 'scenarioCharacters' | 'scenarioCharactersById'>;
}

function toPlainCharacter(updatedCharacter: UpdatedScenarioCharacter): Character {
  const { imageFile: _imageFile, ...character } = updatedCharacter;
  return character;
}

export const useScenarioCharacterStore = create<ScenarioCharacterStoreState>((set, get) => ({
  scenarioCharacters: [],
  scenarioCharactersById: {},
  scenarioCharactersAreLoaded: false,

  ...ephemeralStateSlice(
    {
      setStoreState(entities: UpdatedScenarioCharacter[]) {
        const characters = entities.map(toPlainCharacter);
        set(getCharacterDataStructuresFromArray(concatUniqueByIds(get().scenarioCharacters, characters)));
      },

      deleteStoreState(entities: UpdatedScenarioCharacter[]) {
        const ids = new Set(entities.map((entity) => entity.id));
        set(
          getCharacterDataStructuresFromArray(
            get().scenarioCharacters.filter((character) => !ids.has(character.id))
          )
        );
      },

      async setDatabaseState(entities: UpdatedScenarioCharacter[]) {
        const debouncerKey = entities.length === 1 ? entities[0]!.id : `${DATABASE_OBJECT_NAME}.all`;

        await Database.doAsDataWrite(
          async () => {
            const characters = await Promise.all(
              entities.map(async (entity) => {
                const character = get().scenarioCharactersById[entity.id];
                if (!character) {
                  return undefined;
                }

                if (!entity.imageFile) {
                  return character;
                }

                await Files.upload(
                  character.imagePath,
                  entity.imageFile,
                  entity.imageFile.type || 'application/octet-stream'
                );

                const latestCharacter = get().scenarioCharactersById[entity.id];
                if (!latestCharacter) {
                  return undefined;
                }

                return {
                  ...latestCharacter,
                  imagePath: addOrReplaceVersionQueryParam(latestCharacter.imagePath),
                };
              })
            );

            const existingCharacters = characters.filter((character): character is Character =>
              Boolean(character)
            );
            if (existingCharacters.length === 0) {
              return;
            }

            await Database.storeScenarioCharacters(existingCharacters);
          },
          `${DATABASE_OBJECT_NAME}.all`,
          { debouncerKey }
        );
      },

      deleteDatabaseState(entities: UpdatedScenarioCharacter[]) {
        return Database.doAsDataWrite(
          async () => {
            await Database.deleteScenarioCharacters(entities.map((entity) => entity.id));
          },
          DATABASE_OBJECT_NAME,
          {
            debouncerKey: entities.length === 1 ? entities[0]!.id : `${DATABASE_OBJECT_NAME}.all`,
          }
        );
      },

      async refreshStoreStateFromDatabase(entities: UpdatedScenarioCharacter[]) {
        const refreshed = await Database.doAsDataRead(
          () => Database.loadScenarioCharactersByIds(entities.map((entity) => entity.id)),
          `${DATABASE_OBJECT_NAME}.partial.refresh`
        );

        set(getCharacterDataStructuresFromArray(concatUniqueByIds(get().scenarioCharacters, refreshed)));
      },
    },
    { discardPendingChangesOnScenarioChange: true }
  ),

  setScenarioCharacters: (characters) => {
    set({
      ...getCharacterDataStructuresFromArray(characters),
      scenarioCharactersAreLoaded: true,
    });
  },

  removeCharacterLocal: (characterId) => {
    set((state) => {
      return getCharacterDataStructuresFromArray(
        state.scenarioCharacters.filter((c) => c.id !== characterId)
      );
    });
  },

  removeScenarioCharacter: async (characterId) => {
    const characterToDelete = get().scenarioCharactersById[characterId];
    if (!characterToDelete) {
      return;
    }

    await get().ephemeralStateHelper.stageDeletedEntity(characterToDelete, IMMEDIATE_SYNC);
  },

  loadScenarioCharacters: async () => {
    set({
      scenarioCharactersAreLoaded: false,
      ...getCharacterDataStructuresFromArray([]),
    });

    const scenarioId = getRequiredActiveScenario().id;
    const characters = await Database.doAsDataRead(async () => {
      return Database.loadScenarioCharacters(scenarioId);
    }, `${DATABASE_OBJECT_NAME}.${scenarioId}.all`);

    get().setScenarioCharacters(characters);
  },

  saveScenarioCharacter: (character, imageFile, setter) => {
    setter ??= (prev) => ({ ...prev, ...character });

    const newCharacter: UpdatedScenarioCharacter = {
      ...setter(get().scenarioCharactersById[character.id]),
      ...(imageFile ? { imageFile } : {}),
    };

    void get().ephemeralStateHelper.stageUpdatedEntity(newCharacter, IMMEDIATE_SYNC);
  },

  saveScenarioCharacterFields: (id, fields, syncOptions = IMMEDIATE_SYNC) => {
    const char = get().scenarioCharactersById[id];
    assertNonNullish(char, 'saveScenarioCharacterFields called for non-existent characterId: ' + id);

    void get().ephemeralStateHelper.stageUpdatedEntity(
      {
        ...char,
        ...fields,
      },
      syncOptions
    );
  },

  getCharactersByIds: (ids) => {
    const byId = get().scenarioCharactersById;
    const filtered = ids.map((id) => byId[id]).filter(Boolean) as Character[];
    return filtered;
  },

  async addGlobalCharacterToActiveScenario(character: Character): Promise<Character> {
    const scenarioId = getRequiredActiveScenario().id;
    const map = getRequiredActiveScenarioMap();

    let returnChar: Character;
    await Database.doAsDataWrite(async () => {
      const scenarioCharacter = await copyGlobalCharacterForScenario(character, scenarioId, map);
      get().saveScenarioCharacter(scenarioCharacter, undefined, () => scenarioCharacter);
      returnChar = scenarioCharacter;
    }, 'add_scenario_character');

    return returnChar!;
  },

  saveScenarioCharacters(characters: Character[], syncOptions = IMMEDIATE_SYNC) {
    if (characters.length === 0) {
      return;
    }

    void get().ephemeralStateHelper.stageUpdatedEntities(characters, syncOptions);
  },

  async copyGlobalCharactersToInactiveScenarioImmediate(
    characters: Character[],
    scenarioId: string,
    map: WorldMap
  ) {
    const scenarioCharacters = await Promise.all(
      characters.map((c) => copyGlobalCharacterForScenario(c, scenarioId, map))
    );

    await Database.doAsDataWrite(
      async () => {
        await Database.storeScenarioCharacters(scenarioCharacters);
      },
      `${DATABASE_OBJECT_NAME}.all`,
      {
        debouncerKey: `${scenarioId}.${DATABASE_OBJECT_NAME}.all`,
      }
    );

    return scenarioCharacters;
  },

  async saveInactiveScenarioCharacterImmediate(character: Character) {
    await Database.doAsDataWrite(
      async () => {
        await Database.storeScenarioCharacters([character]);
      },
      `${DATABASE_OBJECT_NAME}.all`,
      {
        debouncerKey: character.id,
      }
    );
  },

  getUserCharacter(
    scenario = useScenarioStore.getState().activeScenario,
    scenarioCharactersById = get().scenarioCharactersById
  ) {
    const id = scenario?.userCharacterId;
    const userCharacter = scenarioCharactersById[id ?? ''];
    return userCharacter;
  },

  getCharacterById(id: string) {
    const charArr = get().getCharactersByIds([id]);
    return charArr[0];
  },

  getRequiredCharacterById(id: string) {
    const char = get().getCharacterById(id);
    assertNonNullish(char);
    return char;
  },

  getNPCs() {
    const userCharacter = get().getUserCharacter();
    return get().scenarioCharacters.filter((c) => c.id !== userCharacter?.id);
  },
}));

export function useUserCharacter() {
  const getUserCharacter = useScenarioCharacterStore((s) => s.getUserCharacter);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const scenario = useScenarioStore((s) => s.activeScenario);

  return getUserCharacter(scenario, charactersById);
}

export function whenScenarioCharactersLoaded(): Promise<void> {
  if (useScenarioCharacterStore.getState().scenarioCharactersAreLoaded) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const unsubscribe = useScenarioCharacterStore.subscribe((state) => {
      if (state.scenarioCharactersAreLoaded) {
        unsubscribe();
        resolve();
      }
    });
  });
}

function updateCharacterLocationsForMapChange(map: WorldMap) {
  const scenarioCharacterStore = useScenarioCharacterStore.getState();
  const locationIds = map.locations.map((location) => location.id);
  const locationIdsSet = new Set(locationIds);

  const movedCharacters = scenarioCharacterStore.scenarioCharacters
    .filter((c) => !locationIdsSet.has(c.locationId))
    .map((c) => ({
      ...c,
      locationId: getRequiredRandomChoice(locationIds),
    }));

  scenarioCharacterStore.saveScenarioCharacters(movedCharacters);
}

useScenarioStore.subscribe(async (newScenario, prevScenario) => {
  if (newScenario.activeScenario && prevScenario.activeScenario?.id !== newScenario.activeScenario.id) {
    await useScenarioCharacterStore.getState().loadScenarioCharacters();
  }

  if (newScenario.activeScenarioMap && newScenario.activeScenarioMap !== prevScenario.activeScenarioMap) {
    updateCharacterLocationsForMapChange(newScenario.activeScenarioMap);
  }
});

async function initialize() {
  const initialScenarioState = useScenarioStore.getState();
  if (initialScenarioState.activeScenario) {
    await useScenarioCharacterStore.getState().loadScenarioCharacters();
  }
  if (initialScenarioState.activeScenarioMap) {
    updateCharacterLocationsForMapChange(initialScenarioState.activeScenarioMap);
  }
}

await initialize();
