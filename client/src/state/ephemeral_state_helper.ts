import { create } from 'zustand';
import { assert } from '../errors/application_error';
import { showNonRetriableErrorCardIfNeeded } from '../engine/interative_retry';
import { useScenarioStore } from './scenario_store';

type OperationType = 'upsert' | 'delete' | 'lock';

export type SyncMode = 'defer' | 'immediate';
export type SyncOptions = { syncMode: SyncMode };

export const IMMEDIATE_SYNC = { syncMode: 'immediate' } as const satisfies SyncOptions;
export const DEFERRED_SYNC = { syncMode: 'defer' } as const satisfies SyncOptions;

type DeferredSyncStoreState = {
  syncingEntityIds: Record<string, true>;
  addSyncingEntityIds: (ids: string[]) => void;
  removeSyncingEntityIds: (ids: string[]) => void;
};

export const useDeferredSyncStore = create<DeferredSyncStoreState>((set) => ({
  syncingEntityIds: {},
  addSyncingEntityIds: (ids) => {
    set((state) => {
      let hasNew = false;
      const next = { ...state.syncingEntityIds };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = true;
          hasNew = true;
        }
      }
      return hasNew ? { syncingEntityIds: next } : state;
    });
  },
  removeSyncingEntityIds: (ids) => {
    set((state) => {
      let hasRemoved = false;
      const next = { ...state.syncingEntityIds };
      for (const id of ids) {
        if (next[id]) {
          delete next[id];
          hasRemoved = true;
        }
      }
      return hasRemoved ? { syncingEntityIds: next } : state;
    });
  },
}));

export function useIsEntityInDeferredSync(entityId: string | undefined): boolean {
  return useDeferredSyncStore((state) => (entityId ? Boolean(state.syncingEntityIds[entityId]) : false));
}

export function useAreAnyEntitiesInDeferredSync(entityIds: ReadonlyArray<string | undefined>): boolean {
  return useDeferredSyncStore((state) =>
    entityIds.some((id) => (id ? Boolean(state.syncingEntityIds[id]) : false))
  );
}

export function isEntityInDeferredSync(entityId: string | undefined): boolean {
  if (!entityId) return false;
  return Boolean(useDeferredSyncStore.getState().syncingEntityIds[entityId]);
}

export interface IEphemeralStateDelegate<TEntityType> {
  // Upsert these entities into the store state
  readonly setStoreState: (entities: TEntityType[]) => void;
  // Delete these entities (by ID) from the store state
  readonly deleteStoreState: (entities: TEntityType[]) => void;
  // Write these entities to the database. Must be atomic (SQLite transaction or multi-upsert).
  readonly setDatabaseState: (entities: TEntityType[]) => Promise<void>;
  // Delete these entities from the database. Must be atomic (SQLite transaction or multi-delete).
  readonly deleteDatabaseState: (entities: TEntityType[]) => Promise<void>;
  // Load the persisted state of these entities from the database
  readonly getEntitiesFromDatabase: (entities: TEntityType[]) => Promise<TEntityType[]>;
}

export class EphemeralStateHelper<TEntityType extends { id: string }> {
  private readonly pendingOperations = new Map<
    string,
    {
      operationType: OperationType;
      entity: TEntityType;
    }
  >();

  private databaseQueuePromise = Promise.resolve();

  constructor(
    // Upsert these entities into the store state
    private readonly delegate: IEphemeralStateDelegate<TEntityType>
  ) {}

  public lockEntitiesForDeferredSync(entities: TEntityType[]) {
    if (entities.length === 0) {
      return;
    }

    for (const entity of entities) {
      if (!this.pendingOperations.has(entity.id)) {
        this.pendingOperations.set(entity.id, {
          operationType: 'lock',
          entity,
        });
      }
    }
    useDeferredSyncStore.getState().addSyncingEntityIds(entities.map((e) => e.id));
  }

  public stageUpdatedEntity(entity: TEntityType, options: SyncOptions) {
    return this.stageUpdatedEntities([entity], options);
  }

  public stageUpdatedEntities(entities: TEntityType[], options: SyncOptions) {
    this.assertCanSyncImmediately(entities, options);
    this.delegate.setStoreState(entities);
    return this.handleDatabaseSync('upsert', entities, options);
  }

  public stageDeletedEntity(entity: TEntityType, options: SyncOptions) {
    return this.stageDeletedEntities([entity], options);
  }

  public stageDeletedEntities(entities: TEntityType[], options: SyncOptions) {
    this.assertCanSyncImmediately(entities, options);
    this.delegate.deleteStoreState(entities);
    return this.handleDatabaseSync('delete', entities, options);
  }

