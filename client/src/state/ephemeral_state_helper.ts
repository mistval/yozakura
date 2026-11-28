import { create } from 'zustand';
import { assert } from '../errors/application_error';
import { showNonRetriableErrorCardIfNeeded } from '../engine/interative_retry';
import { useScenarioStore } from './scenario_store';

type OperationType = 'upsert' | 'delete' | 'lock';

export type SyncMode = 'defer' | 'immediate';
export type WriteSource = 'user' | 'system';
export type SyncOptions = {
  syncMode: SyncMode;
  source?: WriteSource | undefined;
};

export const IMMEDIATE_SYNC = { syncMode: 'immediate', source: 'system' } as const satisfies SyncOptions;
export const DEFERRED_SYNC = { syncMode: 'defer', source: 'system' } as const satisfies SyncOptions;
export const USER_SYNC = { syncMode: 'immediate', source: 'user' } as const satisfies SyncOptions;

export const DEFERRED_SYNC_OWNERS = {
  characterMemoryGenerator: 'character_memory_generator',
  objectEditor: 'object_editor',
} as const;

export type DeferredSyncOwner =
  (typeof DEFERRED_SYNC_OWNERS)[keyof typeof DEFERRED_SYNC_OWNERS] | (string & {});

type DeferredSyncStoreState = {
  activeOwner: string | undefined;
  syncingEntityIds: Record<string, true>;
  mutatedEntityIds: Record<string, true>;
  addSyncingEntityIds: (ids: string[], owner?: string, options?: { isMutation?: boolean }) => void;
  removeSyncingEntityIds: (ids: string[]) => void;
};

export const useDeferredSyncStore = create<DeferredSyncStoreState>((set) => ({
  activeOwner: undefined,
  syncingEntityIds: {},
  mutatedEntityIds: {},
  addSyncingEntityIds: (ids, owner, options) => {
    if (owner !== undefined) {
      assert(owner.trim().length > 0, 'Deferred sync owner must be a non-empty string.');
    }

    set((state) => {
      if (owner !== undefined && state.activeOwner && state.activeOwner !== owner) {
        throw new Error(
          `Cannot acquire deferred-sync lock for "${owner}": currently held by "${state.activeOwner}".`
        );
      }

      let hasNewSync = false;
      const nextSync = { ...state.syncingEntityIds };
      const isMutation = options?.isMutation === true;
      let hasNewMutated = false;
      const nextMutated = isMutation ? { ...state.mutatedEntityIds } : state.mutatedEntityIds;

      for (const id of ids) {
        if (!nextSync[id]) {
          nextSync[id] = true;
          hasNewSync = true;
        }
        if (isMutation && !nextMutated[id]) {
          nextMutated[id] = true;
          hasNewMutated = true;
        }
      }

      const nextOwner = owner ?? state.activeOwner;
      const ownerChanged = nextOwner !== state.activeOwner;

      if (!hasNewSync && !hasNewMutated && !ownerChanged) {
        return state;
      }

      return {
        activeOwner: nextOwner,
        syncingEntityIds: hasNewSync ? nextSync : state.syncingEntityIds,
        mutatedEntityIds: hasNewMutated ? nextMutated : state.mutatedEntityIds,
      };
    });
  },
  removeSyncingEntityIds: (ids) => {
    set((state) => {
      let hasRemovedSync = false;
      const nextSync = { ...state.syncingEntityIds };
      let hasRemovedMutated = false;
      const nextMutated = { ...state.mutatedEntityIds };

      for (const id of ids) {
        if (nextSync[id]) {
          delete nextSync[id];
          hasRemovedSync = true;
        }
        if (nextMutated[id]) {
          delete nextMutated[id];
          hasRemovedMutated = true;
        }
      }

      const nextOwner = Object.keys(nextSync).length === 0 ? undefined : state.activeOwner;
      const ownerChanged = nextOwner !== state.activeOwner;

      if (!hasRemovedSync && !hasRemovedMutated && !ownerChanged) {
        return state;
      }

      return {
        activeOwner: nextOwner,
        syncingEntityIds: hasRemovedSync ? nextSync : state.syncingEntityIds,
        mutatedEntityIds: hasRemovedMutated ? nextMutated : state.mutatedEntityIds,
      };
    });
  },
}));

export function useHasPendingDeferredSyncMutations(owner?: DeferredSyncOwner): boolean {
  return useDeferredSyncStore(
    (state) =>
      Object.keys(state.mutatedEntityIds).length > 0 && (owner === undefined || state.activeOwner === owner)
  );
}

export function getActiveDeferredSyncOwner(): string | undefined {
  return useDeferredSyncStore.getState().activeOwner;
}

