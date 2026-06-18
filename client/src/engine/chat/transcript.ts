import {
  chatMessageSchema,
  type CharacterMessage,
  type ChatMessage,
  type ImageMessage,
  type JoinLeaveSystemMessage,
  type MemoryCharacterRagMessage,
  type OpenAIChatCompletionRequestMessage,
  type SerializedConversationTranscript,
  type TranscriptParticipant,
} from '../types';
import { assert, assertNonNullish } from '../../errors/application_error';
import * as Database from '../../backend_bridge/database';

class ChatMessageWrapper {
  constructor(
    public readonly message: ChatMessage,
    public readonly associatedCharacter: TranscriptParticipant | undefined
  ) {
    if (message.messageType === 'chat_message' && !associatedCharacter) {
      throw new Error('ChatMessageAccessWrapper requires a speaker for chat_message types');
    }
  }

  getId() {
    return this.message.id;
  }

  isVisibleInPerspectiveContext(characterId: string, isForAIConsumption: boolean) {
    if (
      this.message.messageType === 'system_message' &&
      this.message.isPrivateToCharacterId &&
      this.message.isPrivateToCharacterId !== characterId
    ) {
      return false;
    }

    if (isForAIConsumption && this.message.messageType === 'image') {
      return false;
    }

    return true;
  }

  isCharacterChatMessage() {
    return this.message.messageType === 'chat_message';
  }

  asCharacterChatMessage() {
    assert(this.message.messageType === 'chat_message', 'Message is not a character chat message');
    return this.message;
  }

  isImageMessage() {
    return this.message.messageType === 'image';
  }

  imageUrl() {
    if (this.message.messageType !== 'image') {
      throw new Error('Cannot get imageUrl of a non-image message');
    }

    return this.message.imageUrl;
  }

  isSystemMessage() {
    return this.message.messageType === 'system_message';
  }

  isSentByCharacter(characterId: string) {
    if (this.message.messageType !== 'chat_message') {
      return false;
    }

    return this.message.senderId === characterId;
  }

  isJoinMessageForCharacter(characterId: string) {
    return (
      this.message.messageType === 'system_message' &&
      this.message.systemMessageType === 'join' &&
      this.message.characterId === characterId
    );
  }

  isLeaveMessageForCharacter(characterId: string) {
    return (
      this.message.messageType === 'system_message' &&
      this.message.systemMessageType === 'leave' &&
      this.message.characterId === characterId
    );
  }

  isJoinOrLeaveMessageForCharacter(characterId: string) {
    return this.isJoinMessageForCharacter(characterId) || this.isLeaveMessageForCharacter(characterId);
  }

  isOffscreenMemoryRagMessageMentioningCharacter(mentionedCharacterId: string) {
    return (
      this.message.messageType === 'system_message' &&
      this.message.systemMessageType === 'memory_character_rag' &&
      this.message.mentionedCharacterId === mentionedCharacterId
    );
  }

  getSpeakerName() {
    if (this.message.messageType === 'image') {
      return 'Image';
    } else if (this.message.messageType === 'system_message') {
      return 'System';
    } else if (this.message.messageType === 'chat_message') {
      const speakerFirstName = this.associatedCharacter?.firstName;
      assertNonNullish(speakerFirstName, 'Speaker first name should be available for chat_message types');
      return speakerFirstName;
    }

    throw new Error(`Unknown message type: ${(this.message as any).messageType}`);
  }

  getContent() {
    if (this.message.messageType === 'image') {
      return this.message.imageUrl;
    } else if (this.message.messageType === 'system_message') {
      if (this.message.systemMessageType === 'join') {
        assertNonNullish(
          this.associatedCharacter,
          'Associated character should be defined for join system messages'
        );
        return `${this.associatedCharacter.firstName} has joined the chat.`;
      } else if (this.message.systemMessageType === 'leave') {
        assertNonNullish(
          this.associatedCharacter,
          'Associated character should be defined for leave system messages'
        );
        return `${this.associatedCharacter?.firstName} has left the chat.`;
      } else if (this.message.systemMessageType === 'memory_character_rag') {
        return `${this.message.message}`;
      }
    } else if (this.message.messageType === 'chat_message') {
      const speakerFirstName = this.associatedCharacter?.firstName;
      assertNonNullish(speakerFirstName, 'Speaker first name should be available for chat_message types');
      return `${this.message.message}`;
    }

    throw new Error(`Unknown message type: ${(this.message as any).messageType}`);
  }

