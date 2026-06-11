import { create } from 'zustand';
import type {
  ChatUserInputAction,
  ChatUserInputRequestEnd,
  ScenarioLoopRunState,
  UserTurnAction,
} from '../engine/scenario_loop/types';
import { scenarioLoopPromiseCallbacks } from '../engine/scenario_loop/flow_control';
import { useActiveChatStore } from './active_chat_store';

type ScenarioLoopPhase = 'user' | 'npc';

type ScenarioLoopStateStoreState = {
  currentPhase: ScenarioLoopPhase;
  autoMode: boolean;
  runState: ScenarioLoopRunState;

  setPhase: (phase: ScenarioLoopPhase) => void;
  setAutoMode: (enabled: boolean) => void;
  setRunState: (runState: ScenarioLoopRunState) => void;
  resetLoopState: () => void;
  submitChatMessage: (message: string) => boolean;
  submitChatSkipTurn: () => boolean;
  submitChatSpeakAs: (characterId: string) => boolean;
  submitChatRequestEnd: (opts?: Pick<ChatUserInputRequestEnd, 'forceNoEffect'>) => boolean;
  submitUserWait: () => boolean;
  submitUserMove: (destinationLocationId: string) => boolean;
  submitUserChatAction: (characterId: string) => boolean;
};

function resolveUserTurnAction(action: UserTurnAction): boolean {
  const pending = scenarioLoopPromiseCallbacks.userTurnAction;
  if (!pending) {
    return false;
  }

  pending.resolve(action);
  scenarioLoopPromiseCallbacks.userTurnAction = undefined;
  return true;
}

function resolveChatUserInputAction(action: ChatUserInputAction): boolean {
  const pending = scenarioLoopPromiseCallbacks.userChatAction;
  if (!pending) {
    return false;
  }

  if (useActiveChatStore.getState().chatState !== 'awaiting_user_input') {
    return false;
  }

  pending.resolve(action);
  scenarioLoopPromiseCallbacks.userChatAction = undefined;
  return true;
}

export const useScenarioLoopStateStore = create<ScenarioLoopStateStoreState>((set) => ({
  currentPhase: 'user',
  autoMode: false,
  runState: 'idle',

  setPhase(phase: ScenarioLoopPhase) {
    set({
      currentPhase: phase,
    });
  },

  setAutoMode(enabled: boolean) {
    set({
      autoMode: enabled,
    });
  },

  setRunState(runState: ScenarioLoopRunState) {
    set({ runState });
  },

  resetLoopState() {
    set({
      currentPhase: 'user',
      runState: 'idle',
    });
  },

  submitChatMessage(message: string) {
    return resolveChatUserInputAction({
      actionType: 'send_message',
      message,
    });
  },

  submitChatSkipTurn() {
    return resolveChatUserInputAction({
      actionType: 'skip_turn',
    });
  },

  submitChatSpeakAs(characterId: string) {
    return resolveChatUserInputAction({
      actionType: 'speak_as',
      characterId,
    });
  },

  submitChatRequestEnd(opts?: Pick<ChatUserInputRequestEnd, 'forceNoEffect'>) {
    return resolveChatUserInputAction({
      actionType: 'request_end_chat',
      ...opts,
    } satisfies ChatUserInputRequestEnd);
  },

  submitUserWait() {
    return resolveUserTurnAction({
      actionType: 'wait',
    });
  },

  submitUserMove(destinationLocationId: string) {
    return resolveUserTurnAction({
      actionType: 'move',
      destinationLocationId,
    });
  },

  submitUserChatAction(characterId: string) {
    return resolveUserTurnAction({
      actionType: 'initiate_chat',
      characterId,
    });
  },
}));
