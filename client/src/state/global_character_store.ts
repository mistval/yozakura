import { create } from 'zustand';
import { doAsDataRead, doAsDataWrite, mainDatabase } from '../backend_bridge/database.js';
import * as Files from '../backend_bridge/files.js';
import type { Character } from '../engine/types.js';
import { assert } from '../errors/application_error.js';
import { importDemoGlobalCharacters } from '../backend_bridge/demo_import.js';
import { concatUniqueByIds } from '../util/array.js';
import { addOrReplaceVersionQueryParam } from '../util/id.js';
import { ephemeralStateSlice, IMMEDIATE_SYNC, type SyncOptions } from './ephemeral_state_helper.js';

const DATABASE_OBJECT_NAME = 'global_character';

type UpdatedGlobalCharacter = Character & {
  imageFile?: File | undefined;
};

type GlobalCharactersStoreState = {
  globalCharacters: Character[];
  globalCharactersById: Record<string, Character>;
  globalCharactersAreLoaded: boolean;

  setGlobalCharacters: (characters: Character[]) => void;
  installDemoCharactersGlobally: () => Promise<void>;
  refresh: () => Promise<void>;
  bustImageCache: (characterIds: string[]) => void;
  saveGlobalCharacter: (
    character: Character,
    imageFile?: File,
    syncOptions?: SyncOptions
  ) => Promise<Character>;
  saveScenarioCharacterAsGlobal: (scenarioChar: Character, imageFile?: File) => Promise<Character>;
  deleteGlobalCharacter: (character: Pick<Character, 'id' | 'imagePath'>) => void;
} & ReturnType<typeof ephemeralStateSlice<UpdatedGlobalCharacter>>;

function toPlainCharacter(updatedCharacter: UpdatedGlobalCharacter): Character {
  const { imageFile: _imageFile, ...character } = updatedCharacter;
  return character;
}

