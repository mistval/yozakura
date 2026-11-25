import type { ConversationTranscript } from '../../engine/chat/transcript.js';
import type { ChatViewMessage } from './ChatView.js';

export function transcriptToChatViewMessages(
  transcript: ConversationTranscript,
  perspectiveCharacterId: string
): ChatViewMessage[] {
  return transcript.getVisibleMessages(perspectiveCharacterId).map((entry) => {
    const isCharacterMessage = entry.isCharacterChatMessage();
    const isImageMessage = entry.isImageMessage();

    return {
      id: entry.getId(),
      speakerName: entry.getSpeakerName(),
      content: entry.getContent(),
      isCharacterMessage,
      senderId: isCharacterMessage ? entry.asCharacterChatMessage().senderId : undefined,
      isImageMessage,
      imageUrl: isImageMessage ? entry.imageUrl() : undefined,
    };
  });
}
