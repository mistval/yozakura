import type { ChatMessageWrapper, ConversationTranscript } from '../../engine/chat/transcript.js';
import type { ChatViewMessage, ChatViewMessageAvatar } from './ChatView.js';

export type TranscriptChatMessagesOptions = {
  resolveAvatarImagePath?: ((senderId: string) => string | undefined) | undefined;
  buildAvatar?:
    | ((params: {
        senderId: string;
        speakerName: string;
        imageUrl: string | undefined;
      }) => ChatViewMessageAvatar)
    | undefined;
  buildMessageCapabilities?:
    ((entry: ChatMessageWrapper) => Pick<ChatViewMessage, 'onDelete' | 'edit' | 'actions'>) | undefined;
};

export function transcriptToChatViewMessages(
  transcript: ConversationTranscript,
  perspectiveCharacterId: string,
  options?: TranscriptChatMessagesOptions
): ChatViewMessage[] {
  return transcript.getVisibleMessages(perspectiveCharacterId).map((entry) => {
    const capabilities = options?.buildMessageCapabilities?.(entry);

    if (entry.isImageMessage()) {
      return {
        id: entry.getId(),
        parts: [{ type: 'image', url: entry.imageUrl(), alt: 'Generated' }],
        onDelete: capabilities?.onDelete,
        edit: capabilities?.edit,
        actions: capabilities?.actions,
      };
    }

    const speakerName = entry.getSpeakerName();
    let avatar: ChatViewMessageAvatar | undefined;
    if (entry.isCharacterChatMessage()) {
      const senderId = entry.asCharacterChatMessage().senderId;
      const imageUrl = options?.resolveAvatarImagePath?.(senderId);
      avatar = options?.buildAvatar ? options.buildAvatar({ senderId, speakerName, imageUrl }) : { imageUrl };
    }

    return {
      id: entry.getId(),
      speakerName,
      avatar,
      parts: [{ type: 'markdown', text: entry.getContent() }],
      onDelete: capabilities?.onDelete,
      edit: capabilities?.edit,
      actions: capabilities?.actions,
    };
  });
}