export const useGlobalCharactersStore = create<GlobalCharactersStoreState>((set, get) => ({
  globalCharacters: [],
  globalCharactersById: {},
  globalCharactersAreLoaded: false,

  ...ephemeralStateSlice<UpdatedGlobalCharacter>({
    setStoreState(entities: UpdatedGlobalCharacter[]) {
      get().setGlobalCharacters(concatUniqueByIds(get().globalCharacters, entities.map(toPlainCharacter)));
    },

    deleteStoreState(entities: UpdatedGlobalCharacter[]) {
      const ids = new Set(entities.map((entity) => entity.id));
      get().setGlobalCharacters(get().globalCharacters.filter((character) => !ids.has(character.id)));
    },

    async setDatabaseState(entities: UpdatedGlobalCharacter[]) {
      const debouncerKey = entities.length === 1 ? entities[0]!.id : `${DATABASE_OBJECT_NAME}.all`;

      await doAsDataWrite(
        async () => {
          const characters = await Promise.all(
            entities.map(async (entity) => {
              const character = get().globalCharactersById[entity.id];
              if (!character) {
                return undefined;
              }

              if (!entity.imageFile) {
                return character;
              }

              const baseImagePath = Files.getGlobalCharacterImagePath(character.id);
              await Files.upload(
                baseImagePath,
                entity.imageFile,
                entity.imageFile.type || 'application/octet-stream'
              );

              const latestCharacter = get().globalCharactersById[entity.id];
              if (!latestCharacter) {
                return undefined;
              }

              const updatedCharacter = {
                ...latestCharacter,
                imagePath: addOrReplaceVersionQueryParam(baseImagePath),
              };
              get().setGlobalCharacters(concatUniqueByIds(get().globalCharacters, [updatedCharacter]));
              return updatedCharacter;
            })
          );

          const existingCharacters = characters.filter((character): character is Character =>
            Boolean(character)
          );
          if (existingCharacters.length === 0) {
            return;
          }

          await mainDatabase.storeGlobalCharacters(existingCharacters);
        },
        DATABASE_OBJECT_NAME,
        { debouncerKey }
      );
    },

    deleteDatabaseState(entities: UpdatedGlobalCharacter[]) {
      const debouncerKey = entities.length === 1 ? entities[0]!.id : `${DATABASE_OBJECT_NAME}.all`;

      return doAsDataWrite(
        async () => {
          await mainDatabase.deleteGlobalCharacters(entities.map((entity) => entity.id));
          await Promise.all(entities.map((entity) => Files.deleteCharacterImage(entity.imagePath)));
        },
        DATABASE_OBJECT_NAME,
        { debouncerKey }
      );
    },

    getEntitiesFromDatabase(entities: UpdatedGlobalCharacter[]) {
      return doAsDataRead(
        () => mainDatabase.loadGlobalCharactersByIds(entities.map((entity) => entity.id)),
        `${DATABASE_OBJECT_NAME}.partial.refresh`
      );
    },
  }),

  setGlobalCharacters(characters: Character[]) {
    set({
      globalCharacters: characters,
      globalCharactersById: Object.fromEntries(characters.map((c) => [c.id, c])),
      globalCharactersAreLoaded: true,
    });
  },

  async refresh() {
    await doAsDataRead(async () => {
      const characters = await mainDatabase.loadGlobalCharacters();
      get().setGlobalCharacters(characters);
    }, 'global_character.all');
  },

  bustImageCache(characterIds: string[]) {
    for (const id of characterIds) {
      const character = get().globalCharactersById[id];
      if (character && Files.isApiFilePath(character.imagePath)) {
        void get().saveGlobalCharacter({
          ...character,
          imagePath: addOrReplaceVersionQueryParam(character.imagePath),
        });
      }
    }
  },

  async saveGlobalCharacter(
    character: Character,
    imageFile?: File,
    syncOptions: SyncOptions = IMMEDIATE_SYNC
  ) {
    assert(get().globalCharactersAreLoaded, 'Global characters not yet loaded');
    const withUpdatedFields = {
      ...character,
      updatedAt: new Date().toISOString(),
      imagePath: character.imagePath || '/images/character/default_character.png',
    } satisfies Character;

    await get().ephemeralStateHelper.stageUpdatedEntity(
      {
        ...withUpdatedFields,
        imageFile,
      },
      syncOptions
    );

    return get().globalCharactersById[withUpdatedFields.id] ?? withUpdatedFields;
  },

  async saveScenarioCharacterAsGlobal(scenarioChar: Character, imageFile?: File): Promise<Character> {
    assert(get().globalCharactersAreLoaded, 'Global characters not yet loaded');
    const targetId = scenarioChar.globalCharacterId?.trim() || scenarioChar.id;
    const imagePath = imageFile
      ? Files.getGlobalCharacterImagePath(targetId)
      : await Files.copyCharacterImageToGlobal(scenarioChar, targetId);

    const cleanGlobalChar: Character = {
      ...scenarioChar,
      id: targetId,
      globalCharacterId: targetId,
      scenarioId: '',
      locationId: '',
      groupIds: [],
      globalMemories: '',
      rollingConversationSummaries: [],
      nextConversationWithCharacterId: '',
      imagePath: Files.isApiFilePath(imagePath) ? addOrReplaceVersionQueryParam(imagePath) : imagePath,
    };

    return get().saveGlobalCharacter(cleanGlobalChar, imageFile);
  },

  deleteGlobalCharacter(character: Pick<Character, 'id' | 'imagePath'>) {
    assert(get().globalCharactersAreLoaded, 'Global characters not yet loaded');

    const target: UpdatedGlobalCharacter = get().globalCharactersById[character.id] ?? {
      id: character.id,
      imagePath: character.imagePath,
      createdAt: '',
      updatedAt: '',
      globalCharacterId: character.id,
      scenarioId: '',
      firstName: '',
      lastName: '',
      internalDescription: '',
      externalDescription: '',
      baseAppearanceTags: '',
      wardrobes: [],
      globalMemories: '',
      locationId: '',
      nextConversationWithCharacterId: '',
      exampleDialogue: '',
      rollingConversationSummaries: [],
      groupIds: [],
    };

    void get().ephemeralStateHelper.stageDeletedEntity(target, IMMEDIATE_SYNC);
  },

  async installDemoCharactersGlobally() {
    await importDemoGlobalCharacters();
    await get().refresh();
  },
}));

useGlobalCharactersStore.getState().refresh();
