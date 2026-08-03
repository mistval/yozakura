import { assert } from '../errors/application_error';
import { showNonRetriableErrorCardIfNeeded } from '../engine/interative_retry';
import { useScenarioStore } from './scenario_store';

type OperationType = 'upsert' | 'delete';

export type SyncMode = 'defer' | 'immediate';
export type SyncOptions = { syncMode: SyncMode };

export const IMMEDIATE_SYNC = { syncMode: 'immediate' } as const satisfies SyncOptions;
export const DEFERRED_SYNC = { syncMode: 'defer' } as const satisfies SyncOptions;

export interface IEphemeralStateDelegate<TEntityType> {
  // Upsert these entities into the store state
  readonly setStoreState: (entities: TEntityType[]) => void;
  // Delete these entities (by ID) from the store state
  readonly deleteStoreState: (entities: TEntityType[]) => void;
  // Write these entities to the database. Must be atomic (SQLite transaction or multi-upsert).
  readonly setDatabaseState: (entities: TEntityType[]) => Promise<void>;
  // Delete these entities from the database. Must be atomic (SQLite transaction or multi-delete).
  readonly deleteDatabaseState: (entities: TEntityType[]) => Promise<void>;
  // Reload these entities from the database
  readonly refreshStoreStateFromDatabase: (entities: TEntityType[]) => Promise<void>;
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
    const entities = [...this.pendingOperations.values()].map((operation) => operation.entity);
    this.pendingOperations.clear();

    if (entities.length > 0) {
      this.databaseQueuePromise = this.databaseQueuePromise
        .catch(() => {})
        .then(async () => {
          await this.delegate.refreshStoreStateFromDatabase(entities);
        });

      await this.databaseQueuePromise;
    }
  }

  public async commitChanges() {
    const uniqueOperations = [...this.pendingOperations.values()];
    this.pendingOperations.clear();

    const updates = uniqueOperations.filter((o) => o.operationType === 'upsert').map((o) => o.entity);
    const deletes = uniqueOperations.filter((o) => o.operationType === 'delete').map((o) => o.entity);

    this.databaseQueuePromise = this.databaseQueuePromise
      .catch(() => {})
      .then(async () => {
        await Promise.all([this.doUpdates(updates), this.doDeletes(deletes)]);
      });

    await this.databaseQueuePromise;
  }

  public abandonPendingChanges() {
    this.pendingOperations.clear();
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
      for (const entity of entities) {
        this.pendingOperations.set(entity.id, {
          operationType,
          entity,
        });
      }
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

      await this.delegate.refreshStoreStateFromDatabase(updates);
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

      await this.delegate.refreshStoreStateFromDatabase(deletes);
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
  };
};
