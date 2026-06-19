import { assert, assertNonNullish } from '../../../errors/application_error';
import { useScenarioCharacterStore } from '../../../state/scenario_character_store';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store';
import { useSettingsStore } from '../../../state/settings_store';
import { ChatCoordinator } from '../../chat/chat_coordinator';
import {
  doWithScenarioLoopPromise,
  scenarioLoopPromiseCallbacks,
  UserAbortSignalException,
} from '../flow_control';
import type {
  ChatTurnInput,
  ChatUserInputAction,
  TurnMove,
  TurnMoveOutcome,
  UserTurnAction,
} from '../types';
import { CharacterInputInterface } from './character_input_interface';

export class UserInputInterface extends CharacterInputInterface {
  public async getNextTurnMove(): Promise<TurnMove> {
    // In auto mode the user character is passive; it yields its turn without waiting for UI input.
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
      return { actionType: 'move', destinationLocationId: userAction.destinationLocationId };
    } else if (userAction.actionType === 'wait') {
      return { actionType: 'wait' };
    }

    assert(false, 'Unknown user action type');
  }

  public async getNextChatInput(): Promise<ChatTurnInput> {
    ChatCoordinator.setStateAwaitingUserInput();

    return doWithScenarioLoopPromise<ChatUserInputAction>(async (userChatActionPromise) => {
      scenarioLoopPromiseCallbacks.userChatAction = userChatActionPromise;
      // While parked for steering we are not inside withPhaseTransitionGate, so handle a Stop
      // request here by aborting the wait and unwinding back to the turn loop.
      const unsubscribe = useScenarioLoopStateStore.subscribe((state) => {
        if (state.userRequestedPhaseTransition === 'stopped') {
          userChatActionPromise.reject(new UserAbortSignalException());
        }
      });
      try {
        return await userChatActionPromise.promise;
      } finally {
        unsubscribe();
      }
    });
  }

  public continuesAfterMove(move: TurnMove, outcome: TurnMoveOutcome): boolean {
    const freedomOfMovement = useSettingsStore.getState().freedomOfMovement;

    if (move.actionType === 'move') {
      return freedomOfMovement;
    }

    if (move.actionType === 'chat') {
      // A consequential chat ends the turn unless the user has freedom of movement.
      return freedomOfMovement || outcome.noEffect;
    }

    // 'wait' ends the turn.
    return false;
  }
}
