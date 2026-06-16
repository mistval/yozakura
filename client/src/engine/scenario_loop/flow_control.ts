import type { ChatUserInputAction, UserTurnAction } from './types';

export class UserAbortSignalException extends Error {
  public constructor(message = 'User aborted the current NPC turn') {
    super(message);
    this.name = 'UserAbortSignalException';
  }
}

export class ScenarioLoopAbortSignalException extends Error {}

class ScenarioLoopPromise<TReturnType> {
  private readonly resolvers = Promise.withResolvers<TReturnType>();

  public readonly promise = this.resolvers.promise;
  public readonly resolve = this.resolvers.resolve;
  public readonly reject = this.resolvers.reject;

  abort() {
    this.reject(new ScenarioLoopAbortSignalException());
  }
}

const currentScenarioLoopPromises = new Set<ScenarioLoopPromise<any>>();

function createScenarioLoopPromise<TReturnType>() {
  const newPromise = new ScenarioLoopPromise<TReturnType>();
  currentScenarioLoopPromises.add(newPromise);
  return newPromise;
}

export async function doWithScenarioLoopPromise<TReturnType>(
  func: (promise: ScenarioLoopPromise<TReturnType>) => Promise<TReturnType>
) {
  const promise = createScenarioLoopPromise<TReturnType>();

  try {
    return await func(promise);
  } finally {
    currentScenarioLoopPromises.delete(promise);
  }
}

// Should be called by the scenario loop for any async function calls outside of itself.
// They will reject and throw if a new scenario is loaded.
export function doScenarioLoopAsyncAction<TReturnType>(action: () => Promise<TReturnType>) {
  const newPromise = createScenarioLoopPromise<TReturnType>();

  action()
    .then((r) => {
      newPromise.resolve(r);
    })
    .catch((err) => newPromise.reject(err))
    .finally(() => {
      currentScenarioLoopPromises.delete(newPromise);
    });

  return newPromise.promise;
}

export function abortAllPendingActions() {
  const pending = [...currentScenarioLoopPromises];
  for (const promise of pending) {
    promise.abort();
  }

  currentScenarioLoopPromises.clear();
}

export const scenarioLoopPromiseCallbacks: {
  userTurnAction: ScenarioLoopPromise<UserTurnAction> | undefined;
  userChatAction: ScenarioLoopPromise<ChatUserInputAction> | undefined;
} = {
  userTurnAction: undefined,
  userChatAction: undefined,
};
