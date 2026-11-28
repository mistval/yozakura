import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./scenario_store', () => ({
  useScenarioStore: {
    subscribe: vi.fn(),
  },
}));

import {
  DEFERRED_SYNC,
  DEFERRED_SYNC_OWNERS,
  EphemeralStateHelper,
  IMMEDIATE_SYNC,
  USER_SYNC,
  commitDeferredSyncForOwner,
  discardDeferredSyncForOwner,
  ephemeralStateSlice,
  getActiveDeferredSyncOwner,
  isEntityInDeferredSync,
  isEntityLockedForEditing,
  useDeferredSyncStore,
  type IEphemeralStateDelegate,
} from './ephemeral_state_helper';
import { useScenarioStore } from './scenario_store';

type TestEntity = {
  id: string;
  value: string;
};

function createHelper() {
  const store = new Map<string, TestEntity>();
  const db = new Map<string, TestEntity>();
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
    setDatabaseState: vi.fn(async (entities) => {
      for (const entity of entities) {
        db.set(entity.id, entity);
      }
    }),
    deleteDatabaseState: vi.fn(async (entities) => {
      for (const entity of entities) {
        db.delete(entity.id);
      }
    }),
    getEntitiesFromDatabase: vi.fn(async (entities: TestEntity[]) => {
      return entities
        .map((entity) => db.get(entity.id))
        .filter((entity): entity is TestEntity => Boolean(entity));
    }),
  };

  return {
    db,
    delegate,
    helper: new EphemeralStateHelper(delegate),
    store,
  };
}

