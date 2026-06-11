interface UserTurnActionWait {
  actionType: 'wait';
}

interface UserTurnActionMove {
  actionType: 'move';
  destinationLocationId: string;
}

interface UserTurnActionInitiateChat {
  actionType: 'initiate_chat';
  characterId: string;
}

export type UserTurnAction = UserTurnActionWait | UserTurnActionMove | UserTurnActionInitiateChat;

interface ChatUserInputSendMessage {
  actionType: 'send_message';
  message: string;
}

interface ChatUserInputSkipTurn {
  actionType: 'skip_turn';
}

interface ChatUserInputSpeakAs {
  actionType: 'speak_as';
  characterId: string;
}

export interface ChatUserInputRequestEnd {
  actionType: 'request_end_chat';
  forceNoEffect?: boolean;
}

export type ChatUserInputAction =
  | ChatUserInputSendMessage
  | ChatUserInputSkipTurn
  | ChatUserInputSpeakAs
  | ChatUserInputRequestEnd;

export type ScenarioLoopRunState = 'idle' | 'running' | 'errored';
