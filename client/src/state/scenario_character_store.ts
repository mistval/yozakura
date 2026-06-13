import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import * as Files from '../backend_bridge/files.js';
import { type WorldMap, type ConversationSummary, type Character, type Scenario } from '../engine/types.js';
import { assertNonNullish } from '../errors/application_error.js';
import { getRequiredRandomChoice, trimNewestByCreatedAt } from '../util/array.js';
import {
  getRequiredActiveScenario,
  getRequiredActiveScenarioMap,
  useScenarioStore,
} from './scenario_store.js';
import { addOrReplaceVersionQueryParam, newId } from '../util/id.js';

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
  saveScenarioCharacters: (character: Character[]) => void;
  saveScenarioCharacter: (
    character: Character,
    imageFile?: File,
    setter?: (prevCharacter: Character | undefined) => Character
  ) => void;
  saveInactiveScenarioCharacterImmediate: (character: Character) => Promise<void>;
  saveScenarioCharacterFields: (id: string, fields: Partial<Character>) => void;
  addConversationSummary: (characterId: string, summary: ConversationSummary) => void;
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
};

const DATABASE_OBJECT_NAME = 'scenario_character';

async function copyGlobalCharacterForScenario(character: Character, scenarioId: string, map: WorldMap) {
  return {
    ...character,
    scenarioId: scenarioId,
    id: newId(),
    locationId: getRequiredRandomChoice(map.locations).id,
    imagePath: await Files.copyCharacterImageForScenario(scenarioId, character),
    globalCharacterId: character.id,
  };
}

function getCharacterDataStructuresFromArray(characters: Character[]) {
  return {
    scenarioCharacters: characters,
    scenarioCharactersById: Object.fromEntries(characters.map((character) => [character.id, character])),
  } satisfies Pick<ScenarioCharacterStoreState, 'scenarioCharacters' | 'scenarioCharactersById'>;
}

function getCharacterDataStructuresFromDict(characters: Record<string, Character>) {
  return {
    scenarioCharacters: Object.values(characters),
    scenarioCharactersById: characters,
  } satisfies Pick<ScenarioCharacterStoreState, 'scenarioCharacters' | 'scenarioCharactersById'>;
}

export const useScenarioCharacterStore = create<ScenarioCharacterStoreState>((set, get) => ({
  scenarioCharacters: [],
  scenarioCharactersById: {},
  scenarioCharactersAreLoaded: false,

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
    if (!get().scenarioCharactersById[characterId]) {
      return;
    }

    void Database.doAsDataWrite(async () => {
      await Database.deleteScenarioCharacter(characterId);
    }, DATABASE_OBJECT_NAME);

    get().removeCharacterLocal(characterId);
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

    const state = get();
    const newCharacter = setter(state.scenarioCharactersById[character.id]);

    set(
      getCharacterDataStructuresFromDict({
        ...state.scenarioCharactersById,
        [character.id]: newCharacter,
      })
    );

    void Database.doAsDataWrite(
      async () => {
        const latestCharacter = get().scenarioCharactersById[character.id];
        if (!latestCharacter) {
          return;
        }

        await Database.storeScenarioCharacter(latestCharacter);

        if (imageFile) {
          await Files.upload(
            latestCharacter.imagePath,
            imageFile,
            imageFile.type || 'application/octet-stream'
          );

          get().saveScenarioCharacterFields(character.id, {
            imagePath: addOrReplaceVersionQueryParam(character.imagePath),
          });
        }
      },
      DATABASE_OBJECT_NAME,
      {
        debouncerKey: character.id,
      }
    );
  },

  saveScenarioCharacterFields: (id, fields) => {
    const char = get().scenarioCharactersById[id];
    assertNonNullish(char, 'saveScenarioCharacterFields called for non-existent characterId: ' + id);

    return get().saveScenarioCharacter(char, undefined, (prev) => {
      assertNonNullish(
        prev,
        'saveScenarioCharacterFields setter called with non-existent previous character for id: ' + id
      );

      return {
        ...prev,
        ...fields,
      };
    });
  },

  getCharactersByIds: (ids) => {
    const byId = get().scenarioCharactersById;
    const filtered = ids.map((id) => byId[id]).filter(Boolean) as Character[];
    return filtered;
  },

  addConversationSummary: (characterId, summary) => {
    const character = get().getRequiredCharacterById(characterId);

    return get().saveScenarioCharacter(character, undefined, (prev) => {
      assertNonNullish(
        prev,
        'addConversationSummary setter called with non-existent previous character for id: ' + characterId
      );

      return {
        ...prev,
        rollingConversationSummaries: trimNewestByCreatedAt(
          prev.rollingConversationSummaries.concat(summary)
        ),
      };
    });
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

  saveScenarioCharacters(characters: Character[]) {
    if (characters.length === 0) {
      return;
    }

    const newCharactersById = {
      ...get().scenarioCharactersById,
      ...Object.fromEntries(characters.map((c) => [c.id, c])),
    } satisfies { [id: string]: Character };

    set(getCharacterDataStructuresFromDict(newCharactersById));

    void Database.doAsDataWrite(async () => {
      const latestCharacters = characters
        .map((c) => get().scenarioCharactersById[c.id])
        .filter((c): c is Character => Boolean(c));

      if (latestCharacters.length === 0) {
        return;
      }

      await Database.storeScenarioCharacters(latestCharacters);
    }, `${DATABASE_OBJECT_NAME}.all`);
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

function updateCharacterLocationsForMapChange(map: WorldMap) {
  const scenarioCharacterStore = useScenarioCharacterStore.getState();
  const locationIds = map.locations.map((location) => location.id);
  const locationIdsSet = new Set(locationIds);

  const movedCharacters = scenarioCharacterStore.scenarioCharacters.map((c) => {
    return {
      ...c,
      locationId: locationIdsSet.has(c.locationId) ? c.locationId : getRequiredRandomChoice(locationIds),
    };
  });

  scenarioCharacterStore.saveScenarioCharacters(movedCharacters);
}

useScenarioStore.subscribe(async (newScenario, prevScenario) => {
  if (newScenario.activeScenario && prevScenario.activeScenario?.id !== newScenario.activeScenario.id) {
    await useScenarioCharacterStore.getState().loadScenarioCharacters();
  }

  if (
    newScenario.activeScenarioMap &&
    newScenario.activeScenarioMap.id !== prevScenario.activeScenario?.mapId
  ) {
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
