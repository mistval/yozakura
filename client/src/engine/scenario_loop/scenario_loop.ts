import { assert, assertNonNullish } from '../../errors/application_error';
import { useActiveChatStore, whenActiveChatRestoreSettled } from '../../state/active_chat_store';
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
  abortAllPendingActions,
  doScenarioLoopAsyncAction,
  ScenarioLoopAbortSignalException,
  scenarioLoopPromiseCallbacks,
  UserAbortSignalException,
} from './flow_control';
import { TurnState } from './turn_state';
import type { TurnMove, TurnMoveOutcome } from './types';

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

async function closeChatSession(forceNoEffect?: boolean): Promise<{
  noEffect: boolean;
}> {
  // Ending a chat always clears the steering pause (so post-chat work and subsequent turns run).
  useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('none');

  const activeChatStore = useActiveChatStore.getState();
  const noEffect = forceNoEffect || (activeChatStore.transcript?.countCharacterChatMessages() ?? 0) < 2;

  doPostConversationWardrobeAutoRevert();
  await doScenarioLoopAsyncAction(() => ChatCoordinator.endActiveChat(noEffect));

  return {
    noEffect,
  };
}

function getChatMessageLimit() {
  const chatState = useActiveChatStore.getState();
  const settings = useSettingsStore.getState();

  // While paused the user is steering message-by-message, so the automatic limit must not end the chat.
  if (chatState.userIsParticipant() || ChatCoordinator.isChatPaused()) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (chatState.participantIds.length > 2) {
    return settings.groupChatMessageLimit;
  }

  return settings.richNpcMessageCount * 2;
}

async function moveScenarioCharacter(characterId: string, toId: string) {
  useScenarioCharacterStore.getState().saveScenarioCharacterFields(characterId, {
    locationId: toId,
  });
}

function makeInputInterface(characterId: string, turnState: TurnState): CharacterInputInterface {
  const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();

  if (userCharacter && characterId === userCharacter.id) {
    return new UserInputInterface();
  }

  return new NPCInputInterface(characterId, turnState);
}

async function runChatLoop(
  turnState: TurnState,
  participantIds: string[],
  opts?: { resumeRestored?: boolean }
): Promise<{
  noEffect: boolean;
}> {
  if (!opts?.resumeRestored) {
    await doScenarioLoopAsyncAction(() => ChatCoordinator.activate(participantIds));
  }

  // Optionally hand the user steering control from the very start of an NPC-only chat.
  if (useSettingsStore.getState().pauseAtNpcChatStart && !useActiveChatStore.getState().userIsParticipant()) {
    useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('paused');
  }

  try {
    let nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());

    while (true) {
      const numMessagesSent = ChatCoordinator.countChatMessages();
      if (numMessagesSent >= getChatMessageLimit()) {
        return closeChatSession();
      }

      const speakerInput = makeInputInterface(nextSpeaker.id, turnState);
      const chatInput = await speakerInput.getNextChatInput();

      if (chatInput.actionType === 'skip_turn') {
        nextSpeaker = await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.selectNextSpeaker({ notSpeakerId: nextSpeaker.id })
        );
      } else if (chatInput.actionType === 'speak_as') {
        nextSpeaker = await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.selectNextSpeaker({ forcedSpeakerId: chatInput.characterId })
        );
      } else if (chatInput.actionType === 'request_end_chat') {
        const transcript = useActiveChatStore.getState().transcript;
        assertNonNullish(transcript, 'No chat transcript');
        return closeChatSession(chatInput.forceNoEffect);
      } else if (chatInput.actionType === 'send_message') {
        await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.addCharacterMessage(nextSpeaker.id, chatInput.message)
        );

        nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
      } else if (chatInput.actionType === 'spoke') {
        // The NPC interface already generated and added its own message.
        nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
      } else {
        assert(false, 'Unexpected chat input action');
      }
    }
  } catch (err) {
    await closeChatSession(true);
    throw err;
  }
}

