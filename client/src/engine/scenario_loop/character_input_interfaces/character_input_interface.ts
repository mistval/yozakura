import type { ChatUserInputAction, UserTurnAction } from '../types';

export abstract class CharacterInputInterface {
  public abstract getNextTurnMove: () => Promise<UserTurnAction>;

  public abstract getNextChatInput: () => Promise<ChatUserInputAction>;
}
