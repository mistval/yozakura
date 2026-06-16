import {
  registerInteractiveRetryActionHandler,
  useInteractiveRetryStore,
  type InteractiveRetryAction,
  type InteractiveRetryCard,
  type InteractiveRetryOperationId,
} from '../state/interactive_retry_store.js';
import { InteractiveRetryError } from '../errors/interactive_retry_error.js';
import { getErrorMessage } from '../errors/error_util.js';

type RunWithInteractiveRetryOptions<T> = {
  operationType: string;
  run: (attempt: number) => Promise<T>;
  retryDelayMs?: number;
  maxRetries?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  hint?: string | ((error: unknown, attempt: number) => string | undefined);
  signal?: AbortSignal | undefined;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type ShowNonRetriableErrorCardOptions = {
  operationType: string;
  error: unknown;
  hint?: string;
  messagePrefix?: string;
};

export const DEFAULT_RETRY_DELAY_MS = 10_000;

const pendingActionDeferredById = new Map<InteractiveRetryOperationId, Deferred<InteractiveRetryAction>>();

let nextInteractiveRetryOperationId: InteractiveRetryOperationId = 1;

registerInteractiveRetryActionHandler((id, action) => {
  const pending = pendingActionDeferredById.get(id);
  if (!pending) {
    return;
  }

  pendingActionDeferredById.delete(id);
  pending.resolve(action);
});

function toErrorStack(error: unknown): string | undefined {
  return error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined;
}

function createDeferred<T>(): Deferred<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  return { promise, resolve, reject };
}

function toRetryDelayMs(retryDelayMs?: number): number {
  return Math.max(0, Math.floor(retryDelayMs ?? 0)) || DEFAULT_RETRY_DELAY_MS;
}

function toMaxRetries(maxRetries?: number): number {
  return Math.max(0, Math.floor(maxRetries ?? 0)) || Number.MAX_SAFE_INTEGER;
}

