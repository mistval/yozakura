import type { ChatUserInputAction, UserTurnAction } from './types';

export class UserAbortSignalException extends Error {
  public constructor(message = 'User aborted the current NPC turn') {
    super(message);
    this.name = 'UserAbortSignalException';
  }
}

export class ScenarioLoopAbortSignalException extends Error {}

export function rethrowSignalException(err: unknown) {
  if (err instanceof UserAbortSignalException || err instanceof ScenarioLoopAbortSignalException) {
    throw err;
  }
}

export const scenarioLoopPromiseCallbacks: {
  userTurnAction: PromiseWithResolvers<UserTurnAction> | undefined;
  userChatAction: PromiseWithResolvers<ChatUserInputAction> | undefined;
} = {
  userTurnAction: undefined,
  userChatAction: undefined,
};
