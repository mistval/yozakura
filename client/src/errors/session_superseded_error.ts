export const SESSION_SUPERSEDED_HEADER = 'x-yozakura-session-superseded';

export class SessionSupersededError extends Error {
  public constructor(
    message = 'You seem to be using Yozakura elsewhere. Do you want to resume using it here?'
  ) {
    super(message);
    this.name = 'SessionSupersededError';
  }
}
