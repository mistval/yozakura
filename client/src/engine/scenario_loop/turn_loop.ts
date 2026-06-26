import { assert, assertNonNullish } from '../../errors/application_error';
import { useTurnMachineStore } from '../../state/turn_machine_store';
import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store';
import { getRequiredUserCharacterId, useScenarioStore } from '../../state/scenario_store';
import * as Database from '../../backend_bridge/database';
import { useSettingsStore } from '../../state/settings_store';
import { useTemporalContextStore } from '../../state/temporal_context_store';
import { ChatCoordinator } from '../chat/chat_coordinator';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry';
import { buildSimpleInteractionRelationshipUpdates } from '../relationship';
import { applyDailyWardrobeAutoselect, applyPostConversationWardrobeAutoRevert } from '../wardrobes';
import { CharacterInputInterface } from './character_input_interfaces/character_input_interface';
import { NPCInputInterface } from './character_input_interfaces/npc_input_interface';
import { UserInputInterface } from './character_input_interfaces/user_input_interface';
import {
  rethrowSignalException,
  ScenarioLoopAbortSignalException,
  UserAbortSignalException,
} from './flow_control';
import { persistTurn } from './turn_persistence';
import type { TurnMove, TurnMoveOutcome } from './types';
import type { MovementPolicy } from '../types';

export async function runTurnLoop(
  opts: {
    prioritizeUserOnFirstIteration?: boolean | undefined;
  } = {}
) {
  let prioritizeUser = opts.prioritizeUserOnFirstIteration ?? false;

  while (true) {
    try {
      await runTurnLoopTick({
        prioritizeUser,
      });

      prioritizeUser = false;
    } catch (err) {
      if (err instanceof UserAbortSignalException) {
        const loopState = useScenarioLoopStateStore.getState();
        loopState.setAutoMode(false);
        loopState.setUserRequestedPhaseTransition('none');
        useTurnMachineStore.getState().reset();
        prioritizeUser = true;
        persistTurn();
        continue;
      }

      if (err instanceof ScenarioLoopAbortSignalException) {
        throw err;
      }

      await showNonRetriableErrorCardIfNeeded({
        operationType: 'turn_loop_top_level',
        error: err as Error,
      });

      throw err;
    }
  }
}

async function runTurnLoopTick(opts?: { prioritizeUser?: boolean | undefined }) {
  const { turnMachineState, currentCharacterId, startNewTurn } = useTurnMachineStore.getState();

  await recomputeTemporalContextAndAutoselectWardrobes();

  if (turnMachineState === undefined) {
    startNewTurn({
      userMovesFirst: opts?.prioritizeUser,
    });
  }

  const characterId = currentCharacterId();
  assertNonNullish(characterId, 'No current character to process');
  const character = useScenarioCharacterStore.getState().getCharacterById(characterId);
  if (!character) {
    advanceState(false);
    return;
  }

  const inputInterface = makeInputInterface(characterId);

  if (turnMachineState === 'chatting') {
    const chatMove: TurnMove = {
      actionType: 'chat',
      participantIds: useTurnMachineStore.getState().participantIds,
      rich: true,
    };

    const outcome = await runChatLoop({ userSpeaksFirst: opts?.prioritizeUser });
    advanceState(inputInterface.continuesAfterMove(chatMove, outcome));
    return;
  }

  const { move } = await inputInterface.getNextTurnMove();

  if (move.actionType === 'chat' && move.rich) {
    const chatStart = await ChatCoordinator.prepareChatStart(move.participantIds);
    useTurnMachineStore.getState().beginChat(chatStart);
    persistTurn();
    return;
  }

  const outcome = await applySimpleTurnMove(characterId, move);
  advanceState(inputInterface.continuesAfterMove(move, outcome));
}

function advanceState(currentCharacterShouldMoveAgain: boolean) {
  const store = useTurnMachineStore.getState();

  let turnEnded = false;
  if (currentCharacterShouldMoveAgain) {
    store.setTurnMachineState('deciding');
  } else {
    turnEnded = store.finishCurrentCharacter();
  }

  if (turnEnded) {
    incrementTurnNumber();
  }

  persistTurn();
}