  messageWithSpeakerName() {
    return `${this.getSpeakerName()}: ${this.getContent()}`;
  }

  getPromptRole(fromAICharacterIdPerspective: string) {
    if (this.message.messageType === 'image') {
      return undefined; // Exclude from prompts
    } else if (this.message.messageType === 'system_message') {
      return 'system';
    } else if (this.message.messageType === 'chat_message') {
      return this.message.senderId === fromAICharacterIdPerspective ? 'assistant' : 'user';
    }

    throw new Error(
      `Unknown message type: ${(this.message as any).messageType}. Need to decide whether this message type should be included in chat prompts.`
    );
  }

  isOffscreenMemoryRagMessage(): false | string {
    return this.message.messageType === 'system_message' &&
      this.message.systemMessageType === 'memory_character_rag'
      ? this.message.mentionedCharacterId
      : false;
  }
}

export class ConversationTranscript {
  private constructor(
    public readonly messages: ChatMessageWrapper[],
    public readonly participants: TranscriptParticipant[]
  ) {}

  public serialize(): SerializedConversationTranscript {
    return Database.createPersistedObject({
      rawMessages: this.getRawMessages().map((m) => chatMessageSchema.parse(m)),
      participants: this.participants,
    });
  }

  public static new() {
    return new ConversationTranscript([], []);
  }

  public static deserialize(data: SerializedConversationTranscript) {
    const { rawMessages, participants } = data;

    const messages = rawMessages.map((message) => {
      const associatedCharacter =
        message.messageType === 'chat_message'
          ? participants.find((p) => p.id === message.senderId)
          : message.messageType === 'system_message' &&
              (message.systemMessageType === 'join' || message.systemMessageType === 'leave')
            ? participants.find((p) => p.id === message.characterId)
            : undefined;

      return new ChatMessageWrapper(message, associatedCharacter);
    });

    return new ConversationTranscript(messages, participants);
  }

  containsMessage(messageId: string) {
    return this.messages.some((message) => message.message.id === messageId);
  }

  /* Mutators */

  public addParticipantUnique(participant: TranscriptParticipant | undefined) {
    if (!participant || this.participants.some((p) => p.id === participant.id)) {
      return this.participants;
    }

    return this.participants.concat(participant);
  }

  public deleteMessageById(messageId: string): {
    updatedTranscript: ConversationTranscript;
    deletedMessage: ChatMessageWrapper | undefined;
  } {
    const messageToDelete = this.messages.find((message) => message.message.id === messageId);
    if (!messageToDelete) {
      return {
        updatedTranscript: this,
        deletedMessage: undefined,
      };
    }

    const newMessages = this.messages.filter((message) => message !== messageToDelete);

    return {
      updatedTranscript: new ConversationTranscript(newMessages, this.participants),
      deletedMessage: messageToDelete,
    };
  }

  public deleteMessagesAboveAndIncluding(messageId: string) {
    const indexOfMessage = this.messages.findIndex((message) => message.message.id === messageId);
    if (indexOfMessage === -1) {
      throw new Error(`Message with ID ${messageId} not found in transcript`);
    }

    return new ConversationTranscript(this.messages.slice(0, indexOfMessage), this.participants);
  }

  public addJoinMessage(joiner: TranscriptParticipant) {
    const newRawMessage = Database.createPersistedObject({
      messageType: 'system_message',
      systemMessageType: 'join',
      characterId: joiner.id,
    }) satisfies JoinLeaveSystemMessage;

    return {
      ...this.addMessage(newRawMessage, joiner),
      newRawMessage,
    };
  }

  public addImageMessage(imageUrl: string) {
    const newRawMessage = Database.createPersistedObject({
      messageType: 'image',
      imageUrl,
    }) satisfies ImageMessage;

    return {
      ...this.addMessage(newRawMessage, undefined),
      newRawMessage,
    };
  }

  public addCharacterChatMessage(message: string, speaker: TranscriptParticipant) {
    const newRawMessage = Database.createPersistedObject({
      messageType: 'chat_message',
      senderId: speaker.id,
      message,
    }) satisfies CharacterMessage;

    return {
      ...this.addMessage(newRawMessage, speaker),
      newRawMessage,
    };
  }

  public addOffscreenRagMessage(
    fromCharacterId: string,
    message: string,
    mentionedCharacter: TranscriptParticipant
  ) {
    const newRawMessage = Database.createPersistedObject({
      messageType: 'system_message',
      systemMessageType: 'memory_character_rag',
      message,
      mentionedCharacterId: mentionedCharacter.id,
      isPrivateToCharacterId: fromCharacterId,
    }) satisfies MemoryCharacterRagMessage;

    return {
      ...this.addMessage(newRawMessage, undefined),
      newRawMessage,
    };
  }

