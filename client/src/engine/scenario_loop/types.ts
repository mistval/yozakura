interface UserTurnActionWait {
  actionType: 'wait';
}

interface UserTurnActionMove {
  actionType: 'move';
  destinationLocationId: string;
  consumesTurn: boolean;
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

// A unified move that any character (user or NPC) can take on their turn.
interface TurnMoveWait {
  actionType: 'wait';
}

interface TurnMoveMove {
  actionType: 'move';
  destinationLocationId: string;
  consumesTurn: boolean;
}

interface TurnMoveChat {
  actionType: 'chat';
  participantIds: string[];
  // A rich chat runs a full conversation; a non-rich ("simple") chat only applies relationship updates.
  rich: boolean;
}

export type TurnMove = TurnMoveWait | TurnMoveMove | TurnMoveChat;

export interface TurnMoveOutcome {
  // For chats, whether the conversation was inconsequential. Irrelevant (always true) for other moves.
  noEffect: boolean;
}

// The result of asking a character for their next contribution to an active chat. The user supplies a
// ChatUserInputAction; an NPC generates and adds its own message, reported back as 'spoke'.
interface ChatTurnSpoke {
  actionType: 'spoke';
}

export type ChatTurnInput = ChatUserInputAction | ChatTurnSpoke;

export interface TurnMoveResult {
  move: TurnMove;
  persist: boolean;
}

export interface ChatInputResult {
  input: ChatTurnInput;
  persist: boolean;
}

export type ScenarioLoopRunState = 'idle' | 'running' | 'errored';
