import type { ChatUserInputAction, UserTurnAction } from './types';

export class SignalException extends Error {}

export class UserStopSignalException extends SignalException {
  public constructor(message = 'User aborted the current NPC turn') {
    super(message);
    this.name = 'UserAbortSignalException';
  }
}

export class UserPauseSignalException extends SignalException {
  public constructor(message = 'User paused in a context where aborting is the requested pause behavior') {
    super(message);
    this.name = 'UserPauseSignalException';
  }
}

export class UserAbortCurrentGenerationSignalException extends SignalException {
  public constructor(message = 'User aborted the current in-chat generation') {
    super(message);
    this.name = 'AbortCurrentGenerationSignalException';
  }
}

export class ScenarioLoopAbortSignalException extends SignalException {
  public constructor(message = 'A new scenario is being loaded') {
    super(message);
    this.name = 'ScenarioLoopAbortSignalException';
  }
}

export function rethrowSignalException(err: unknown) {
  if (err instanceof SignalException) {
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
