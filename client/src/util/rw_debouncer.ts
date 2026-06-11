import { assert } from '../errors/application_error';

const DEBOUNCE_DELAY_MS = 500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Resolvers<TReturnType> = ReturnType<typeof Promise.withResolvers<TReturnType>>;

class Timer<TReadType> {
  private pendingWriteOperation: (() => Promise<unknown>) | undefined = undefined;
  private writeOperationsInFlight = false;
  private lastWriteAdd = 0;

  private writeWaiters: Array<Resolvers<unknown>> = [];
  private readOperations: Array<
    Resolvers<TReadType> & {
      operation: () => Promise<TReadType>;
    }
  > = [];

  public constructor(private readonly idleCallback: () => void) {}

  public write(op: () => Promise<unknown>) {
    const needsStartLoop = this.lastWriteAdd === 0;
    this.lastWriteAdd = Date.now();
    this.pendingWriteOperation = op;
    const resolvers = Promise.withResolvers();
    this.writeWaiters.push(resolvers);

    if (needsStartLoop) {
      this.startLoop();
    }

    return resolvers.promise;
  }

  public read(op: () => Promise<TReadType>) {
    if (!this.pendingWriteOperation && !this.writeOperationsInFlight) {
      return op();
    }

    const resolvers = Promise.withResolvers<TReadType>();
    this.readOperations.push({
      operation: op,
      ...resolvers,
    });

    return resolvers.promise;
  }

  private async startLoop() {
    while (true) {
      if (this.pendingWriteOperation) {
        const writeOperation = this.pendingWriteOperation;
        this.pendingWriteOperation = undefined;
        const writeWaiters = this.writeWaiters;
        this.writeWaiters = [];

        this.writeOperationsInFlight = true;

        try {
          const result = await writeOperation();
          writeWaiters.forEach(({ resolve }) => resolve(result));
        } catch (err) {
          writeWaiters.forEach(({ reject }) => reject(err));
        }

        this.writeOperationsInFlight = false;
      }

      if (this.pendingWriteOperation) {
        continue;
      }

      const readOperations = this.readOperations;
      this.readOperations = [];

      await Promise.all(
        readOperations.map(async (ro) => {
          try {
            const result = await ro.operation();
            ro.resolve(result);
          } catch (err) {
            ro.reject(err);
          }
        })
      );

      await wait(DEBOUNCE_DELAY_MS);

      if (
        !this.pendingWriteOperation &&
        !this.writeOperationsInFlight &&
        this.lastWriteAdd < Date.now() - DEBOUNCE_DELAY_MS
      ) {
        assert(this.readOperations.length === 0, 'unexpected state');
        this.idleCallback();
        break;
      }
    }
  }
}

/* Implements a debouncing policy for database synchronization:
 * 1. Most recent write before the trailing edge wins and is committed. The rest resolve, but don't actually execute.
 * 2. Reads are deferred until there are no writes remaining in the pipeline
 */
export class ReadWriteDebouncer<TReadType> {
  private debouncer = new Map<string, Timer<TReadType>>();

  async write(key: string, writeFn: () => Promise<void>): Promise<void> {
    const timer =
      this.debouncer.get(key) ??
      new Timer<TReadType>(() => {
        this.debouncer.delete(key);
      });

    this.debouncer.set(key, timer);
    await timer.write(writeFn);
  }

  async read(key: string, readFn: () => Promise<TReadType>): Promise<TReadType> {
    const timer = this.debouncer.get(key);
    if (!timer) {
      return readFn();
    }

    const result = await timer.read(readFn);
    return result;
  }
}
