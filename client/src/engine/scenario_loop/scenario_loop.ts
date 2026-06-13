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
  const activeChatStore = useActiveChatStore;
  const includesUser = activeChatStore.getState().userIsParticipant();
  const noEffect = forceNoEffect || (includesUser && !ChatCoordinator.hasUserChatMessages());

  doPostConversationWardrobeAutoRevert();
  await doScenarioLoopAsyncAction(() => ChatCoordinator.endActiveChat(noEffect));

  return {
    noEffect,
  };
}

function getChatMessageLimit() {
  const chatState = useActiveChatStore.getState();
  const settings = useSettingsStore.getState();

  if (chatState.userIsParticipant()) {
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
          return userChatActionPromise.promise;
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
      await doScenarioLoopAsyncAction(() => ChatCoordinator.speakAsNpc(nextSpeaker.id));
      nextSpeaker = await doScenarioLoopAsyncAction(() => ChatCoordinator.selectNextSpeaker());
    }
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
    runWardrobeAutoselect();
    await runUserPhase({ resumeRestoredChat });
    resumeRestoredChat = false;
    await runNpcPhase();
  }
}

function stopScenarioLoop() {
  abortAllPendingActions();
  scenarioLoopPromiseCallbacks.userTurnAction = undefined;
  scenarioLoopPromiseCallbacks.userChatAction = undefined;
  useScenarioLoopStateStore.getState().resetLoopState();
}

export async function startScenarioLoop() {
  stopScenarioLoop();
  const loopState = useScenarioLoopStateStore.getState();

  loopState.setRunState('running');

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
      hint: 'The scenario loop is no longer running. Try refreshing the page.',
    });

    throw err;
  }
}
