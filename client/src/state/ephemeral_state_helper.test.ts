import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./scenario_store', () => ({
  useScenarioStore: {
    subscribe: vi.fn(),
  },
}));

import {
  DEFERRED_SYNC,
  EphemeralStateHelper,
  IMMEDIATE_SYNC,
  ephemeralStateSlice,
  isEntityInDeferredSync,
  type IEphemeralStateDelegate,
} from './ephemeral_state_helper';
import { useScenarioStore } from './scenario_store';

type TestEntity = {
  id: string;
  value: string;
};

function createHelper() {
  const store = new Map<string, TestEntity>();
  const delegate: IEphemeralStateDelegate<TestEntity> = {
    setStoreState: vi.fn((entities) => {
      for (const entity of entities) {
        store.set(entity.id, entity);
      }
    }),
    deleteStoreState: vi.fn((entities) => {
      for (const entity of entities) {
        store.delete(entity.id);
      }
    }),
    setDatabaseState: vi.fn(async () => {}),
    deleteDatabaseState: vi.fn(async () => {}),
    refreshStoreStateFromDatabase: vi.fn(async () => {}),
  };

  return {
    delegate,
    helper: new EphemeralStateHelper(delegate),
    store,
  };
}

describe('EphemeralStateHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies and persists immediate updates', async () => {
    const { delegate, helper, store } = createHelper();
    const entity = { id: 'one', value: 'updated' };

    await helper.stageUpdatedEntity(entity, IMMEDIATE_SYNC);

    expect(store.get(entity.id)).toEqual(entity);
    expect(delegate.setDatabaseState).toHaveBeenCalledOnce();
    expect(delegate.setDatabaseState).toHaveBeenCalledWith([entity]);
  });

  it('makes deferred updates visible before committing them', async () => {
    const { delegate, helper, store } = createHelper();
    const entity = { id: 'one', value: 'updated' };

    await helper.stageUpdatedEntity(entity, DEFERRED_SYNC);

    expect(store.get(entity.id)).toEqual(entity);
    expect(delegate.setDatabaseState).not.toHaveBeenCalled();

    await helper.commitChanges();

    expect(delegate.setDatabaseState).toHaveBeenCalledWith([entity]);
  });

  it('commits only the latest deferred operation for each entity', async () => {
    const { delegate, helper } = createHelper();
    const first = { id: 'one', value: 'first' };
    const second = { id: 'one', value: 'second' };

    await helper.stageUpdatedEntity(first, DEFERRED_SYNC);
    await helper.stageUpdatedEntity(second, DEFERRED_SYNC);
    await helper.stageDeletedEntity(second, DEFERRED_SYNC);
    await helper.commitChanges();

    expect(delegate.setDatabaseState).not.toHaveBeenCalled();
    expect(delegate.deleteDatabaseState).toHaveBeenCalledWith([second]);
  });

  it('rejects an immediate conflict before mutating store state', async () => {
    const { delegate, helper, store } = createHelper();
    const deferred = { id: 'one', value: 'deferred' };
    const immediate = { id: 'one', value: 'immediate' };

    await helper.stageUpdatedEntity(deferred, DEFERRED_SYNC);

    expect(() => helper.stageUpdatedEntity(immediate, IMMEDIATE_SYNC)).toThrow(
      'Cannot immediately sync entity. Deferred sync is pending.'
    );
    expect(store.get(deferred.id)).toEqual(deferred);
    expect(delegate.setStoreState).toHaveBeenCalledOnce();
  });

  it('passes batches to each delegate once', async () => {
    const { delegate, helper } = createHelper();
    const entities = [
      { id: 'one', value: 'first' },
      { id: 'two', value: 'second' },
    ];

    await helper.stageUpdatedEntities(entities, DEFERRED_SYNC);
    await helper.commitChanges();

    expect(delegate.setStoreState).toHaveBeenCalledOnce();
    expect(delegate.setStoreState).toHaveBeenCalledWith(entities);
    expect(delegate.setDatabaseState).toHaveBeenCalledOnce();
    expect(delegate.setDatabaseState).toHaveBeenCalledWith(entities);
  });

  it('refreshes affected entities when pending changes are discarded', async () => {
    const { delegate, helper } = createHelper();
    const entity = { id: 'one', value: 'updated' };

    await helper.stageUpdatedEntity(entity, DEFERRED_SYNC);
    await helper.discardPendingChanges();

    expect(delegate.refreshStoreStateFromDatabase).toHaveBeenCalledWith([entity]);

    await helper.commitChanges();
    expect(delegate.setDatabaseState).not.toHaveBeenCalled();
  });

  it('abandons pending changes without persistence or refresh', async () => {
    const { delegate, helper } = createHelper();

    await helper.stageUpdatedEntity({ id: 'one', value: 'updated' }, DEFERRED_SYNC);
    helper.abandonPendingChanges();
    await helper.commitChanges();

    expect(delegate.setDatabaseState).not.toHaveBeenCalled();
    expect(delegate.refreshStoreStateFromDatabase).not.toHaveBeenCalled();
  });

  it('abandons pending changes when its configured scenario subscription observes a new ID', async () => {
    const { delegate } = createHelper();
    const slice = ephemeralStateSlice(delegate, {
      discardPendingChangesOnScenarioChange: true,
    });

    await slice.ephemeralStateHelper.stageUpdatedEntity({ id: 'one', value: 'updated' }, DEFERRED_SYNC);

    const subscribe = vi.mocked(useScenarioStore.subscribe);
    const listener = subscribe.mock.calls[0]?.[0];
    expect(listener).toBeDefined();

    (listener as (state: any, previousState: any) => void)(
      { activeScenario: { id: 'new' } },
      { activeScenario: { id: 'old' } }
    );
    await slice.commitAllChanges();

    expect(delegate.setDatabaseState).not.toHaveBeenCalled();
    expect(delegate.refreshStoreStateFromDatabase).not.toHaveBeenCalled();
  });

  it('tracks deferred sync entities in useDeferredSyncStore and releases them on commit', async () => {
    const { helper } = createHelper();
    const entity = { id: 'track-1', value: 'v1' };

    expect(isEntityInDeferredSync(entity.id)).toBe(false);

    await helper.stageUpdatedEntity(entity, DEFERRED_SYNC);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);

    await helper.commitChanges();
    expect(isEntityInDeferredSync(entity.id)).toBe(false);
  });

  it('releases deferred sync entities on discard or abandon', async () => {
    const { helper } = createHelper();
    const entity = { id: 'track-2', value: 'v1' };

    await helper.stageUpdatedEntity(entity, DEFERRED_SYNC);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);
    await helper.discardPendingChanges();
    expect(isEntityInDeferredSync(entity.id)).toBe(false);

    await helper.stageUpdatedEntity(entity, DEFERRED_SYNC);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);
    helper.abandonPendingChanges();
    expect(isEntityInDeferredSync(entity.id)).toBe(false);
  });

  it('supports upfront locking via lockEntitiesForDeferredSync and releases on commit', async () => {
    const { helper } = createHelper();
    const entity = { id: 'upfront-1', value: 'initial' };

    expect(isEntityInDeferredSync(entity.id)).toBe(false);

    helper.lockEntitiesForDeferredSync([entity]);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);

    expect(() => helper.stageUpdatedEntity({ id: entity.id, value: 'immediate' }, IMMEDIATE_SYNC)).toThrow(
      'Cannot immediately sync entity. Deferred sync is pending.'
    );

    await helper.commitChanges();
    expect(isEntityInDeferredSync(entity.id)).toBe(false);
  });

  it('upgrades a locked operation when staged and does not clobber existing operations', async () => {
    const { helper, delegate } = createHelper();
    const entity = { id: 'lock-upgrade-1', value: 'initial' };

    helper.lockEntitiesForDeferredSync([entity]);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);

    // Staging deferred upsert upgrades the lock
    await helper.stageUpdatedEntity({ id: entity.id, value: 'new-val' }, DEFERRED_SYNC);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);

    // Calling lock again should not clobber the staged upsert
    helper.lockEntitiesForDeferredSync([entity]);

    await helper.commitChanges();
    expect(delegate.setDatabaseState).toHaveBeenCalledWith([{ id: entity.id, value: 'new-val' }]);
    expect(isEntityInDeferredSync(entity.id)).toBe(false);
  });

  it('discarding upfront locks without mutations releases sync status without database refresh', async () => {
    const { helper, delegate } = createHelper();
    const entity = { id: 'lock-discard-1', value: 'initial' };

    helper.lockEntitiesForDeferredSync([entity]);
    expect(isEntityInDeferredSync(entity.id)).toBe(true);

    await helper.discardPendingChanges();
    expect(delegate.refreshStoreStateFromDatabase).not.toHaveBeenCalled();
    expect(isEntityInDeferredSync(entity.id)).toBe(false);
  });
});
