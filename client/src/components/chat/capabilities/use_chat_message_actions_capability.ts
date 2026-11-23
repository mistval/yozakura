import { useCallback } from 'react';
import { ChatCoordinator } from '../../../engine/chat/chat_coordinator.js';
import type { ChatMessageWrapper } from '../../../engine/chat/transcript.js';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store.js';
import type { ChatViewProps } from '../ChatView.js';

export function useChatMessageActionsCapability({
  userCharacterId,
  userCanInputChat,
  isFinalizingChat,
}: {
  userCharacterId: string;
  userCanInputChat: boolean;
  isFinalizingChat: boolean;
}): {
  paneProps: Pick<
    ChatViewProps,
    | 'messageActionsEnabled'
    | 'canLongPressMessage'
    | 'onDeleteMessage'
    | 'onEditMessage'
    | 'onRetryMessage'
    | 'canShowRetryMessage'
    | 'retryMessageDisabled'
  >;
} {
  const submitChatRedoMessage = useScenarioLoopStateStore((state) => state.submitChatRedoMessage);

  const onDeleteMessage = useCallback((messageId: string) => {
    ChatCoordinator.deleteMessageById(messageId);
  }, []);

  const onEditMessage = useCallback((messageId: string, newContent: string) => {
    ChatCoordinator.editMessageById(messageId, newContent);
  }, []);

  const canShowRetryMessage = useCallback(
    (message: ChatMessageWrapper) =>
      message.isCharacterChatMessage() && message.asCharacterChatMessage().senderId !== userCharacterId,
    [userCharacterId]
  );

  return {
    paneProps: {
      messageActionsEnabled: !isFinalizingChat,
      canLongPressMessage: userCanInputChat,
      onDeleteMessage,
      onEditMessage,
      onRetryMessage: submitChatRedoMessage,
      canShowRetryMessage,
      retryMessageDisabled: !userCanInputChat,
    },
  };
}
