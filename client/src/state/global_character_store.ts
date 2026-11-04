import { create } from 'zustand';
import { doAsDataRead, doAsDataWrite, mainDatabase } from '../backend_bridge/database.js';
import * as Files from '../backend_bridge/files.js';
import type { Character } from '../engine/types.js';
import { assert } from '../errors/application_error.js';
import { importDemoGlobalCharacters } from '../backend_bridge/demo_import.js';
import { concatUniqueById } from '../util/array.js';
import { addOrReplaceVersionQueryParam } from '../util/id.js';

export const useGlobalCharactersStore = create<{
  globalCharacters: Character[];
  globalCharactersById: Record<string, Character>;
  globalCharactersAreLoaded: boolean;

  setGlobalCharacters: (characters: Character[]) => void;
  installDemoCharactersGlobally: () => Promise<void>;
  refresh: () => Promise<void>;
  bustImageCache: (characterIds: string[]) => void;
  saveGlobalCharacter: (character: Character, imageFile?: File) => Promise<Character>;
  saveScenarioCharacterAsGlobal: (scenarioChar: Character, imageFile?: File) => Promise<Character>;
  deleteGlobalCharacter: (character: Character) => void;
}>((set, get) => ({
  globalCharacters: [],
  globalCharactersById: {},
  globalCharactersAreLoaded: false,

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

  async saveGlobalCharacter(character: Character, imageFile?: File) {
    assert(get().globalCharactersAreLoaded, 'Global characters not yet loaded');
    const baseImagePath = Files.getGlobalCharacterImagePath(character.id);
    const withUpdatedFields = {
      ...character,
      updatedAt: new Date().toISOString(),
      imagePath: character.imagePath || '/images/character/default_character.png',
    } satisfies Character;

    get().setGlobalCharacters(concatUniqueById(get().globalCharacters, withUpdatedFields));

    await doAsDataWrite(
      async () => {
        let latestCharacter = get().globalCharactersById[withUpdatedFields.id];
        if (!latestCharacter) {
          return;
        }

        if (imageFile) {
          await Files.upload(
            baseImagePath,
            imageFile,
            imageFile.type || 'application/octet-stream'
          );

          latestCharacter = get().globalCharactersById[withUpdatedFields.id];
          if (!latestCharacter) {
            return;
          }

          latestCharacter = {
            ...latestCharacter,
            imagePath: addOrReplaceVersionQueryParam(baseImagePath),
          };
          get().setGlobalCharacters(concatUniqueById(get().globalCharacters, latestCharacter));
        }

        await mainDatabase.storeGlobalCharacters([latestCharacter]);
      },
      'global_character',
      {
        debouncerKey: withUpdatedFields.id,
      }
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

    void doAsDataWrite(
      async () => {
        await mainDatabase.deleteGlobalCharacter(character.id);
        await Files.deleteCharacterImage(character.imagePath);
      },
      'global_character',
      {
        debouncerKey: character.id,
      }
    );

    const newCharacters = get().globalCharacters.filter((c) => c.id !== character.id);
    get().setGlobalCharacters(newCharacters);
  },

  async installDemoCharactersGlobally() {
    await importDemoGlobalCharacters();
    await get().refresh();
  },
}));

useGlobalCharactersStore.getState().refresh();