describe('EphemeralStateHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDeferredSyncStore.setState({
      activeOwner: undefined,
      syncingEntityIds: {},
      mutatedEntityIds: {},
    });
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

  it('refreshes affected entities when pending changes are discarded, restoring persisted and deleting non-persisted', async () => {
    const { db, delegate, helper, store } = createHelper();
    const persisted = { id: 'persisted', value: 'original' };
    db.set(persisted.id, persisted);
    store.set(persisted.id, persisted);

    const updatedPersisted = { id: 'persisted', value: 'updated' };
    const newlyCreated = { id: 'new-uncommitted', value: 'draft' };

    await helper.stageUpdatedEntities([updatedPersisted, newlyCreated], DEFERRED_SYNC);
    expect(store.get(persisted.id)).toEqual(updatedPersisted);
    expect(store.get(newlyCreated.id)).toEqual(newlyCreated);

    await helper.discardPendingChanges();

    expect(delegate.getEntitiesFromDatabase).toHaveBeenCalledWith([updatedPersisted, newlyCreated]);
    expect(delegate.deleteStoreState).toHaveBeenCalledWith([newlyCreated]);
    expect(delegate.setStoreState).toHaveBeenLastCalledWith([persisted]);
    expect(store.get(persisted.id)).toEqual(persisted);
    expect(store.has(newlyCreated.id)).toBe(false);

    await helper.commitChanges();
    expect(delegate.setDatabaseState).not.toHaveBeenCalled();
  });

  it('abandons pending changes without persistence or refresh', async () => {
    const { delegate, helper } = createHelper();

    await helper.stageUpdatedEntity({ id: 'one', value: 'updated' }, DEFERRED_SYNC);
    helper.abandonPendingChanges();
    await helper.commitChanges();

    expect(delegate.setDatabaseState).not.toHaveBeenCalled();
    expect(delegate.getEntitiesFromDatabase).not.toHaveBeenCalled();
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
    expect(delegate.getEntitiesFromDatabase).not.toHaveBeenCalled();
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
    expect(delegate.getEntitiesFromDatabase).not.toHaveBeenCalled();
    expect(isEntityInDeferredSync(entity.id)).toBe(false);
  });

  it('allows multi-store locking under one owner and clears activeOwner only when all stores release', async () => {
    const { helper: helper1 } = createHelper();
    const { helper: helper2 } = createHelper();
    const entity1 = { id: 'owner-multi-1', value: 'v1' };
    const entity2 = { id: 'owner-multi-2', value: 'v2' };

    helper1.lockEntitiesForDeferredSync([entity1], 'owner_a');
    helper2.lockEntitiesForDeferredSync([entity2], 'owner_a');

    expect(getActiveDeferredSyncOwner()).toBe('owner_a');
    expect(isEntityInDeferredSync(entity1.id)).toBe(true);
    expect(isEntityInDeferredSync(entity2.id)).toBe(true);

    await helper1.commitChanges();
    expect(isEntityInDeferredSync(entity1.id)).toBe(false);
    expect(isEntityInDeferredSync(entity2.id)).toBe(true);
    expect(getActiveDeferredSyncOwner()).toBe('owner_a');

    await helper2.commitChanges();
    expect(isEntityInDeferredSync(entity2.id)).toBe(false);
    expect(getActiveDeferredSyncOwner()).toBeUndefined();
  });

  it('rejects synchronous locking by a different owner while a lock is held', async () => {
    const { helper: helper1 } = createHelper();
    const { helper: helper2, delegate: delegate2 } = createHelper();
    const entity1 = { id: 'conflict-1', value: 'v1' };
    const entity2 = { id: 'conflict-2', value: 'v2' };

    helper1.lockEntitiesForDeferredSync([entity1], 'owner_a');

    expect(() => helper2.lockEntitiesForDeferredSync([entity2], 'owner_b')).toThrow(
      'Cannot acquire deferred-sync lock for "owner_b": currently held by "owner_a".'
    );
    expect(getActiveDeferredSyncOwner()).toBe('owner_a');
    expect(isEntityInDeferredSync(entity2.id)).toBe(false);

    // Ensure entity2 was not added to helper2 pendingOperations
    helper2.stageUpdatedEntity(entity2, IMMEDIATE_SYNC);
    expect(delegate2.setDatabaseState).toHaveBeenCalledWith([entity2]);
  });

  it('auto-defers sync into an active owner transaction and supports cross-store commit and discard', async () => {
    const { helper: helper1, store: store1, delegate: delegate1 } = createHelper();
    const { helper: helper2, store: store2, delegate: delegate2 } = createHelper();
    const primary = { id: 'auto-1', value: 'orig-1' };
    const secondary = { id: 'auto-2', value: 'orig-2' };

    await helper1.stageUpdatedEntity(primary, IMMEDIATE_SYNC);
    await helper2.stageUpdatedEntity(secondary, IMMEDIATE_SYNC);
    vi.clearAllMocks();

    // When no transaction is open, USER_SYNC still writes immediately.
    await helper2.stageUpdatedEntity({ id: secondary.id, value: 'immediate-ok' }, USER_SYNC);
    expect(delegate2.setDatabaseState).toHaveBeenCalledTimes(1);

    // When objectEditor holds a lock on helper1, edits on both helpers defer into that transaction.
    helper1.lockEntitiesForDeferredSync([primary], DEFERRED_SYNC_OWNERS.objectEditor);
    expect(isEntityInDeferredSync(primary.id, { ignoreOwner: DEFERRED_SYNC_OWNERS.objectEditor })).toBe(
      false
    );

    vi.clearAllMocks();
    await helper1.stageUpdatedEntity({ id: primary.id, value: 'edited-1' }, USER_SYNC);
    await helper2.stageUpdatedEntity({ id: secondary.id, value: 'edited-2' }, USER_SYNC);
    expect(delegate1.setDatabaseState).not.toHaveBeenCalled();
    expect(delegate2.setDatabaseState).not.toHaveBeenCalled();
    expect(isEntityInDeferredSync(secondary.id)).toBe(true);

    // Discarding owner transaction rolls back both stores cleanly and clears the owner.
    await discardDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor);
    expect(store1.get(primary.id)?.value).toBe('orig-1');
    expect(store2.get(secondary.id)?.value).toBe('immediate-ok');
    expect(getActiveDeferredSyncOwner()).toBeUndefined();
    expect(isEntityInDeferredSync(primary.id)).toBe(false);
    expect(isEntityInDeferredSync(secondary.id)).toBe(false);

    // Committing owner transaction flushes both stores and clears the owner.
    helper1.lockEntitiesForDeferredSync([primary], DEFERRED_SYNC_OWNERS.objectEditor);
    await helper1.stageUpdatedEntity({ id: primary.id, value: 'committed-1' }, USER_SYNC);
    await helper2.stageUpdatedEntity({ id: secondary.id, value: 'committed-2' }, USER_SYNC);
    await commitDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor);
    expect(delegate1.setDatabaseState).toHaveBeenCalledWith([{ id: primary.id, value: 'committed-1' }]);
    expect(delegate2.setDatabaseState).toHaveBeenCalledWith([{ id: secondary.id, value: 'committed-2' }]);
    expect(getActiveDeferredSyncOwner()).toBeUndefined();
  });

  it('tracks mutatedEntityIds only for staged upsert/delete operations and clears them on commit or discard', async () => {
    const { helper } = createHelper();
    const lockedOnly = { id: 'mut-lock-1', value: 'initial' };
    const upserted = { id: 'mut-upsert-1', value: 'v1' };
    const deleted = { id: 'mut-delete-1', value: 'v2' };

    helper.lockEntitiesForDeferredSync([lockedOnly], 'owner_a');
    expect(useDeferredSyncStore.getState().syncingEntityIds[lockedOnly.id]).toBe(true);
    expect(useDeferredSyncStore.getState().mutatedEntityIds).toEqual({});

    await helper.stageUpdatedEntity(upserted, DEFERRED_SYNC);
    expect(useDeferredSyncStore.getState().mutatedEntityIds).toEqual({
      [upserted.id]: true,
    });

    await helper.commitChanges();
    expect(useDeferredSyncStore.getState().mutatedEntityIds).toEqual({});
    expect(useDeferredSyncStore.getState().syncingEntityIds).toEqual({});

    await helper.stageDeletedEntity(deleted, DEFERRED_SYNC);
    expect(useDeferredSyncStore.getState().mutatedEntityIds).toEqual({
      [deleted.id]: true,
    });

    await helper.discardPendingChanges();
    expect(useDeferredSyncStore.getState().mutatedEntityIds).toEqual({});
    expect(useDeferredSyncStore.getState().syncingEntityIds).toEqual({});
  });

  it('scopes commitDeferredSyncForOwner to helpers owned by the given owner without flushing ownerless helpers', async () => {
    const { helper: ownerHelper, delegate: ownerDelegate } = createHelper();
    const { helper: ownerlessHelper, delegate: ownerlessDelegate } = createHelper();
    const ownedEntity = { id: 'scoped-owned-1', value: 'owned' };
    const ownerlessEntity = { id: 'scoped-ownerless-1', value: 'ownerless' };

    // Stage ownerless deferred edit first while no owner is active.
    await ownerlessHelper.stageUpdatedEntity(ownerlessEntity, DEFERRED_SYNC);
    expect(ownerlessHelper.activeTransactionOwner).toBeUndefined();

    // Acquire and mutate under owner_a on a separate helper.
    ownerHelper.lockEntitiesForDeferredSync([ownedEntity], 'owner_a');
    await ownerHelper.stageUpdatedEntity({ id: ownedEntity.id, value: 'owned-updated' }, DEFERRED_SYNC);
    expect(ownerHelper.activeTransactionOwner).toBe('owner_a');

    await commitDeferredSyncForOwner('owner_a');

    expect(ownerDelegate.setDatabaseState).toHaveBeenCalledWith([
      { id: ownedEntity.id, value: 'owned-updated' },
    ]);
    expect(ownerlessDelegate.setDatabaseState).not.toHaveBeenCalled();
    expect(isEntityInDeferredSync(ownerlessEntity.id)).toBe(true);

    // Clean up ownerless helper
    await ownerlessHelper.commitChanges();
    expect(ownerlessDelegate.setDatabaseState).toHaveBeenCalledWith([ownerlessEntity]);
  });

  it('treats objectEditor locks as unlocked for editing and characterMemoryGenerator locks as locked', () => {
    const { helper: editorHelper } = createHelper();
    const { helper: generatorHelper } = createHelper();
    const entity1 = { id: 'edit-lock-1', value: 'v1' };
    const entity2 = { id: 'edit-lock-2', value: 'v2' };

    editorHelper.lockEntitiesForDeferredSync([entity1], DEFERRED_SYNC_OWNERS.objectEditor);
    expect(isEntityInDeferredSync(entity1.id)).toBe(true);
    expect(isEntityLockedForEditing(entity1.id)).toBe(false);
    editorHelper.abandonPendingChanges();

    generatorHelper.lockEntitiesForDeferredSync([entity2], DEFERRED_SYNC_OWNERS.characterMemoryGenerator);
    expect(isEntityInDeferredSync(entity2.id)).toBe(true);
    expect(isEntityLockedForEditing(entity2.id)).toBe(true);
    generatorHelper.abandonPendingChanges();
  });

  it('proceeds immediately for system writes on an unlocked entity while object_editor locks another entity', async () => {
    const { db, delegate, helper, store } = createHelper();
    const lockedEntity = { id: 'locked-other', value: 'locked' };
    const unlockedEntity = { id: 'unlocked-1', value: 'immediate-val' };

    helper.lockEntitiesForDeferredSync([lockedEntity], DEFERRED_SYNC_OWNERS.objectEditor);

    helper.stageUpdatedEntity(unlockedEntity, IMMEDIATE_SYNC);
    expect(store.get(unlockedEntity.id)).toEqual(unlockedEntity);
    expect(delegate.setDatabaseState).toHaveBeenCalledOnce();
    expect(delegate.setDatabaseState).toHaveBeenCalledWith([unlockedEntity]);

    expect(db.get(unlockedEntity.id)).toEqual(unlockedEntity);
    await discardDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor);
  });

  it('throws synchronously for system immediate writes on any locked entity', async () => {
    const { helper: editorHelper } = createHelper();
    const { helper: generatorHelper } = createHelper();
    const { helper: ownerlessHelper } = createHelper();
    const entity0 = { id: 'editor-lock-1', value: 'v0' };
    const entity1 = { id: 'memgen-lock-1', value: 'v1' };
    const entity2 = { id: 'ownerless-lock-1', value: 'v2' };

    editorHelper.lockEntitiesForDeferredSync([entity0], DEFERRED_SYNC_OWNERS.objectEditor);
    expect(() =>
      editorHelper.stageUpdatedEntity({ id: entity0.id, value: 'system-fail' }, IMMEDIATE_SYNC)
    ).toThrow('Cannot immediately sync entity. Deferred sync is pending.');
    await editorHelper.discardPendingChanges();

    generatorHelper.lockEntitiesForDeferredSync([entity1], DEFERRED_SYNC_OWNERS.characterMemoryGenerator);
    expect(() =>
      generatorHelper.stageUpdatedEntity({ id: entity1.id, value: 'system-fail' }, IMMEDIATE_SYNC)
    ).toThrow('Cannot immediately sync entity. Deferred sync is pending.');
    await generatorHelper.discardPendingChanges();

    ownerlessHelper.lockEntitiesForDeferredSync([entity2]);
    expect(() =>
      ownerlessHelper.stageUpdatedEntity({ id: entity2.id, value: 'system-fail' }, IMMEDIATE_SYNC)
    ).toThrow('Cannot immediately sync entity. Deferred sync is pending.');
    await ownerlessHelper.discardPendingChanges();
  });

  it('resolves immediate writes without waiting for slow database persistence while still draining before discard refresh', async () => {
    const db = new Map<string, TestEntity>();
    const store = new Map<string, TestEntity>();
    const firstWriteGate = Promise.withResolvers<void>();

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
      setDatabaseState: vi.fn(async (entities) => {
        await firstWriteGate.promise;
        for (const entity of entities) {
          db.set(entity.id, entity);
        }
      }),
      deleteDatabaseState: vi.fn(async () => {}),
      getEntitiesFromDatabase: vi.fn(async (entities: TestEntity[]) =>
        entities.map((e) => db.get(e.id)).filter((e): e is TestEntity => Boolean(e))
      ),
    };

    const helper = new EphemeralStateHelper(delegate);
    const moved = { id: 'char-1', value: 'moved' };

    // Immediate write resolves immediately even though setDatabaseState is still pending
    await helper.stageUpdatedEntity(moved, IMMEDIATE_SYNC);
    expect(store.get(moved.id)).toEqual(moved);
    expect(db.get(moved.id)).toBeUndefined();

    // User opens Object Editor, edits, then discards before the background DB write finishes
    helper.lockEntitiesForDeferredSync([moved], DEFERRED_SYNC_OWNERS.objectEditor);
    await helper.stageUpdatedEntity({ id: moved.id, value: 'draft-to-discard' }, USER_SYNC);

    let discardDone = false;
    const discardPromise = helper.discardPendingChanges().then(() => {
      discardDone = true;
    });

    await Promise.resolve();
    expect(discardDone).toBe(false);
    expect(delegate.getEntitiesFromDatabase).not.toHaveBeenCalled();

    // Once the in-flight background write settles, discard refreshes the persisted 'moved' state
    firstWriteGate.resolve();
    await discardPromise;

    expect(discardDone).toBe(true);
    expect(store.get(moved.id)).toEqual(moved);
  });
});
