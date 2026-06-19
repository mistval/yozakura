import type { ChatInputResult, TurnMove, TurnMoveOutcome, TurnMoveResult } from '../types';

export abstract class CharacterInputInterface {
  public abstract getNextTurnMove(): Promise<TurnMoveResult>;

  public abstract getNextChatInput(): Promise<ChatInputResult>;

  public abstract continuesAfterMove(move: TurnMove, outcome: TurnMoveOutcome): boolean;
}
