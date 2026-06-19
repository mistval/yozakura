import type { ChatTurnInput, TurnMove, TurnMoveOutcome } from '../types';

export abstract class CharacterInputInterface {
  // Produce this character's next top-level turn move (wait / move / chat).
  public abstract getNextTurnMove(): Promise<TurnMove>;

  // Produce this character's next contribution while they are the active speaker in a chat.
  public abstract getNextChatInput(): Promise<ChatTurnInput>;

  // Whether this character keeps taking moves this turn after the given move resolved. NPCs take a
  // single move per turn; the user may keep acting until they do something turn-ending.
  public abstract continuesAfterMove(move: TurnMove, outcome: TurnMoveOutcome): boolean;
}