  public updateMessagesForParticipantJoining(joiner: TranscriptParticipant): {
    updatedTranscript: ConversationTranscript;
  } {
    let updatedTranscript = this.removeOffscreenRagMessagesForCharacter(joiner.id);
    const hasMessages = this.hasCharacterMessages();

    if (hasMessages) {
      updatedTranscript = updatedTranscript.addJoinMessage(joiner).updatedTranscript;
    }

    return {
      updatedTranscript,
    };
  }

  public editMessageById(messageId: string, newContent: string) {
    const messageToEdit = this.messages.find((message) => message.message.id === messageId);
    if (!messageToEdit) {
      throw new Error(`Message with ID ${messageId} not found in transcript`);
    }

    if (messageToEdit.message.messageType !== 'chat_message') {
      throw new Error('Can only edit chat_message types');
    }

    const newMessage = new ChatMessageWrapper(
      {
        ...messageToEdit.asCharacterChatMessage(),
        messageType: 'chat_message',
        message: newContent,
      },
      messageToEdit.associatedCharacter
    );

    return {
      updatedTranscript: new ConversationTranscript(
        this.messages.map((message) => (message === messageToEdit ? newMessage : message)),
        this.participants
      ),
      oldMessage: messageToEdit,
      newMessage,
    };
  }

  public editLatestMessage(newContent: string) {
    const latestMessage = this.messages[this.messages.length - 1];
    if (!latestMessage) {
      throw new Error('Can only edit the latest message if it is a character chat message');
    }

    return this.editMessageById(latestMessage.message.id, newContent);
  }

  public updateMessagesForParticipantLeaving(characterId: string) {
    const messageByCharacter = this.messages.find((m) => m.isSentByCharacter(characterId));

    if (messageByCharacter) {
      // If character has sent a message, add a "left the chat" message for them

      return {
        updatedTranscript: new ConversationTranscript(
          this.messages.concat(
            new ChatMessageWrapper(
              Database.createPersistedObject({
                messageType: 'system_message',
                systemMessageType: 'leave',
                characterId,
              }),
              messageByCharacter.associatedCharacter
            )
          ),
          this.participants
        ),
        didPurge: false,
      };
    } else {
      // If the character hasn't sent any messages, remove their join message so it's like they never participated in the chat at all

      return {
        updatedTranscript: new ConversationTranscript(
          this.messages.filter((m) => !m.isJoinOrLeaveMessageForCharacter(characterId)),
          this.participants.filter((p) => p.id !== characterId)
        ),
        didPurge: true,
      };
    }
  }

  private addMessage(message: ChatMessage, character: TranscriptParticipant | undefined) {
    const newMessage = new ChatMessageWrapper(message, character);
    return {
      updatedTranscript: new ConversationTranscript(
        this.messages.concat(newMessage),
        this.addParticipantUnique(character)
      ),
      newMessage,
    };
  }

  public removeOffscreenRagMessagesForCharacter(characterId: string) {
    return new ConversationTranscript(
      this.messages.filter((message) => !message.isOffscreenMemoryRagMessageMentioningCharacter(characterId)),
      this.participants
    );
  }

  /* Accessors */

  public getMessageById(messageId: string) {
    return this.messages.find((message) => message.message.id === messageId);
  }

  public getRawMessages() {
    return this.messages.map((wrapper) => wrapper.message);
  }

  public getMostRecentMessage() {
    return this.messages[this.messages.length - 1];
  }

  public getMostRecentSpeakerId() {
    const lastChatMessage = this.messages.findLast((message) => message.isCharacterChatMessage());
    if (lastChatMessage) {
      return lastChatMessage.asCharacterChatMessage().senderId;
    }
  }

  public hasCharacterMessages() {
    return this.messages.some((message) => message.isCharacterChatMessage());
  }

  public hasMessagesFromCharacter(characterId: string) {
    return this.messages.some((message) => message.isSentByCharacter(characterId));
  }

  public countMessagesSinceLastMessageFromCharacter(characterId: string) {
    return (
      this.messages.length -
      1 -
      this.messages.findLastIndex((message) => message.isSentByCharacter(characterId))
    );
  }

