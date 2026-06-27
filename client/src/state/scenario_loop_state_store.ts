import { create } from 'zustand';
import type {
  ChatUserInputAction,
  ChatUserInputRequestEnd,
  ScenarioLoopRunState,
  UserTurnAction,
} from '../engine/scenario_loop/types';
import { scenarioLoopPromiseCallbacks } from '../engine/scenario_loop/flow_control';

export type UserRequestedPhaseTransition = 'none' | 'paused' | 'stopped';

type ScenarioLoopStateStoreState = {
  autoMode: boolean;
  runState: ScenarioLoopRunState;
  runningForScenario: string | undefined;
  userRequestedPhaseTransition: UserRequestedPhaseTransition;
  lastTemporalDayIndex: number | undefined;

  setScenario: (scenarioId: string | undefined) => void;
  setAutoMode: (enabled: boolean) => void;
  setRunState: (runState: ScenarioLoopRunState) => void;
  setUserRequestedPhaseTransition: (value: UserRequestedPhaseTransition) => void;
  setLastTemporalDayIndex: (dayIndex: number | undefined) => void;
  resetLoopState: () => void;
  submitChatMessage: (message: string) => boolean;
  submitChatSkipTurn: () => boolean;
  submitChatSpeakAs: (characterId: string) => boolean;
  submitChatRequestEnd: (opts?: Pick<ChatUserInputRequestEnd, 'forceNoEffect'>) => boolean;
  submitChatDeleteMessage: (messageId: string) => boolean;
  submitChatRedoMessage: (messageId: string) => boolean;
  submitChatEditMessage: (messageId: string, newContent: string) => boolean;
  submitChatGenerateImage: (prompt: string) => boolean;
  submitUserWait: () => boolean;
  submitUserMove: (destinationLocationId: string, consumesTurn: boolean) => boolean;
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

  pending.resolve(action);
  scenarioLoopPromiseCallbacks.userChatAction = undefined;
  return true;
}

export const useScenarioLoopStateStore = create<ScenarioLoopStateStoreState>((set) => ({
  autoMode: false,
  runState: 'idle',
  runningForScenario: undefined,
  userRequestedPhaseTransition: 'none',
  lastTemporalDayIndex: undefined,

  setAutoMode(enabled: boolean) {
    set({
      autoMode: enabled,
    });
  },

  setRunState(runState: ScenarioLoopRunState) {
    set({ runState });
  },

  setUserRequestedPhaseTransition(value: UserRequestedPhaseTransition) {
    set({ userRequestedPhaseTransition: value });
  },

  setLastTemporalDayIndex(dayIndex: number | undefined) {
    set({ lastTemporalDayIndex: dayIndex });
  },

  resetLoopState() {
    set({
      runState: 'idle',
      userRequestedPhaseTransition: 'none',
      lastTemporalDayIndex: undefined,
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

  submitChatDeleteMessage(messageId: string) {
    return resolveChatUserInputAction({ actionType: 'delete_message', messageId });
  },

  submitChatRedoMessage(messageId: string) {
    return resolveChatUserInputAction({ actionType: 'redo_message', messageId });
  },

  submitChatEditMessage(messageId: string, newContent: string) {
    return resolveChatUserInputAction({ actionType: 'edit_message', messageId, newContent });
  },

  submitChatGenerateImage(prompt: string) {
    return resolveChatUserInputAction({ actionType: 'generate_image', prompt });
  },

  submitUserWait() {
    return resolveUserTurnAction({
      actionType: 'wait',
    });
  },

  submitUserMove(destinationLocationId: string, consumesTurn: boolean) {
    return resolveUserTurnAction({
      actionType: 'move',
      destinationLocationId,
      consumesTurn,
    });
  },

  submitUserChatAction(characterId: string) {
    return resolveUserTurnAction({
      actionType: 'initiate_chat',
      characterId,
    });
  },

  setScenario: (scenarioId) => {
    set({ runningForScenario: scenarioId, lastTemporalDayIndex: undefined });
  },
}));
