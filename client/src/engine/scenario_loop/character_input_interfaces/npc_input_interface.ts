import type { TurnState } from '../turn_state';
import type { UserTurnAction, ChatUserInputAction } from '../types';
import { CharacterInputInterface } from './character_input_interface';

export class NPCInputInterface extends CharacterInputInterface {
  public constructor(private readonly turnState: TurnState) {
    super();
  }

  public async getNextTurnMove() {}

  public async getNextChatInput() {}
}
