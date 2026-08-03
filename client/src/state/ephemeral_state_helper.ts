import _ from 'lodash';
import { assert } from '../errors/application_error';
import { showNonRetriableErrorCardIfNeeded } from '../engine/interative_retry';

type OperationType = 'upsert' | 'delete';

export type SyncMode = 'defer' | 'immediate';
export type SyncOptions = { syncMode: SyncMode };

export interface IEphemeralStateDelegate<TEntityType> {
  // Upsert these entities into the store state
  readonly setStoreState: (entity: TEntityType) => void;
  // Delete these entities (by ID) from the store state
  readonly deleteStoreState: (entity: TEntityType) => void;
  // Write these entities to the database. Must be atomic (SQLite transaction or multi-upsert).
  readonly setDatabaseState: (entities: TEntityType[]) => Promise<void>;
  // Delete these entities from the database. Must be atomic (SQLite transaction or multi-delete).
  readonly deleteDatabaseState: (entities: TEntityType[]) => Promise<void>;
  // Reload these entities from the database
  readonly refreshStoreStateFromDatabase: (entities: TEntityType[]) => Promise<void>;
}

export class EphemeralStateHelper<TEntityType extends { id: string }> {
  private readonly pendingOperations: Array<{
    operationType: OperationType;
    entity: TEntityType;
  }> = [];

  private databaseQueuePromise = Promise.resolve();

  constructor(
    // Upsert these entities into the store state
    private readonly delegate: IEphemeralStateDelegate<TEntityType>
  ) {}

  public stageUpdatedEntity(entity: TEntityType, options?: SyncOptions) {
    this.delegate.setStoreState(entity);
    return this.handleDatabaseSync('upsert', entity, options);
  }

  public stageDeletedEntity(entity: TEntityType, options?: SyncOptions) {
    this.delegate.deleteStoreState(entity);
    return this.handleDatabaseSync('delete', entity, options);
  }

  public async discardPendingChanges() {
    const entities = this.pendingOperations.map((e) => e.entity);
    this.pendingOperations.length = 0;

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
    // Take only the most recent operation for each entity
    const uniqueOperations = _.uniqBy(this.pendingOperations.reverse(), (a) => a.entity.id);

    this.pendingOperations.length = 0;

    const updates = uniqueOperations.filter((o) => o.operationType === 'upsert').map((o) => o.entity);
    const deletes = uniqueOperations.filter((o) => o.operationType === 'delete').map((o) => o.entity);

    this.databaseQueuePromise = this.databaseQueuePromise
      .catch(() => {})
      .then(async () => {
        await Promise.all([this.doUpdates(updates), this.doDeletes(deletes)]);
      });

    await this.databaseQueuePromise;
  }

  private async handleDatabaseSync(operationType: OperationType, entity: TEntityType, options?: SyncOptions) {
    const syncMode = options?.syncMode ?? 'defer';

    if (syncMode === 'defer') {
      this.pendingOperations.push({
        operationType,
        entity,
      });
    } else {
      const hasPendingOperation = this.pendingOperations.some((o) => o.entity.id === entity.id);
      if (hasPendingOperation) {
        throw new Error(`Cannot immediately sync entity. Deferred sync is pending.`);
      }

      if (operationType === 'delete') {
        await this.doDeletes([entity]);
      } else if (operationType === 'upsert') {
        await this.doUpdates([entity]);
      } else {
        assert(false, 'Unknown sync operation type');
      }
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
        operationType: 'database_sync',
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
        operationType: 'database_sync',
      });

      await this.delegate.refreshStoreStateFromDatabase(deletes);
    }
  }
}

export const ephemeralStateSlice = <TEntityType extends { id: string }>(
  delegate: IEphemeralStateDelegate<TEntityType>
) => {
  const helper = new EphemeralStateHelper<TEntityType>(delegate);

  return {
    ephemeralStateHelper: helper,
    commitAllChanges: () => helper.commitChanges(),
    discardPendingChanges: () => helper.discardPendingChanges(),
  };
};
