import type { ChatUserInputAction, UserTurnAction } from './types';

export class UserStopSignalException extends Error {
  public constructor(message = 'User aborted the current NPC turn') {
    super(message);
    this.name = 'UserAbortSignalException';
  }
}

export class UserPauseSignalException extends Error {
  public constructor(message = 'User paused in a context where aborting is the requested pause behavior') {
    super(message);
    this.name = 'UserPauseSignalException';
  }
}

export class ScenarioLoopAbortSignalException extends Error {}

export function rethrowSignalException(err: unknown) {
  if (
    err instanceof UserStopSignalException ||
    err instanceof ScenarioLoopAbortSignalException ||
    err instanceof UserPauseSignalException
  ) {
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