async function applyTurnMove(
  characterId: string,
  move: TurnMove,
  turnState: TurnState
): Promise<TurnMoveOutcome> {
  if (move.actionType === 'wait') {
    return { noEffect: true };
  }

  if (move.actionType === 'move') {
    await moveScenarioCharacter(characterId, move.destinationLocationId);
    return { noEffect: true };
  }

  if (move.actionType === 'chat') {
    if (move.rich) {
      return runChatLoop(turnState, move.participantIds);
    }

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

async function processCharacterTurn(characterId: string, turnState: TurnState) {
  const inputInterface = makeInputInterface(characterId, turnState);

  while (true) {
    const move = await inputInterface.getNextTurnMove();
    const outcome = await applyTurnMove(characterId, move, turnState);

    if (!inputInterface.continuesAfterMove(move, outcome)) {
      return;
    }
  }
}

async function runTurn(turnState: TurnState) {
  const loopState = useScenarioLoopStateStore.getState();

  let characterId = turnState.peekCurrentCharacterId();
  while (characterId !== undefined) {
    loopState.setCurrentTurnCharacterId(characterId);
    await processCharacterTurn(characterId, turnState);
    turnState.completeCurrentCharacter();
    characterId = turnState.peekCurrentCharacterId();
  }
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

function getTurnCharacterIds(): string[] {
  return useScenarioCharacterStore.getState().scenarioCharacters.map((c) => c.id);
}

function getRequiredUserCharacterId(): string {
  const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
  assertNonNullish(userCharacter, 'User character not found');
  return userCharacter.id;
}

async function resumeRestoredChatIntoTurn(turnState: TurnState) {
  const restoredParticipantIds = useActiveChatStore.getState().participantIds;
  const { noEffect } = await runChatLoop(turnState, restoredParticipantIds, { resumeRestored: true });

  // Mirror the legacy restore behavior: a consequential restored chat consumes the user's turn
  // (unless they have freedom of movement). This "resume into the user round" handling is what we
  // intend to revisit once TurnState is persisted alongside the active chat.
  if (!noEffect && !useSettingsStore.getState().freedomOfMovement) {
    const userCharacterId = useScenarioCharacterStore.getState().getUserCharacter()?.id;
    if (userCharacterId !== undefined) {
      turnState.completeCharacter(userCharacterId);
    }
  }
}

async function runScenarioLoop(opts: { resumeRestoredChat: boolean }) {
  let resumeRestoredChat = opts.resumeRestoredChat;

  while (true) {
    try {
      runWardrobeAutoselect();

      const turnState = TurnState.new(getTurnCharacterIds(), [getRequiredUserCharacterId()]);

      if (resumeRestoredChat && useActiveChatStore.getState().isActive()) {
        resumeRestoredChat = false;
        await resumeRestoredChatIntoTurn(turnState);
      }

      await runTurn(turnState);

      useScenarioStore.getState().updateScenario((prev) => ({
        ...prev,
        turnNumber: prev.turnNumber + 1,
      }));
    } catch (err) {
      if (err instanceof UserAbortSignalException) {
        const loopState = useScenarioLoopStateStore.getState();
        loopState.setAutoMode(false);
        loopState.setUserRequestedPhaseTransition('none');
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

function stopScenarioLoop() {
  abortAllPendingActions();
  scenarioLoopPromiseCallbacks.userTurnAction = undefined;
  scenarioLoopPromiseCallbacks.userChatAction = undefined;
  useScenarioLoopStateStore.getState().resetLoopState();
}

export async function startScenarioLoop() {
  const loopState = useScenarioLoopStateStore.getState();
  const activeScenarioId = useScenarioStore.getState().activeScenario?.id;

  if (!activeScenarioId) {
    return;
  }

  if (activeScenarioId === loopState.runningForScenario) {
    return;
  }

  stopScenarioLoop();

  loopState.setRunState('running');
  loopState.setScenario(activeScenarioId);

  try {
    await doScenarioLoopAsyncAction(() => whenActiveChatRestoreSettled());
    const resumeRestoredChat = useActiveChatStore.getState().isActive();

    await runScenarioLoop({ resumeRestoredChat });
  } catch (err) {
    if (err instanceof ScenarioLoopAbortSignalException) {
      return;
    }

    useScenarioLoopStateStore.getState().setRunState('errored');

    await showNonRetriableErrorCardIfNeeded({
      operationType: 'scenario_loop.run_loop',
      error: err,
      messagePrefix: 'Scenario loop fatal error',
      hint: 'The scenario loop is no longer running. Try restarting the application.',
    });

    throw err;
  } finally {
    if (useScenarioLoopStateStore.getState().runningForScenario === activeScenarioId) {
      loopState.setScenario(undefined);
    }
  }
}
