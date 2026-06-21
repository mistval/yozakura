import { assert, assertNonNullish } from '../../errors/application_error';
import { useActiveChatStore } from '../../state/active_chat_store';
import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store';
import { getRequiredActiveScenario, useScenarioStore } from '../../state/scenario_store';
import { useSettingsStore } from '../../state/settings_store';
import { ChatCoordinator } from '../chat/chat_coordinator';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry';
import { buildSimpleInteractionRelationshipUpdates } from '../relationship';
import { TURNS_PER_PERIOD } from '../schedule';
import { timeOfDaySchema } from '../types';
import { applyDailyWardrobeAutoselect, applyPostConversationWardrobeAutoRevert } from '../wardrobes';
import { CharacterInputInterface } from './character_input_interfaces/character_input_interface';
import { NPCInputInterface } from './character_input_interfaces/npc_input_interface';
import { UserInputInterface } from './character_input_interfaces/user_input_interface';
import {
  doScenarioLoopAsyncAction,
  ScenarioLoopAbortSignalException,
  UserAbortSignalException,
} from './flow_control';
import { persistTurn } from './turn_persistence';
import type { TurnMove, TurnMoveOutcome } from './types';

export async function runTurnLoop() {
  while (true) {
    try {
      await runTurnLoopTick();
    } catch (err) {
      if (err instanceof UserAbortSignalException) {
        const loopState = useScenarioLoopStateStore.getState();
        loopState.setAutoMode(false);
        loopState.setUserRequestedPhaseTransition('none');
        useActiveChatStore.getState().reset();
        persistTurn();
        continue;
      }

      if (err instanceof ScenarioLoopAbortSignalException) {
        throw err;
      }

      await showNonRetriableErrorCardIfNeeded({
        operationType: 'chat_loop_top_level',
        error: err as Error,
      });

      throw err;
    }
  }
}

async function runTurnLoopTick() {
  const { machineState, currentCharacterId, startNewTurn } = useActiveChatStore.getState();

  if (machineState === undefined) {
    runWardrobeAutoselect();
    startNewTurn(getTurnCharacterIds(), getRequiredUserCharacterId());
  }

  const characterId = currentCharacterId();
  assertNonNullish(characterId, 'No current character to process');

  const inputInterface = makeInputInterface(characterId);

  if (machineState === 'chatting') {
    const chatMove: TurnMove = {
      actionType: 'chat',
      participantIds: useActiveChatStore.getState().participantIds,
      rich: true,
    };
    const outcome = await runChatLoop();
    advanceAfterMove(inputInterface, chatMove, outcome, true);
    return;
  }

  const { move, persist } = await inputInterface.getNextTurnMove();

  if (move.actionType === 'chat' && move.rich) {
    const chatStart = await doScenarioLoopAsyncAction(() =>
      ChatCoordinator.prepareChatStart(move.participantIds)
    );
    useActiveChatStore.getState().beginChat(chatStart);
    persistTurn();
    return;
  }

  const outcome = await applySimpleTurnMove(characterId, move);
  advanceAfterMove(inputInterface, move, outcome, persist);
}

function advanceAfterMove(
  inputInterface: CharacterInputInterface,
  move: TurnMove,
  outcome: TurnMoveOutcome,
  persist: boolean
) {
  const store = useActiveChatStore.getState();

  let turnEnded = false;
  if (inputInterface.continuesAfterMove(move, outcome)) {
    store.setMachineState('deciding');
  } else {
    turnEnded = store.finishCurrentCharacter();
  }

  if (turnEnded) {
    incrementTurnNumber();
  }

  if (persist || turnEnded) {
    persistTurn();
  }
}