function resolveHint(
  hintOption: RunWithInteractiveRetryOptions<unknown>['hint'],
  error: unknown,
  attempt: number
): string | undefined {
  if (typeof hintOption === 'function') {
    try {
      const resolved = hintOption(error, attempt);
      return resolved?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  return hintOption?.trim() || undefined;
}

function upsertCard(card: InteractiveRetryCard) {
  useInteractiveRetryStore.getState().upsertOperation(card);
}

function removeCard(id: InteractiveRetryOperationId) {
  useInteractiveRetryStore.getState().removeOperation(id);
}

export async function showNonRetriableErrorCardIfNeeded(
  options: ShowNonRetriableErrorCardOptions
): Promise<boolean> {
  if (options.error instanceof InteractiveRetryError) {
    return false;
  }

  const operationId = nextInteractiveRetryOperationId;
  nextInteractiveRetryOperationId += 1;

  const hint = options.hint?.trim();
  const baseErrorMessage = getErrorMessage(options.error);
  const errorMessage = options.messagePrefix
    ? `${options.messagePrefix}: ${baseErrorMessage}`
    : baseErrorMessage;

  const card: InteractiveRetryCard = {
    id: operationId,
    operationType: options.operationType,
    attempt: 1,
    mode: 'retry_disabled',
    status: 'waiting_for_user_ack',
    createdAt: Date.now(),
    errorMessage,
  };

  if (hint) {
    card.hint = hint;
  }

  const errorStack = toErrorStack(options.error);
  if (errorStack) {
    card.errorStack = errorStack;
  }

  upsertCard(card);

  const deferred = createDeferred<InteractiveRetryAction>();
  pendingActionDeferredById.set(operationId, deferred);

  try {
    await deferred.promise;
    return true;
  } finally {
    const active = pendingActionDeferredById.get(operationId);
    if (active === deferred) {
      pendingActionDeferredById.delete(operationId);
    }
    removeCard(operationId);
  }
}

async function waitForRetryDecision(
  id: InteractiveRetryOperationId,
  retryDelayMs: number
): Promise<'retry_now' | 'cancel'> {
  const deferred = createDeferred<InteractiveRetryAction>();
  pendingActionDeferredById.set(id, deferred);

  const timerId = setTimeout(() => {
    const active = pendingActionDeferredById.get(id);
    if (active !== deferred) {
      return;
    }

    pendingActionDeferredById.delete(id);
    deferred.resolve('retry_now');
  }, retryDelayMs);

  try {
    const action = await deferred.promise;
    return action === 'cancel' ? 'cancel' : 'retry_now';
  } finally {
    clearTimeout(timerId);
    const active = pendingActionDeferredById.get(id);
    if (active === deferred) {
      pendingActionDeferredById.delete(id);
    }
  }
}

async function waitForAck(id: InteractiveRetryOperationId): Promise<void> {
  const deferred = createDeferred<InteractiveRetryAction>();
  pendingActionDeferredById.set(id, deferred);

  try {
    await deferred.promise;
  } finally {
    const active = pendingActionDeferredById.get(id);
    if (active === deferred) {
      pendingActionDeferredById.delete(id);
    }
  }
}

function shouldRetryAttempt(
  error: unknown,
  attempt: number,
  shouldRetry: ((error: unknown, attempt: number) => boolean) | undefined,
  maxRetries: number
): boolean {
  const retriesAlreadyUsed = attempt - 1;
  if (retriesAlreadyUsed >= maxRetries) {
    return false;
  }

  if (!shouldRetry) {
    return true;
  }

  try {
    return Boolean(shouldRetry(error, attempt));
  } catch {
    return false;
  }
}

export async function runWithInteractiveRetry<T>(options: RunWithInteractiveRetryOptions<T>): Promise<T> {
  const operationId = nextInteractiveRetryOperationId;
  nextInteractiveRetryOperationId += 1;

  const retryDelayMs = toRetryDelayMs(options.retryDelayMs);
  const maxRetries = toMaxRetries(options.maxRetries);
  let attempt = 0;
  let lastOriginalError: unknown = new Error('Unknown operation failure');
  const createdAt = Date.now();

  try {
    while (true) {
      attempt += 1;

      try {
        const result = await options.run(attempt);
        return result;
      } catch (error) {
        if (error instanceof InteractiveRetryError) {
          throw error;
        }

        if (options.signal?.aborted) {
          throw error;
        }

        lastOriginalError = error;
        const hint = resolveHint(options.hint, error, attempt);

        const canRetry = shouldRetryAttempt(error, attempt, options.shouldRetry, maxRetries);

        if (canRetry) {
          const retryCard: InteractiveRetryCard = {
            id: operationId,
            operationType: options.operationType,
            attempt,
            mode: 'retry_enabled',
            status: 'waiting_for_retry',
            createdAt,
            retryAt: Date.now() + retryDelayMs,
            retryDelayMs,
            errorMessage: getErrorMessage(error),
          };

          if (hint) {
            retryCard.hint = hint;
          }

          const errorStack = toErrorStack(error);
          if (errorStack) {
            retryCard.errorStack = errorStack;
          }

          upsertCard(retryCard);

          const decision = await waitForRetryDecision(operationId, retryDelayMs);
          if (decision === 'cancel') {
            throw new InteractiveRetryError(lastOriginalError);
          }

          upsertCard({
            ...retryCard,
            status: 'retrying',
          });

          continue;
        }

        const nonRetryCard: InteractiveRetryCard = {
          id: operationId,
          operationType: options.operationType,
          attempt,
          mode: 'retry_disabled',
          status: 'waiting_for_user_ack',
          createdAt,
          errorMessage: getErrorMessage(error),
        };

        if (hint) {
          nonRetryCard.hint = hint;
        }

        const errorStack = toErrorStack(error);
        if (errorStack) {
          nonRetryCard.errorStack = errorStack;
        }

        upsertCard(nonRetryCard);

        await waitForAck(operationId);
        throw new InteractiveRetryError(lastOriginalError);
      }
    }
  } finally {
    pendingActionDeferredById.delete(operationId);
    removeCard(operationId);
  }
}
