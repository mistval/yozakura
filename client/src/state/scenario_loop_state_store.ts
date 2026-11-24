import { create } from 'zustand';
import type {
  ChatUserInputAction,
  ChatUserInputRequestEnd,
  ScenarioLoopRunState,
  UserTurnAction,
} from '../engine/scenario_loop/types';
import { scenarioLoopPromiseCallbacks } from '../engine/scenario_loop/flow_control';

export type UserRequestedPhaseTransition = 'none' | 'paused';

export type PendingImagePromptEdit = { prompt: string; afterMessageId: string | undefined };

type ScenarioLoopStateStoreState = {
  autoMode: boolean;
  runState: ScenarioLoopRunState;
  runningForScenario: string | undefined;
  userRequestedPhaseTransition: UserRequestedPhaseTransition;
  pendingImagePromptEdit: PendingImagePromptEdit | undefined;
  lastTemporalDayIndex: number | undefined;

  setScenario: (scenarioId: string | undefined) => void;
  setAutoMode: (enabled: boolean) => void;
  setRunState: (runState: ScenarioLoopRunState) => void;
  setUserRequestedPhaseTransition: (value: UserRequestedPhaseTransition) => void;
  setPendingImagePromptEdit: (value: PendingImagePromptEdit | undefined) => void;
  setLastTemporalDayIndex: (dayIndex: number | undefined) => void;
  resetLoopState: () => void;
  submitChatMessage: (message: string) => boolean;
  submitChatSkipTurn: () => boolean;
  submitChatSpeakAs: (characterId: string) => boolean;
  submitChatRequestEnd: (opts?: Pick<ChatUserInputRequestEnd, 'forceNoEffect'>) => boolean;
  submitChatRedoMessage: (messageId: string) => boolean;
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

export const useScenarioLoopStateStore = create<ScenarioLoopStateStoreState>((set, get) => ({
  autoMode: false,
  runState: 'idle',
  runningForScenario: undefined,
  userRequestedPhaseTransition: 'none',
  pendingImagePromptEdit: undefined,
  lastTemporalDayIndex: undefined,

  setAutoMode(enabled: boolean) {
    if (enabled === get().autoMode) {
      return;
    }

    set({
      autoMode: enabled,
    });
  },

  setRunState(runState: ScenarioLoopRunState) {
    if (runState === get().runState) {
      return;
    }

    set({ runState });
  },

  setUserRequestedPhaseTransition(value: UserRequestedPhaseTransition) {
    if (value === get().userRequestedPhaseTransition) {
      return;
    }

    set({ userRequestedPhaseTransition: value });
  },

  setPendingImagePromptEdit(value: PendingImagePromptEdit | undefined) {
    if (value === get().pendingImagePromptEdit) {
      return;
    }

    set({ pendingImagePromptEdit: value });
  },

  setLastTemporalDayIndex(dayIndex: number | undefined) {
    if (dayIndex === get().lastTemporalDayIndex) {
      return;
    }

    set({ lastTemporalDayIndex: dayIndex });
  },

  resetLoopState() {
    set({
      runState: 'idle',
      userRequestedPhaseTransition: 'none',
      pendingImagePromptEdit: undefined,
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

  submitChatRedoMessage(messageId: string) {
    return resolveChatUserInputAction({ actionType: 'redo_message', messageId });
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
