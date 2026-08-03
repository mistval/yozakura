import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../engine/types';

const mocks = vi.hoisted(() => ({
  doAsDataWrite: vi.fn(async (operation: () => Promise<void>) => operation()),
  filesUpload: vi.fn(async () => {}),
  storeScenarioCharacters: vi.fn(async (_characters: Character[]) => {}),
  scenarioSubscribe: vi.fn(),
}));

vi.mock('../backend_bridge/database.js', () => ({
  doAsDataRead: vi.fn(),
  doAsDataWrite: mocks.doAsDataWrite,
  deleteScenarioCharacters: vi.fn(async () => {}),
  loadScenarioCharacters: vi.fn(async () => []),
  loadScenarioCharactersByIds: vi.fn(async () => []),
  storeScenarioCharacters: mocks.storeScenarioCharacters,
}));

vi.mock('../backend_bridge/files.js', () => ({
  copyCharacterImageForScenario: vi.fn(),
  upload: mocks.filesUpload,
}));

vi.mock('./scenario_store.js', () => {
  const scenarioState = {
    activeScenario: undefined,
    activeScenarioMap: undefined,
  };
  const useScenarioStore = Object.assign(vi.fn(), {
    getState: () => scenarioState,
    subscribe: mocks.scenarioSubscribe,
  });

  return {
    getRequiredActiveScenario: vi.fn(),
    getRequiredActiveScenarioMap: vi.fn(),
    useScenarioStore,
  };
});

import { useScenarioCharacterStore } from './scenario_character_store';

describe('scenario character ephemeral state integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScenarioCharacterStore.getState().setScenarioCharacters([]);
  });

  it('saves an image through the helper without retaining the File in Zustand or SQLite data', async () => {
    const character = {
      id: 'character-one',
      imagePath: 'scenario/one/character.png',
      firstName: 'Before',
    } as Character;
    const imageFile = new File(['image'], 'character.png', { type: 'image/png' });

    useScenarioCharacterStore.getState().setScenarioCharacters([character]);
    useScenarioCharacterStore.getState().saveScenarioCharacter(
      {
        ...character,
        firstName: 'After',
      },
      imageFile
    );

    await vi.waitFor(() => expect(mocks.storeScenarioCharacters).toHaveBeenCalledOnce());

    expect(mocks.filesUpload).toHaveBeenCalledWith(character.imagePath, imageFile, imageFile.type);

    const persistedCharacter = mocks.storeScenarioCharacters.mock.calls[0]![0][0]!;
    expect(persistedCharacter.firstName).toBe('After');
    expect(persistedCharacter.imagePath).toMatch(/^scenario\/one\/character\.png\?v=/);
    expect(persistedCharacter).not.toHaveProperty('imageFile');

    const storedCharacter = useScenarioCharacterStore.getState().scenarioCharactersById[character.id]!;
    expect(storedCharacter.imagePath).toBe(persistedCharacter.imagePath);
    expect(storedCharacter).not.toHaveProperty('imageFile');
  });
});