async function runChatLoop(opts?: { userSpeaksFirst?: boolean | undefined }): Promise<{ noEffect: boolean }> {
  ChatCoordinator.enterActiveChat();

  if (
    useSettingsStore.getState().pauseAtNpcChatStart &&
    !useTurnMachineStore.getState().userIsParticipant()
  ) {
    useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('paused');
  }

  try {
    let nextSpeaker = await ChatCoordinator.selectNextSpeaker({
      forcedSpeakerId: opts?.userSpeaksFirst ? getRequiredUserCharacterId() : undefined,
    });

    while (true) {
      try {
        const speakerInput = makeInputInterface(nextSpeaker.id);
        ChatCoordinator.setStateAwaitingCharacterInput();
        const { input } = await speakerInput.getNextChatInput();

        if (input.actionType === 'skip_turn') {
          nextSpeaker = await ChatCoordinator.selectNextSpeaker({ notSpeakerId: nextSpeaker.id });
        } else if (input.actionType === 'speak_as') {
          nextSpeaker = await ChatCoordinator.selectNextSpeaker({ forcedSpeakerId: input.characterId });
        } else if (input.actionType === 'request_end_chat') {
          return closeChatSession(input.forceNoEffect);
        } else if (input.actionType === 'send_message') {
          await ChatCoordinator.addCharacterMessage(nextSpeaker.id, input.message);
          nextSpeaker = await ChatCoordinator.selectNextSpeaker();
        } else if (input.actionType === 'spoke') {
          nextSpeaker = await ChatCoordinator.selectNextSpeaker();
        } else if (input.actionType === 'delete_message') {
          ChatCoordinator.deleteMessageById(input.messageId);
        } else if (input.actionType === 'redo_message') {
          await ChatCoordinator.redoMessageById(input.messageId);
          nextSpeaker = await ChatCoordinator.selectNextSpeaker();
        } else if (input.actionType === 'edit_message') {
          ChatCoordinator.editMessageById(input.messageId, input.newContent);
        } else if (input.actionType === 'generate_image') {
          ChatCoordinator.generateImageFromPrompt(input.prompt, { isUserInteraction: true });
        } else {
          assert(false, 'Unknown chat input action');
        }

        persistTurn();
      } catch (err) {
        rethrowSignalException(err);

        void showNonRetriableErrorCardIfNeeded({
          error: err,
          operationType: 'chat_loop_inner',
          hint: 'Control will be handed to the user',
        });

        nextSpeaker = await ChatCoordinator.selectNextSpeaker({
          forcedSpeakerId: getRequiredUserCharacterId(),
        });
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
    recordMovement(characterId, move.destinationLocationId, move.movementPolicy);
    moveScenarioCharacter(characterId, move.destinationLocationId);
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
  const activeChatState = useTurnMachineStore.getState();

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

  const activeChatStore = useTurnMachineStore.getState();
  const noEffect = forceNoEffect || (activeChatStore.transcript?.countCharacterChatMessages() ?? 0) < 2;

  doPostConversationWardrobeAutoRevert();
  await ChatCoordinator.endActiveChat(noEffect);

  return { noEffect };
}

function moveScenarioCharacter(characterId: string, toId: string) {
  useScenarioCharacterStore.getState().saveScenarioCharacterFields(characterId, {
    locationId: toId,
  });
}

function recordMovement(characterId: string, toId: string, movementPolicy: MovementPolicy | undefined) {
  const scenario = useScenarioStore.getState().activeScenario;
  const character = useScenarioCharacterStore.getState().scenarioCharactersById[characterId];
  const map = useScenarioStore.getState().activeScenarioMap;
  if (!scenario || !character || !map || character.locationId === toId) {
    return;
  }

  const locationName = (locationId: string) =>
    map.locations.find((location) => location.id === locationId)?.name ?? locationId;

  const event = Database.createPersistedObject({
    eventType: 'movement' as const,
    turnNumber: scenario.turnNumber,
    characterId,
    characterName: `${character.firstName} ${character.lastName}`,
    movementPolicy,
    fromLocationName: locationName(character.locationId),
    toLocationName: locationName(toId),
  });

  void Database.doAsDataWrite(() => Database.storeScenarioEvent(scenario.id, event), 'scenario_event_log');
}

async function recomputeTemporalContextAndAutoselectWardrobes() {
  const temporalContext = await useTemporalContextStore.getState().computeAndSet();

  // If no temporal context, no wardrobe autoselect
  if (temporalContext.dayIndex === undefined) {
    return;
  }

  const loopState = useScenarioLoopStateStore.getState();
  const lastDayIndex = loopState.lastTemporalDayIndex;
  loopState.setLastTemporalDayIndex(temporalContext.dayIndex);

  // If day index has not changed, don't trigger auto select
  if (temporalContext.dayIndex === lastDayIndex) {
    return;
  }

  // If we don't have a lastDayIndex, it could just be because application
  // we just launched, so try computing lastDayIndex based on previous turn number
  if (lastDayIndex === undefined) {
    const activeScenario = useScenarioStore.getState().activeScenario;

    // If turn number in non-zero, we can compute the dayIndex of
    // previous turn
    if (activeScenario && (activeScenario?.turnNumber ?? 0) > 0) {
      const computedLastDayContext = await temporalContext.compute({
        ...activeScenario,
        turnNumber: activeScenario.turnNumber - 1,
      });

      if (computedLastDayContext?.dayIndex === temporalContext.dayIndex) {
        return;
      }
    }
  }

  for (const c of useScenarioCharacterStore.getState().scenarioCharacters) {
    const updatedWardrobes = applyDailyWardrobeAutoselect(c.wardrobes);
    if (updatedWardrobes) {
      useScenarioCharacterStore.getState().saveScenarioCharacterFields(c.id, { wardrobes: updatedWardrobes });
    }
  }
}

function incrementTurnNumber() {
  useScenarioStore.getState().updateScenario((prev) => ({
    ...prev,
    turnNumber: prev.turnNumber + 1,
  }));
}