  public getRecentlyQuietSpeakerId(fromIds: string[]) {
    const idsSet = new Set(fromIds);

    let messageIdx = this.messages.length - 1;
    while (idsSet.size > 1 && messageIdx >= 0) {
      const message = this.messages[messageIdx];
      if (message?.message.messageType === 'chat_message') {
        idsSet.delete(message.message.senderId);
      }

      messageIdx -= 1;
    }

    return [...idsSet][0];
  }

  public aggregateMessagesWithinPresenceWindows(characterId: string) {
    const partialPresence = this.messages.some((message) =>
      message.isJoinOrLeaveMessageForCharacter(characterId)
    );

    if (!partialPresence) {
      return this.messages;
    }

    const firstPresenceMessage = this.messages.find((message) =>
      message.isJoinOrLeaveMessageForCharacter(characterId)
    );

    if (!firstPresenceMessage || firstPresenceMessage?.message.messageType !== 'system_message') {
      throw new Error('Expected first presence message to be a system message');
    }

    let isPresent = firstPresenceMessage.message.systemMessageType === 'leave';

    return this.messages.filter((message, i, messages) => {
      const nextMessage = messages[i + 1];

      // We include one message before the join message, as it's often the case that the character joins in response to something being said, and having that context can be helpful for understanding the conversation.
      if (nextMessage?.isJoinMessageForCharacter(characterId)) {
        isPresent = true;
        return true;
      }

      if (message.isLeaveMessageForCharacter(characterId)) {
        isPresent = false;
        return true;
      }

      return isPresent;
    });
  }

  public toAIPromptMessages(fromAICharacterIdPerspective: string): OpenAIChatCompletionRequestMessage[] {
    return this.aggregateMessagesWithinPresenceWindows(fromAICharacterIdPerspective).flatMap((message) => {
      if (!message.isVisibleInPerspectiveContext(fromAICharacterIdPerspective, true)) {
        return [];
      }

      const role = message.getPromptRole(fromAICharacterIdPerspective);
      assertNonNullish(role, 'Prompt role should be defined for messages that are visible to the character');

      const shouldAddSpeakerName =
        message.message.messageType === 'chat_message' &&
        this.participants.length > 2 &&
        message.message.senderId !== fromAICharacterIdPerspective;

      return {
        role,
        content: shouldAddSpeakerName ? message.messageWithSpeakerName() : message.getContent(),
      };
    });
  }

  public hasMemoryRaggedCharacter(mentionedCharacterId: string) {
    return this.messages.some((message) =>
      message.isOffscreenMemoryRagMessageMentioningCharacter(mentionedCharacterId)
    );
  }

  public countCharacterChatMessages() {
    return this.messages.filter((message) => message.isCharacterChatMessage()).length;
  }

  public countAllMessages() {
    return this.messages.length;
  }

  public getVisibleMessages(fromCharacterIdPerspective: string) {
    return this.messages.filter((message) =>
      message.isVisibleInPerspectiveContext(fromCharacterIdPerspective, false)
    );
  }

  public toTextTranscript(fromCharacterIdPerspective?: string) {
    if (this.messages.length === 0) {
      return '(no messages yet)';
    }

    return (
      fromCharacterIdPerspective
        ? this.aggregateMessagesWithinPresenceWindows(fromCharacterIdPerspective)
        : this.messages
    )
      .flatMap((m) => {
        if (m.message.messageType === 'chat_message') {
          return m.messageWithSpeakerName().replace(/\n+/g, ' ');
        }

        if (m.message.messageType === 'image') {
          return [];
        }

        if (m.message.systemMessageType === 'join' || m.message.systemMessageType === 'leave') {
          return m.messageWithSpeakerName();
        }

        if (m.message.systemMessageType === 'memory_character_rag') {
          return [];
        }

        throw new Error(
          `Unknown message type: ${(m as any).messageType}. Need to decide whether this message type should be included in post-processing chat transcripts.`
        );
      })
      .join('\n');
  }

  public getAllMentionedOffscreenRaggedCharacterIds() {
    const mentionedCharacterIds = new Set<string>();

    this.messages.forEach((message) => {
      const characterId = message.isOffscreenMemoryRagMessage();
      if (characterId) {
        mentionedCharacterIds.add(characterId);
      }
    });

    return [...mentionedCharacterIds];
  }

  public getAllSpeakerIds() {
    const speakerIds = new Set<string>();

    this.messages.forEach((message) => {
      if (message.message.messageType === 'chat_message') {
        speakerIds.add(message.message.senderId);
      }
    });

    return [...speakerIds];
  }
}