  public async discardPendingChanges() {
    const flushedIds = Array.from(this.pendingOperations.keys());
    const entitiesToRefresh = [...this.pendingOperations.values()]
      .filter((operation) => operation.operationType !== 'lock')
      .map((operation) => operation.entity);
    this.pendingOperations.clear();

    if (entitiesToRefresh.length > 0) {
      this.databaseQueuePromise = this.databaseQueuePromise
        .catch(() => {})
        .then(async () => {
          try {
            await this.refreshStoreStateFromDatabase(entitiesToRefresh);
          } finally {
            const idsToRemove = flushedIds.filter((id) => !this.pendingOperations.has(id));
            useDeferredSyncStore.getState().removeSyncingEntityIds(idsToRemove);
          }
        });

      await this.databaseQueuePromise;
    } else {
      const idsToRemove = flushedIds.filter((id) => !this.pendingOperations.has(id));
      useDeferredSyncStore.getState().removeSyncingEntityIds(idsToRemove);
    }
  }

  public async commitChanges() {
    const flushedIds = Array.from(this.pendingOperations.keys());
    const uniqueOperations = [...this.pendingOperations.values()];
    this.pendingOperations.clear();

    const updates = uniqueOperations.filter((o) => o.operationType === 'upsert').map((o) => o.entity);
    const deletes = uniqueOperations.filter((o) => o.operationType === 'delete').map((o) => o.entity);

    this.databaseQueuePromise = this.databaseQueuePromise
      .catch(() => {})
      .then(async () => {
        try {
          await Promise.all([this.doUpdates(updates), this.doDeletes(deletes)]);
        } finally {
          const idsToRemove = flushedIds.filter((id) => !this.pendingOperations.has(id));
          useDeferredSyncStore.getState().removeSyncingEntityIds(idsToRemove);
        }
      });

    await this.databaseQueuePromise;
  }

  public abandonPendingChanges() {
    const flushedIds = Array.from(this.pendingOperations.keys());
    this.pendingOperations.clear();
    useDeferredSyncStore.getState().removeSyncingEntityIds(flushedIds);
  }

  private assertCanSyncImmediately(entities: TEntityType[], options: SyncOptions) {
    if (options.syncMode !== 'immediate') {
      return;
    }

    for (const entity of entities) {
      if (this.pendingOperations.has(entity.id)) {
        throw new Error(`Cannot immediately sync entity. Deferred sync is pending.`);
      }
    }
  }

  private async handleDatabaseSync(
    operationType: OperationType,
    entities: TEntityType[],
    options: SyncOptions
  ) {
    if (options.syncMode === 'defer') {
      const ids = entities.map((e) => e.id);
      for (const entity of entities) {
        this.pendingOperations.set(entity.id, {
          operationType,
          entity,
        });
      }
      useDeferredSyncStore.getState().addSyncingEntityIds(ids);
      return;
    }

    if (operationType === 'delete') {
      await this.doDeletes(entities);
    } else if (operationType === 'upsert') {
      await this.doUpdates(entities);
    } else {
      assert(false, 'Unknown sync operation type');
    }
  }

  private async doUpdates(updates: TEntityType[]) {
    try {
      if (updates.length > 0) {
        await this.delegate.setDatabaseState(updates);
      }
    } catch (err) {
      await showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'database_sync_updated',
      });

      await this.refreshStoreStateFromDatabase(updates);
    }
  }

  private async doDeletes(deletes: TEntityType[]) {
    try {
      if (deletes.length > 0) {
        await this.delegate.deleteDatabaseState(deletes);
      }
    } catch (err) {
      await showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'database_sync_delete',
      });

      await this.refreshStoreStateFromDatabase(deletes);
    }
  }

  private async refreshStoreStateFromDatabase(entities: TEntityType[]) {
    const persistedEntities = await this.delegate.getEntitiesFromDatabase(entities);
    const persistedIds = new Set(persistedEntities.map((entity) => entity.id));
    const missingEntities = entities.filter((entity) => !persistedIds.has(entity.id));

    if (missingEntities.length > 0) {
      this.delegate.deleteStoreState(missingEntities);
    }

    if (persistedEntities.length > 0) {
      this.delegate.setStoreState(persistedEntities);
    }
  }
}

export const ephemeralStateSlice = <TEntityType extends { id: string }>(
  delegate: IEphemeralStateDelegate<TEntityType>,
  options?: {
    discardPendingChangesOnScenarioChange?: boolean;
  }
) => {
  const helper = new EphemeralStateHelper<TEntityType>(delegate);

  if (options?.discardPendingChangesOnScenarioChange) {
    useScenarioStore.subscribe((newState, previousState) => {
      if (newState.activeScenario?.id !== previousState.activeScenario?.id) {
        helper.abandonPendingChanges();
      }
    });
  }

  return {
    ephemeralStateHelper: helper,
    commitAllChanges: () => helper.commitChanges(),
    discardPendingChanges: () => helper.discardPendingChanges(),
    lockEntitiesForDeferredSync: (entities: TEntityType[]) => helper.lockEntitiesForDeferredSync(entities),
  };
};