export type DeferredSyncCheckOptions = {
  ignoreOwner?: DeferredSyncOwner | undefined;
};

function isSyncIgnoredForOwner(activeOwner: string | undefined, options?: DeferredSyncCheckOptions): boolean {
  return options?.ignoreOwner !== undefined && activeOwner === options.ignoreOwner;
}

export function useIsEntityInDeferredSync(
  entityId: string | undefined,
  options?: DeferredSyncCheckOptions
): boolean {
  return useDeferredSyncStore((state) => {
    if (!entityId || isSyncIgnoredForOwner(state.activeOwner, options)) {
      return false;
    }
    return Boolean(state.syncingEntityIds[entityId]);
  });
}

export function useAreAnyEntitiesInDeferredSync(
  entityIds: ReadonlyArray<string | undefined>,
  options?: DeferredSyncCheckOptions
): boolean {
  return useDeferredSyncStore((state) => {
    if (isSyncIgnoredForOwner(state.activeOwner, options)) {
      return false;
    }
    return entityIds.some((id) => (id ? Boolean(state.syncingEntityIds[id]) : false));
  });
}

export function isEntityInDeferredSync(
  entityId: string | undefined,
  options?: DeferredSyncCheckOptions
): boolean {
  if (!entityId) return false;
  const state = useDeferredSyncStore.getState();
  if (isSyncIgnoredForOwner(state.activeOwner, options)) {
    return false;
  }
  return Boolean(state.syncingEntityIds[entityId]);
}

export function useIsEntityLockedForEditing(entityId: string | undefined): boolean {
  return useIsEntityInDeferredSync(entityId, { ignoreOwner: DEFERRED_SYNC_OWNERS.objectEditor });
}

export function useAreAnyEntitiesLockedForEditing(entityIds: ReadonlyArray<string | undefined>): boolean {
  return useAreAnyEntitiesInDeferredSync(entityIds, { ignoreOwner: DEFERRED_SYNC_OWNERS.objectEditor });
}

