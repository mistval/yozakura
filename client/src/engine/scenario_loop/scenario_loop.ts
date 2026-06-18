import { assert, assertNonNullish } from '../../errors/application_error';
import { useActiveChatStore, whenActiveChatRestoreSettled } from '../../state/active_chat_store';
import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store';
import { getRequiredActiveScenario, useScenarioStore } from '../../state/scenario_store';
import { useSettingsStore } from '../../state/settings_store';
import { ChatCoordinator } from '../chat/chat_coordinator';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry';
import { NPCTurnRunner } from '../npc_turn_runner';
import { buildSimpleInteractionRelationshipUpdates } from '../relationship';
import { TURNS_PER_PERIOD } from '../schedule';
import { timeOfDaySchema } from '../types';
import { applyDailyWardrobeAutoselect, applyPostConversationWardrobeAutoRevert } from '../wardrobes';
import {
  abortAllPendingActions,
  doScenarioLoopAsyncAction,
  doWithScenarioLoopPromise,
  ScenarioLoopAbortSignalException,
  scenarioLoopPromiseCallbacks,
  UserAbortSignalException,
} from './flow_control';
import type { ChatUserInputAction, UserTurnAction } from './types';

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
  // Ending a chat always clears the steering pause (so post-chat work and subsequent NPC turns run).
  useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('none');

  const activeChatStore = useActiveChatStore.getState();
  const noEffect = forceNoEffect || (activeChatStore.transcript?.countAllMessages() ?? 0) < 2;

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

async function runChatLoop(
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

      const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();

      if (userCharacter && nextSpeaker.id === userCharacter.id) {
        ChatCoordinator.setStateAwaitingUserInput();
        const userChatAction = await doWithScenarioLoopPromise<ChatUserInputAction>(
          async (userChatActionPromise) => {
            scenarioLoopPromiseCallbacks.userChatAction = userChatActionPromise;
            // While parked for steering we are not inside withPhaseTransitionGate, so handle a Stop
            // request here by aborting the wait and unwinding back to the user phase.
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
          }
        );

        if (userChatAction.actionType === 'skip_turn') {
          nextSpeaker = await doScenarioLoopAsyncAction(() =>
            ChatCoordinator.selectNextSpeaker({ notSpeakerId: nextSpeaker.id })
          );
        } else if (userChatAction.actionType === 'speak_as') {
          nextSpeaker = await doScenarioLoopAsyncAction(() =>
            ChatCoordinator.selectNextSpeaker({ forcedSpeakerId: userChatAction.characterId })
          );
        } else if (userChatAction.actionType === 'request_end_chat') {
          const transcript = useActiveChatStore.getState().transcript;
          assertNonNullish(transcript, 'No chat transcript');
          return closeChatSession(userChatAction.forceNoEffect);
        } else if (userChatAction.actionType === 'send_message') {
          await doScenarioLoopAsyncAction(() =>
            ChatCoordinator.addCharacterMessage(userCharacter.id, userChatAction.message)
          );

          nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
        } else {
          assert(false, 'Unexpected user chat action');
        }
      } else {
        ChatCoordinator.setStateNpcSpeaking();
        // While paused, the only way an NPC is the next speaker is because the user explicitly chose
        // them, so this generation is a user interaction that must bypass the pause gate.
        const isUserInteraction = ChatCoordinator.isChatPaused();
        await doScenarioLoopAsyncAction(() =>
          ChatCoordinator.speakAsNpc(nextSpeaker.id, { isUserInteraction })
        );
        nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
      }
    }
  } catch (err) {
    await closeChatSession(true);
    throw err;
  }
}

async function runUserChatAndShouldEndPhase(
  participantIds: string[],
  opts?: { resumeRestored?: boolean }
): Promise<boolean> {
  const { noEffect } = await runChatLoop(participantIds, opts);
  return !noEffect && !useSettingsStore.getState().freedomOfMovement;
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

async function runUserPhase(opts?: { resumeRestoredChat?: boolean }) {
  const scenarioLoopState = useScenarioLoopStateStore.getState();
  scenarioLoopState.setPhase('user');

  if (opts?.resumeRestoredChat && useActiveChatStore.getState().isActive()) {
    const restoredParticipantIds = useActiveChatStore.getState().participantIds;
    if (await runUserChatAndShouldEndPhase(restoredParticipantIds, { resumeRestored: true })) {
      return;
    }
  }

  if (scenarioLoopState.autoMode) {
    return;
  }

  while (true) {
    const userAction = await doWithScenarioLoopPromise<UserTurnAction>(async (userActionPromise) => {
      scenarioLoopPromiseCallbacks.userTurnAction = userActionPromise;
      return userActionPromise.promise;
    });

    const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
    assertNonNullish(userCharacter, 'User character not found');

    if (userAction.actionType === 'initiate_chat') {
      if (await runUserChatAndShouldEndPhase([userCharacter.id, userAction.characterId])) {
        return;
      }
    } else if (userAction.actionType == 'move') {
      await moveScenarioCharacter(userCharacter.id, userAction.destinationLocationId);

      if (!useSettingsStore.getState().freedomOfMovement) {
        return;
      }
    } else if (userAction.actionType === 'wait') {
      return;
    } else {
      assert(false, 'Unknown user action type');
    }
  }
}

async function runNpcPhase() {
  useScenarioLoopStateStore.getState().setPhase('npc');
  const turnRunner = new NPCTurnRunner();

  while (true) {
    const runnerResult = await doScenarioLoopAsyncAction(() => turnRunner.runNextTurn());

    if (runnerResult.result === 'all_turns_complete') {
      useScenarioStore.getState().updateScenario((prev) => ({
        ...prev,
        turnNumber: prev.turnNumber + 1,
      }));

      return;
    }

    if (runnerResult.result === 'do_rich_interaction') {
      await runChatLoop(runnerResult.participants.map((p) => p.id));
    } else if (runnerResult.result === 'do_simple_interaction') {
      const updatedRelationships = await buildSimpleInteractionRelationshipUpdates({
        participants: runnerResult.participants,
      });

      await Promise.all(
        updatedRelationships.map((r) =>
          useScenarioCharacterRelationshipStore.getState().saveRelationshipFields(r, r)
        )
      );
    } else if (runnerResult.result === 'npc_moved') {
      await moveScenarioCharacter(runnerResult.characterId, runnerResult.destinationLocationId);
    } else {
      assert(false, 'Unknown NPC turn result');
    }
  }
}

async function runScenarioLoop(opts: { resumeRestoredChat: boolean }) {
  let resumeRestoredChat = opts.resumeRestoredChat;

  while (true) {
    try {
      runWardrobeAutoselect();
      await runUserPhase({ resumeRestoredChat });
      resumeRestoredChat = false;
      await runNpcPhase();
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
