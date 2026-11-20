import { afterEach, describe, expect, it } from 'vitest';
import { runWithInteractiveRetry } from './interative_retry.js';
import { SessionSupersededError } from '../errors/session_superseded_error.js';
import { InteractiveRetryError } from '../errors/interactive_retry_error.js';
import { useInteractiveRetryStore } from '../state/interactive_retry_store.js';

describe('runWithInteractiveRetry session superseded handling', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('deduplicates concurrent SessionSupersededError prompts and reloads when confirmed', async () => {
    let reloadCount = 0;
    let attemptsA = 0;
    let attemptsB = 0;
    Reflect.set(globalThis, 'window', {
      location: {
        reload: () => {
          reloadCount += 1;
        },
      },
    });

    const promiseA = runWithInteractiveRetry({
      operationType: 'database.write.scenario',
      retryDelayMs: 5,
      run: async () => {
        attemptsA += 1;
        throw new SessionSupersededError();
      },
    });

    const promiseB = runWithInteractiveRetry({
      operationType: 'api.upload_file',
      retryDelayMs: 5,
      run: async () => {
        attemptsB += 1;
        throw new SessionSupersededError();
      },
    });

    const expectA = expect(promiseA).rejects.toBeInstanceOf(InteractiveRetryError);
    const expectB = expect(promiseB).rejects.toBeInstanceOf(InteractiveRetryError);

    await Promise.resolve();

    const store = useInteractiveRetryStore.getState();
    expect(store.orderedIds).toHaveLength(1);
    const [cardId] = store.orderedIds;
    if (cardId === undefined) {
      throw new Error('Expected session_superseded card ID');
    }
    expect(store.operationsById[cardId]?.mode).toBe('session_superseded');

    store.dispatchAction(cardId, 'confirm');

    await expectA;
    await expectB;
    expect(attemptsA).toBe(1);
    expect(attemptsB).toBe(1);
    expect(reloadCount).toBe(1);
    expect(useInteractiveRetryStore.getState().orderedIds).toEqual([]);
  });

  it('dismisses cleanly without reloading when canceled', async () => {
    let reloadCount = 0;
    Reflect.set(globalThis, 'window', {
      location: {
        reload: () => {
          reloadCount += 1;
        },
      },
    });

    const promise = runWithInteractiveRetry({
      operationType: 'database.write.character',
      run: async () => {
        throw new SessionSupersededError();
      },
    });

    const expectation = expect(promise).rejects.toBeInstanceOf(InteractiveRetryError);
    await Promise.resolve();

    const store = useInteractiveRetryStore.getState();
    const [cardId] = store.orderedIds;
    if (cardId === undefined) {
      throw new Error('Expected session_superseded card ID');
    }
    store.dispatchAction(cardId, 'cancel');

    await expectation;
    expect(reloadCount).toBe(0);
    expect(useInteractiveRetryStore.getState().orderedIds).toEqual([]);
  });
});
