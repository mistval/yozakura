import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterRelationship } from '../engine/types';

const mocks = vi.hoisted(() => ({
  doAsDataRead: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  doAsDataWrite: vi.fn(async (operation: () => Promise<void>) => operation()),
  loadCharacterRelationshipsByPairs: vi.fn(async () => []),
  storeCharacterRelationships: vi.fn(async (_relationships: CharacterRelationship[]) => {}),
  scenarioSubscribe: vi.fn(),
}));

vi.mock('../backend_bridge/database.js', () => ({
  createPersistedObject: <T extends object>(fields: T) => ({
    id: 'relationship-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  }),
  doAsDataRead: mocks.doAsDataRead,
  doAsDataWrite: mocks.doAsDataWrite,
  loadCharacterRelationshipsByPairs: mocks.loadCharacterRelationshipsByPairs,
  storeCharacterRelationships: mocks.storeCharacterRelationships,
}));

vi.mock('./scenario_store.js', () => {
  const scenario = {
    id: 'scenario-one',
    turnNumber: 5,
  };
  const useScenarioStore = Object.assign(vi.fn(), {
    getState: () => ({ activeScenario: scenario }),
    subscribe: mocks.scenarioSubscribe,
  });

  return {
    getRequiredActiveScenario: () => scenario,
    useScenarioStore,
  };
});

import { DEFERRED_SYNC } from './ephemeral_state_helper';
import { useScenarioCharacterRelationshipStore } from './scenario_character_relationship_store';

describe('scenario character relationship ephemeral state integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes a deferred relationship update visible before committing it', async () => {
    const store = useScenarioCharacterRelationshipStore.getState();

    await store.saveRelationshipFields(
      { fromId: 'character-a', toId: 'character-b' },
      { memory: 'Updated memory' },
      DEFERRED_SYNC
    );

    expect(mocks.storeCharacterRelationships).not.toHaveBeenCalled();
    expect(await store.getCharacterRelationship('character-a', 'character-b')).toMatchObject({
      memory: 'Updated memory',
    });

    await store.commitAllChanges();

    expect(mocks.storeCharacterRelationships).toHaveBeenCalledOnce();
    expect(mocks.storeCharacterRelationships.mock.calls[0]![0]).toMatchObject([
      {
        fromId: 'character-a',
        toId: 'character-b',
        memory: 'Updated memory',
      },
    ]);
  });
});
