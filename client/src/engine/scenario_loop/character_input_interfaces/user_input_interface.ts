import { assert, assertNonNullish } from '../../../errors/application_error';
import { useScenarioCharacterStore } from '../../../state/scenario_character_store';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store';
import { useSettingsStore } from '../../../state/settings_store';
import { doWithScenarioLoopPromise, scenarioLoopPromiseCallbacks } from '../flow_control';
import type {
  ChatInputResult,
  ChatUserInputAction,
  TurnMove,
  TurnMoveOutcome,
  TurnMoveResult,
  UserTurnAction,
} from '../types';
import { CharacterInputInterface } from './character_input_interface';

export class UserInputInterface extends CharacterInputInterface {
  public async getNextTurnMove(): Promise<TurnMoveResult> {
    return { move: await this.resolveTurnMove() };
  }

  public async getNextChatInput(): Promise<ChatInputResult> {
    const input = await doWithScenarioLoopPromise<ChatUserInputAction>(async (userChatActionPromise) => {
      scenarioLoopPromiseCallbacks.userChatAction = userChatActionPromise;
      return await userChatActionPromise.promise;
    });

    return { input };
  }

  public continuesAfterMove(move: TurnMove, outcome: TurnMoveOutcome): boolean {
    const freedomOfMovement = useSettingsStore.getState().freedomOfMovement;

    if (move.actionType === 'move') {
      return !move.consumesTurn;
    }

    if (move.actionType === 'chat') {
      return freedomOfMovement || outcome.noEffect;
    }

    return false;
  }

  private async resolveTurnMove(): Promise<TurnMove> {
    if (useScenarioLoopStateStore.getState().autoMode) {
      return { actionType: 'wait' };
    }

    const userAction = await doWithScenarioLoopPromise<UserTurnAction>(async (userActionPromise) => {
      scenarioLoopPromiseCallbacks.userTurnAction = userActionPromise;
      return userActionPromise.promise;
    });

    const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
    assertNonNullish(userCharacter, 'User character not found');

    if (userAction.actionType === 'initiate_chat') {
      return {
        actionType: 'chat',
        participantIds: [userCharacter.id, userAction.characterId],
        rich: true,
      };
    } else if (userAction.actionType === 'move') {
      return userAction;
    } else if (userAction.actionType === 'wait') {
      return { actionType: 'wait' };
    }

    assert(false, 'Unknown user action type');
  }
}