export function isEntityLockedForEditing(entityId: string | undefined): boolean {
  return isEntityInDeferredSync(entityId, { ignoreOwner: DEFERRED_SYNC_OWNERS.objectEditor });
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

const activeHelpersWithPendingOperations = new Set<{
  readonly activeTransactionOwner: string | undefined;
  commitChanges: () => Promise<void>;
  discardPendingChanges: () => Promise<void>;
}>();

export async function commitDeferredSyncForOwner(owner: DeferredSyncOwner): Promise<void> {
  const helpers = [...activeHelpersWithPendingOperations].filter(
    (helper) => helper.activeTransactionOwner === owner
  );
  await Promise.all(helpers.map((helper) => helper.commitChanges()));
}

export async function discardDeferredSyncForOwner(owner: DeferredSyncOwner): Promise<void> {
  const helpers = [...activeHelpersWithPendingOperations].filter(
    (helper) => helper.activeTransactionOwner === owner
  );
  await Promise.all(helpers.map((helper) => helper.discardPendingChanges()));
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
  private readonly inFlightDatabaseWrites = new Set<Promise<void>>();
  private transactionOwner: string | undefined = undefined;

  public get activeTransactionOwner(): string | undefined {
    return this.transactionOwner;
  }

  constructor(
    // Upsert these entities into the store state
    private readonly delegate: IEphemeralStateDelegate<TEntityType>
  ) {}

  public lockEntitiesForDeferredSync(entities: TEntityType[], owner?: string): void {
    if (entities.length === 0) {
      return;
    }

    if (owner !== undefined) {
      assert(owner.trim().length > 0, 'Deferred sync owner must be a non-empty string.');
      const currentOwner = getActiveDeferredSyncOwner();
      if (currentOwner && currentOwner !== owner) {
        throw new Error(
          `Cannot acquire deferred-sync lock for "${owner}": currently held by "${currentOwner}".`
        );
      }
    }

    for (const entity of entities) {
      if (!this.pendingOperations.has(entity.id)) {
        this.pendingOperations.set(entity.id, {
          operationType: 'lock',
          entity,
        });
      }
    }
    this.transactionOwner = owner ?? this.transactionOwner ?? getActiveDeferredSyncOwner();
    activeHelpersWithPendingOperations.add(this);
    useDeferredSyncStore.getState().addSyncingEntityIds(
      entities.map((e) => e.id),
      owner,
      { isMutation: false }
    );
  }

  public stageUpdatedEntity(entity: TEntityType, options: SyncOptions): void {
    this.stageUpdatedEntities([entity], options);
  }

  public stageUpdatedEntities(entities: TEntityType[], options: SyncOptions): void {
    this.stageEntities('upsert', entities, options);
  }

  public stageDeletedEntity(entity: TEntityType, options: SyncOptions): void {
    this.stageDeletedEntities([entity], options);
  }

  public stageDeletedEntities(entities: TEntityType[], options: SyncOptions): void {
    this.stageEntities('delete', entities, options);
  }

  private applyStoreMutation(operationType: 'upsert' | 'delete', entities: TEntityType[]): void {
    if (operationType === 'delete') {
      this.delegate.deleteStoreState(entities);
    } else {
      this.delegate.setStoreState(entities);
    }
  }

  private stageEntities(
    operationType: 'upsert' | 'delete',
    entities: TEntityType[],
    options: SyncOptions
  ): void {
    this.assertCanSyncImmediately(entities, options);
    this.applyStoreMutation(operationType, entities);
    this.handleDatabaseSync(operationType, entities, options);
  }

  private async waitForInFlightDatabaseWrites(): Promise<void> {
    while (this.inFlightDatabaseWrites.size > 0) {
      await Promise.all([...this.inFlightDatabaseWrites]);
    }
  }

  private trackDatabaseWrite(writePromise: Promise<void>): void {
    const tracked = writePromise.finally(() => {
      this.inFlightDatabaseWrites.delete(tracked);
    });
    this.inFlightDatabaseWrites.add(tracked);
  }

  public async discardPendingChanges() {
    const flushedIds = Array.from(this.pendingOperations.keys());
    const entitiesToRefresh = [...this.pendingOperations.values()]
      .filter((operation) => operation.operationType !== 'lock')
      .map((operation) => operation.entity);
    this.pendingOperations.clear();
    this.transactionOwner = undefined;
    activeHelpersWithPendingOperations.delete(this);

    if (entitiesToRefresh.length > 0) {
      this.databaseQueuePromise = this.databaseQueuePromise
        .catch(() => {})
        .then(async () => {
          try {
            await this.waitForInFlightDatabaseWrites();
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
    this.transactionOwner = undefined;
    activeHelpersWithPendingOperations.delete(this);

    const updates = uniqueOperations.filter((o) => o.operationType === 'upsert').map((o) => o.entity);
    const deletes = uniqueOperations.filter((o) => o.operationType === 'delete').map((o) => o.entity);

    this.databaseQueuePromise = this.databaseQueuePromise
      .catch(() => {})
      .then(async () => {
        try {
          await this.waitForInFlightDatabaseWrites();
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
    this.transactionOwner = undefined;
    activeHelpersWithPendingOperations.delete(this);
    useDeferredSyncStore.getState().removeSyncingEntityIds(flushedIds);
  }

  private resolveAutoDeferOwner(options: SyncOptions): string | undefined {
    if (
      options.syncMode === 'immediate' &&
      options.source === 'user' &&
      getActiveDeferredSyncOwner() === DEFERRED_SYNC_OWNERS.objectEditor
    ) {
      return DEFERRED_SYNC_OWNERS.objectEditor;
    }

    return undefined;
  }

  private assertCanSyncImmediately(entities: TEntityType[], options: SyncOptions) {
    if (options.syncMode !== 'immediate' || this.resolveAutoDeferOwner(options) !== undefined) {
      return;
    }

    for (const entity of entities) {
      if (this.pendingOperations.has(entity.id)) {
        throw new Error(`Cannot immediately sync entity. Deferred sync is pending.`);
      }
    }
  }

  private handleDatabaseSync(
    operationType: OperationType,
    entities: TEntityType[],
    options: SyncOptions
  ): void {
    const autoDeferOwner = this.resolveAutoDeferOwner(options);
    if (options.syncMode === 'defer' || autoDeferOwner !== undefined) {
      const ids = entities.map((e) => e.id);
      for (const entity of entities) {
        this.pendingOperations.set(entity.id, {
          operationType,
          entity,
        });
      }
      this.transactionOwner = autoDeferOwner ?? this.transactionOwner ?? getActiveDeferredSyncOwner();
      activeHelpersWithPendingOperations.add(this);
      useDeferredSyncStore.getState().addSyncingEntityIds(ids, autoDeferOwner, { isMutation: true });
      return;
    }

    if (operationType === 'delete') {
      this.trackDatabaseWrite(this.doDeletes(entities));
    } else if (operationType === 'upsert') {
      this.trackDatabaseWrite(this.doUpdates(entities));
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
    lockEntitiesForDeferredSync: (entities: TEntityType[], owner?: string) =>
      helper.lockEntitiesForDeferredSync(entities, owner),
  };
};