async function runChatLoop(): Promise<{ noEffect: boolean }> {
  ChatCoordinator.enterActiveChat();

  if (useSettingsStore.getState().pauseAtNpcChatStart && !useActiveChatStore.getState().userIsParticipant()) {
    useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('paused');
  }

  try {
    let nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());

    while (true) {
      const speakerInput = makeInputInterface(nextSpeaker.id);
      const { input, persist } = await speakerInput.getNextChatInput();

      if (input.actionType === 'skip_turn') {
        nextSpeaker = await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.selectNextSpeaker({ notSpeakerId: nextSpeaker.id })
        );
      } else if (input.actionType === 'speak_as') {
        nextSpeaker = await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.selectNextSpeaker({ forcedSpeakerId: input.characterId })
        );
      } else if (input.actionType === 'request_end_chat') {
        return closeChatSession(input.forceNoEffect);
      } else if (input.actionType === 'send_message') {
        await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.addCharacterMessage(nextSpeaker.id, input.message)
        );
        nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
      } else if (input.actionType === 'spoke') {
        nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
      } else {
        assert(false, 'Unexpected chat input action');
      }

      if (persist) {
        persistTurn();
      }
    }
  } catch (err) {
    await closeChatSession(true);
    throw err;
  }
}

async function applySimpleTurnMove(characterId: string, move: TurnMove): Promise<TurnMoveOutcome> {
  if (move.actionType === 'wait') {
    return { noEffect: true };
  }

  if (move.actionType === 'move') {
    await moveScenarioCharacter(characterId, move.destinationLocationId);
    return { noEffect: true };
  }

  if (move.actionType === 'chat') {
    const participants = useScenarioCharacterStore.getState().getCharactersByIds(move.participantIds);
    const updatedRelationships = await buildSimpleInteractionRelationshipUpdates({ participants });

    await Promise.all(
      updatedRelationships.map((r) =>
        useScenarioCharacterRelationshipStore.getState().saveRelationshipFields(r, r)
      )
    );

    return { noEffect: true };
  }

  assert(false, 'Unknown turn move type');
}

function makeInputInterface(characterId: string): CharacterInputInterface {
  const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();

  if (userCharacter && characterId === userCharacter.id) {
    return new UserInputInterface();
  }

  return new NPCInputInterface(characterId);
}

function doPostConversationWardrobeAutoRevert() {
  const activeChatState = useActiveChatStore.getState();

  const snapshot = activeChatState.preConversationWardrobeSnapshotByCharacterId;
  const idsToAutoRevert = activeChatState.participantIds.concat(activeChatState.removedParticipantIds);
  const charactersToAutoRevert = useScenarioCharacterStore.getState().getCharactersByIds(idsToAutoRevert);

  const wardrobeAutoRevertedCharacters = applyPostConversationWardrobeAutoRevert(
    charactersToAutoRevert,
    snapshot
  );

  useScenarioCharacterStore.getState().saveScenarioCharacters(wardrobeAutoRevertedCharacters);
}

async function closeChatSession(forceNoEffect?: boolean): Promise<{ noEffect: boolean }> {
  useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('none');

  const activeChatStore = useActiveChatStore.getState();
  const noEffect = forceNoEffect || (activeChatStore.transcript?.countCharacterChatMessages() ?? 0) < 2;

  doPostConversationWardrobeAutoRevert();
  await doScenarioLoopAsyncAction(() => ChatCoordinator.endActiveChat(noEffect));

  return { noEffect };
}

async function moveScenarioCharacter(characterId: string, toId: string) {
  useScenarioCharacterStore.getState().saveScenarioCharacterFields(characterId, {
    locationId: toId,
  });
}

function runWardrobeAutoselect() {
  const turnsPerDay = TURNS_PER_PERIOD * timeOfDaySchema.options.length;
  const isNewDay = getRequiredActiveScenario().turnNumber % turnsPerDay === 0;

  if (isNewDay) {
    for (const c of useScenarioCharacterStore.getState().scenarioCharacters) {
      const updatedWardrobes = applyDailyWardrobeAutoselect(c.wardrobes);
      if (updatedWardrobes) {
        useScenarioCharacterStore
          .getState()
          .saveScenarioCharacterFields(c.id, { wardrobes: updatedWardrobes });
      }
    }
  }
}

function incrementTurnNumber() {
  useScenarioStore.getState().updateScenario((prev) => ({
    ...prev,
    turnNumber: prev.turnNumber + 1,
  }));
}

function getTurnCharacterIds(): string[] {
  return useScenarioCharacterStore.getState().scenarioCharacters.map((c) => c.id);
}

function getRequiredUserCharacterId(): string {
  const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
  assertNonNullish(userCharacter, 'User character not found');
  return userCharacter.id;
}
