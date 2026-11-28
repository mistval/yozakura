import { useCallback } from 'react';
import { ChatCoordinator } from '../../../engine/chat/chat_coordinator.js';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store.js';

export function useChatMessageActionsCapability({
  userCharacterId,
  userCanInputChat,
  isFinalizingChat,
}: {
  userCharacterId: string;
  userCanInputChat: boolean;
  isFinalizingChat: boolean;
}): {
  deleteMessage: (messageId: string) => void;
  editMessage: (messageId: string, newContent: string) => void;
  retryMessage: (messageId: string) => void;
  canModifyMessages: boolean;
  canLongPressMessage: boolean;
  retryDisabled: boolean;
  canRetrySender: (senderId: string) => boolean;
} {
  const submitChatRedoMessage = useScenarioLoopStateStore((state) => state.submitChatRedoMessage);

  const deleteMessage = useCallback((messageId: string) => {
    ChatCoordinator.deleteMessageById(messageId);
  }, []);

  const editMessage = useCallback((messageId: string, newContent: string) => {
    ChatCoordinator.editMessageById(messageId, newContent);
  }, []);

  const canRetrySender = useCallback((senderId: string) => senderId !== userCharacterId, [userCharacterId]);

  return {
    deleteMessage,
    editMessage,
    retryMessage: submitChatRedoMessage,
    canModifyMessages: !isFinalizingChat,
    canLongPressMessage: userCanInputChat,
    retryDisabled: !userCanInputChat,
    canRetrySender,
  };
}
