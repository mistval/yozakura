import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../engine/types';

const mocks = vi.hoisted(() => ({
  doAsDataRead: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  doAsDataWrite: vi.fn(async (operation: () => Promise<void>) => operation()),
  loadGlobalCharacters: vi.fn(async () => []),
  storeGlobalCharacters: vi.fn(async (_characters: Character[]) => {}),
  copyCharacterImageToGlobal: vi.fn(
    async (_char: Character, globalId: string) => `/api/files/character_cards/${globalId}.png`
  ),
  upload: vi.fn(async (_path: string, _file: Blob, _type?: string) => {}),
  getGlobalCharacterImagePath: vi.fn((id: string) => `/api/files/character_cards/${id}.png`),
}));

vi.mock('../backend_bridge/database.js', () => ({
  createPersistedObject: <T extends object>(fields: T) => ({
    id: 'test-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  }),
  doAsDataRead: mocks.doAsDataRead,
  doAsDataWrite: mocks.doAsDataWrite,
  mainDatabase: {
    loadGlobalCharacters: mocks.loadGlobalCharacters,
    storeGlobalCharacters: mocks.storeGlobalCharacters,
  },
}));

vi.mock('../backend_bridge/files.js', () => ({
  copyCharacterImageToGlobal: mocks.copyCharacterImageToGlobal,
  upload: mocks.upload,
  getGlobalCharacterImagePath: mocks.getGlobalCharacterImagePath,
  deleteCharacterImage: vi.fn(),
}));

import { useGlobalCharactersStore } from './global_character_store';

describe('useGlobalCharactersStore.saveScenarioCharacterAsGlobal', () => {
  const sampleScenarioCharacter: Character = {
    id: '0123456789abcdef01',
    globalCharacterId: '0123456789abcdef00',
    scenarioId: '0123456789abcdef99',
    firstName: 'Holo',
    lastName: 'Wisewolf',
    internalDescription: 'A harvest wolf deity.',
    externalDescription: 'A traveling merchant girl with wolf ears.',
    baseAppearanceTags: 'wolf ears, bushy tail, amber eyes',
    imagePath: '/api/files/scenarios/0123456789abcdef99/characters/0123456789abcdef01.png',
    wardrobes: [],
    globalMemories: 'Met Lawrence in Pasloe.',
    locationId: '0123456789abcdef11',
    nextConversationWithCharacterId: '0123456789abcdef22',
    exampleDialogue: 'Holo: I am Holo the Wisewolf of Yoitsu.',
    rollingConversationSummaries: [
      {
        id: '0123456789abcdef33',
        conversationId: '0123456789abcdef44',
        turnNumber: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        summary: 'Lawrence offered apples to Holo.',
        participantIds: ['0123456789abcdef01', '0123456789abcdef22'],
        chatMedium: 'in_person',
      },
    ],
    groupIds: ['merchants_guild'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useGlobalCharactersStore.getState().setGlobalCharacters([]);
  });

  it('resets scenario runtime fields and stores character under target global ID', async () => {
    const store = useGlobalCharactersStore.getState();

    const saved = await store.saveScenarioCharacterAsGlobal(sampleScenarioCharacter);

    expect(saved.id).toBe('0123456789abcdef00');
    expect(saved.globalCharacterId).toBe('0123456789abcdef00');
    expect(saved.scenarioId).toBe('');
    expect(saved.locationId).toBe('');
    expect(saved.groupIds).toEqual([]);
    expect(saved.globalMemories).toBe('');
    expect(saved.rollingConversationSummaries).toEqual([]);
    expect(saved.nextConversationWithCharacterId).toBe('');
    expect(saved.firstName).toBe('Holo');
    expect(saved.lastName).toBe('Wisewolf');
    expect(saved.imagePath).toContain('/api/files/character_cards/0123456789abcdef00.png?v=');

    expect(mocks.copyCharacterImageToGlobal).toHaveBeenCalledWith(
      sampleScenarioCharacter,
      '0123456789abcdef00'
    );
    expect(mocks.storeGlobalCharacters).toHaveBeenCalledWith([saved]);

    // Check in store state
    const currentStore = useGlobalCharactersStore.getState();
    expect(currentStore.globalCharactersById['0123456789abcdef00']).toEqual(saved);
  });

  it('falls back to scenarioChar.id if globalCharacterId is empty', async () => {
    const store = useGlobalCharactersStore.getState();
    const scenarioCharWithoutGlobalId: Character = {
      ...sampleScenarioCharacter,
      globalCharacterId: '',
    };

    const saved = await store.saveScenarioCharacterAsGlobal(scenarioCharWithoutGlobalId);

    expect(saved.id).toBe('0123456789abcdef01');
    expect(saved.globalCharacterId).toBe('0123456789abcdef01');
    expect(mocks.copyCharacterImageToGlobal).toHaveBeenCalledWith(
      scenarioCharWithoutGlobalId,
      '0123456789abcdef01'
    );
  });

  it('preserves static /images/ path without adding query params', async () => {
    mocks.copyCharacterImageToGlobal.mockResolvedValueOnce('/images/character/default_character.png');
    const store = useGlobalCharactersStore.getState();
    const staticImageChar: Character = {
      ...sampleScenarioCharacter,
      imagePath: '/images/character/default_character.png',
    };

    const saved = await store.saveScenarioCharacterAsGlobal(staticImageChar);

    expect(saved.imagePath).toBe('/images/character/default_character.png');
  });

  it('uploads new image file when provided instead of copying existing image', async () => {
    const store = useGlobalCharactersStore.getState();
    const mockFile = new File(['image-bytes'], 'holo.png', { type: 'image/png' });

    const saved = await store.saveScenarioCharacterAsGlobal(sampleScenarioCharacter, mockFile);

    expect(mocks.upload).toHaveBeenCalledWith(
      '/api/files/character_cards/0123456789abcdef00.png',
      mockFile,
      'image/png'
    );
    expect(mocks.copyCharacterImageToGlobal).not.toHaveBeenCalled();
    expect(saved.imagePath).toContain('/api/files/character_cards/0123456789abcdef00.png?v=');
  });
});
