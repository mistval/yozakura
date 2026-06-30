import {
  chatMessageSchema,
  TRANSCRIPT_SYSTEM,
  type Character,
  type CharacterMessage,
  type ChatMessage,
  type ImageMessage,
  type JoinLeaveSystemMessage,
  type OpenAIChatCompletionRequestMessage,
  type SerializedConversationTranscript,
  type SerializedRagHelper,
  type TranscriptParticipant,
} from '../types';
import { assert, assertNonNullish } from '../../errors/application_error';
import * as Database from '../../backend_bridge/database';
import { MemoryRAGHelper, type RagMessageDelegate } from '../memory_rag_helper';

export type TranscriptRagDeps = {
  getRagMessage: RagMessageDelegate;
  getAllScenarioCharacters: () => Character[];
  getOffscreenMentionLimit: () => number;
  getCurrentParticipantIds: () => string[];
};

const DEFAULT_OFFSCREEN_MENTION_LIMIT = 2;

function buildRagHelper(ragDeps?: TranscriptRagDeps, serializedState?: SerializedRagHelper) {
  return new MemoryRAGHelper(
    ragDeps?.getRagMessage ?? (async () => ''),
    ragDeps?.getAllScenarioCharacters ?? (() => []),
    serializedState
  );
}

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

  isPresenceMarker() {
    return (
      this.message.messageType === 'system_message' &&
      this.message.isPrivateToCharacterId === TRANSCRIPT_SYSTEM
    );
  }

  isJoinMessageForCharacter(characterId: string) {
    return (
      this.message.messageType === 'system_message' &&
      this.message.systemMessageType === 'join' &&
      this.message.isPrivateToCharacterId === TRANSCRIPT_SYSTEM &&
      this.message.characterId === characterId
    );
  }

  isLeaveMessageForCharacter(characterId: string) {
    return (
      this.message.messageType === 'system_message' &&
      this.message.systemMessageType === 'leave' &&
      this.message.isPrivateToCharacterId === TRANSCRIPT_SYSTEM &&
      this.message.characterId === characterId
    );
  }

  isJoinOrLeaveMessageForCharacter(characterId: string) {
    return this.isJoinMessageForCharacter(characterId) || this.isLeaveMessageForCharacter(characterId);
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
}

export class ConversationTranscript {
  private constructor(
    public readonly messages: ChatMessageWrapper[],
    public readonly participantInfo: TranscriptParticipant[],
    private readonly ragHelper: MemoryRAGHelper,
    private readonly getOffscreenMentionLimit: () => number,
    private readonly getCurrentParticipantIds: (() => string[]) | undefined
  ) {}

  public serialize(): SerializedConversationTranscript {
    return Database.createPersistedObject({
      rawMessages: this.getRawMessages().map((m) => chatMessageSchema.parse(m)),
      participants: this.participantInfo,
      ragHelperState: this.ragHelper.serialize(),
    });
  }

  public static new(ragDeps?: TranscriptRagDeps) {
    return new ConversationTranscript(
      [],
      [],
      buildRagHelper(ragDeps),
      ragDeps?.getOffscreenMentionLimit ?? (() => DEFAULT_OFFSCREEN_MENTION_LIMIT),
      ragDeps?.getCurrentParticipantIds
    );
  }

  public static deserialize(data: SerializedConversationTranscript, ragDeps?: TranscriptRagDeps) {
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

    return new ConversationTranscript(
      messages,
      participants,
      buildRagHelper(ragDeps, data.ragHelperState),
      ragDeps?.getOffscreenMentionLimit ?? (() => DEFAULT_OFFSCREEN_MENTION_LIMIT),
      ragDeps?.getCurrentParticipantIds
    );
  }

  private rebuild(
    messages: ChatMessageWrapper[],
    participants: TranscriptParticipant[] = this.participantInfo
  ) {
    return new ConversationTranscript(
      messages,
      participants,
      this.ragHelper,
      this.getOffscreenMentionLimit,
      this.getCurrentParticipantIds
    );
  }

  containsMessage(messageId: string) {
    return this.messages.some((message) => message.message.id === messageId);
  }

  /* Mutators */

  public addParticipantUnique(participant: TranscriptParticipant) {
    if (!participant || this.participantInfo.some((p) => p.id === participant.id)) {
      return this.participantInfo;
    }

    return this.participantInfo.concat(participant);
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

    assert(!messageToDelete.isPresenceMarker(), 'Cannot delete a transcript presence marker');

    this.ragHelper.deleteMessage(messageId);

    return {
      updatedTranscript: this.rebuild(this.messages.filter((message) => message !== messageToDelete)),
      deletedMessage: messageToDelete,
    };
  }

  public deleteMessagesAboveAndIncluding(messageId: string) {
    const indexOfMessage = this.messages.findIndex((message) => message.message.id === messageId);
    const message = this.messages[indexOfMessage];
    assertNonNullish(message, `Message with ID ${messageId} not found in transcript`);

    for (const removed of this.messages.slice(indexOfMessage)) {
      this.ragHelper.deleteMessage(removed.message.id);
    }

    return {
      newTranscript: this.rebuild(this.messages.slice(0, indexOfMessage)),
      deletedMessage: message,
    };
  }

  private addJoinMessage(joiner: TranscriptParticipant) {
    const marker = Database.createPersistedObject({
      messageType: 'system_message',
      systemMessageType: 'join',
      characterId: joiner.id,
      isPrivateToCharacterId: TRANSCRIPT_SYSTEM,
    }) satisfies JoinLeaveSystemMessage;

    const newRawMessage = Database.createPersistedObject({
      messageType: 'system_message',
      systemMessageType: 'join',
      characterId: joiner.id,
    }) satisfies JoinLeaveSystemMessage;

    const withMarker = this.addMessage(marker, joiner).updatedTranscript;

    return {
      ...withMarker.addMessage(newRawMessage, joiner),
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

  public addCharacterChatMessage(
    message: string,
    speaker: TranscriptParticipant,
    opts?: { isStreaming?: boolean }
  ) {
    const newRawMessage = Database.createPersistedObject({
      messageType: 'chat_message',
      senderId: speaker.id,
      message,
    }) satisfies CharacterMessage;

    // Defer RAG processing until message is finished. Optimization.
    if (!opts?.isStreaming) {
      this.ragHelper.addMessage(newRawMessage.id, message, speaker.id);
    }

    return {
      ...this.addMessage(newRawMessage, speaker),
      newRawMessage,
    };
  }

  public addParticipant(joiner: TranscriptParticipant): {
    updatedTranscript: ConversationTranscript;
  } {
    if (!this.hasCharacterMessages()) {
      return { updatedTranscript: this };
    }

    return { updatedTranscript: this.addJoinMessage(joiner).updatedTranscript };
  }

  public editMessageById(messageId: string, newContent: string, opts?: { isStreaming?: boolean }) {
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

    // Defer RAG processing until finished streaming
    if (!opts?.isStreaming && newMessage.isCharacterChatMessage()) {
      this.ragHelper.editMessage(
        newMessage.getId(),
        newContent,
        newMessage.asCharacterChatMessage().senderId
      );
    }

    return {
      updatedTranscript: this.rebuild(
        this.messages.map((message) => (message === messageToEdit ? newMessage : message))
      ),
      oldMessage: messageToEdit,
      newMessage,
    };
  }

  public editLatestMessage(newContent: string, opts?: { isStreaming?: true }) {
    const latestMessage = this.messages[this.messages.length - 1];
    if (!latestMessage) {
      throw new Error('Can only edit the latest message if it is a character chat message');
    }

    return this.editMessageById(latestMessage.message.id, newContent, opts);
  }

  public removeParticipant(participant: TranscriptParticipant) {
    const leaveMessage = new ChatMessageWrapper(
      Database.createPersistedObject({
        messageType: 'system_message',
        systemMessageType: 'leave',
        characterId: participant.id,
      }) satisfies JoinLeaveSystemMessage,
      participant
    );

    const marker = new ChatMessageWrapper(
      Database.createPersistedObject({
        messageType: 'system_message',
        systemMessageType: 'leave',
        characterId: participant.id,
        isPrivateToCharacterId: TRANSCRIPT_SYSTEM,
      }) satisfies JoinLeaveSystemMessage,
      participant
    );

    return {
      updatedTranscript: this.rebuild(
        this.messages.concat(leaveMessage, marker),
        this.addParticipantUnique(participant)
      ),
    };
  }

  private addMessage(message: ChatMessage, character: TranscriptParticipant | undefined) {
    const newMessage = new ChatMessageWrapper(message, character);
    return {
      updatedTranscript: this.rebuild(
        this.messages.concat(newMessage),
        character ? this.addParticipantUnique(character) : this.participantInfo
      ),
      newMessage,
    };
  }

  /* Accessors */

  public getMessageById(messageId: string) {
    return this.messages.find((message) => message.message.id === messageId);
  }

  public getRawMessages() {
    return this.messages.map((wrapper) => wrapper.message);
  }

  public getRawConversationMessages() {
    return this.messages.filter((wrapper) => !wrapper.isPresenceMarker()).map((wrapper) => wrapper.message);
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

  private isCurrentlyPresent(characterId: string): boolean {
    if (this.getCurrentParticipantIds) {
      return this.getCurrentParticipantIds().includes(characterId);
    }

    if (!this.participantInfo.some((p) => p.id === characterId)) {
      return false;
    }

    const lastPresenceEvent = this.messages.findLast((message) =>
      message.isJoinOrLeaveMessageForCharacter(characterId)
    );

    return lastPresenceEvent ? lastPresenceEvent.isJoinMessageForCharacter(characterId) : true;
  }

  public getCoPresentSpeakerIds(characterId: string): string[] {
    const speakerIds = new Set<string>();

    const firstPresenceEvent = this.messages.find((message) =>
      message.isJoinOrLeaveMessageForCharacter(characterId)
    );
    let present = !firstPresenceEvent || firstPresenceEvent.isLeaveMessageForCharacter(characterId);

    for (const message of this.messages) {
      if (message.isJoinMessageForCharacter(characterId)) {
        present = true;
        continue;
      }
      if (message.isLeaveMessageForCharacter(characterId)) {
        present = false;
        continue;
      }
      if (
        present &&
        message.message.messageType === 'chat_message' &&
        message.message.senderId !== characterId
      ) {
        speakerIds.add(message.message.senderId);
      }
    }

    return [...speakerIds];
  }

  public async toAIPromptMessages(
    fromAICharacterIdPerspective: string
  ): Promise<OpenAIChatCompletionRequestMessage[]> {
    const limit = Math.max(1, Math.round(this.getOffscreenMentionLimit()));
    const injectedMentionedIds = new Set<string>();
    const promptMessages: OpenAIChatCompletionRequestMessage[] = [];

    for (const message of this.aggregateMessagesWithinPresenceWindows(fromAICharacterIdPerspective)) {
      if (!message.isVisibleInPerspectiveContext(fromAICharacterIdPerspective, true)) {
        continue;
      }

      const role = message.getPromptRole(fromAICharacterIdPerspective);
      assertNonNullish(role, 'Prompt role should be defined for messages that are visible to the character');

      const shouldAddSpeakerName =
        message.message.messageType === 'chat_message' &&
        this.participantInfo.length > 2 &&
        message.message.senderId !== fromAICharacterIdPerspective;

      promptMessages.push({
        role,
        content: shouldAddSpeakerName ? message.messageWithSpeakerName() : message.getContent(),
      });

      if (message.message.messageType === 'chat_message') {
        for (const ragMessage of this.ragHelper.getRAGMessagesForMessage(
          message.message.id,
          fromAICharacterIdPerspective
        )) {
          if (injectedMentionedIds.size >= limit) {
            break;
          }
          if (
            injectedMentionedIds.has(ragMessage.mentionedCharacterId) ||
            this.isCurrentlyPresent(ragMessage.mentionedCharacterId)
          ) {
            continue;
          }
          promptMessages.push({ role: 'system', content: await ragMessage.content() });
          injectedMentionedIds.add(ragMessage.mentionedCharacterId);
        }
      }
    }

    return promptMessages;
  }

  public hasMemoryRaggedCharacter(characterId: string): boolean {
    return this.messages.some(
      (message) =>
        message.message.messageType === 'chat_message' &&
        this.ragHelper.getMentionedCharacterIds(message.message.id).includes(characterId)
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
        if (m.isPresenceMarker()) {
          return [];
        }

        if (m.message.messageType === 'chat_message') {
          return m.messageWithSpeakerName().replace(/\n+/g, ' ');
        }

        if (m.message.messageType === 'image') {
          return [];
        }

        if (m.message.systemMessageType === 'join' || m.message.systemMessageType === 'leave') {
          return m.messageWithSpeakerName();
        }

        throw new Error(
          `Unknown message type: ${(m as any).messageType}. Need to decide whether this message type should be included in post-processing chat transcripts.`
        );
      })
      .join('\n');
  }

  public getMentionedOffscreenCharacterIds(focusedCharacterId: string): string[] {
    const limit = Math.max(1, Math.round(this.getOffscreenMentionLimit()));
    const seen = new Set<string>();
    const result: string[] = [];

    for (const message of this.aggregateMessagesWithinPresenceWindows(focusedCharacterId)) {
      if (message.message.messageType !== 'chat_message') {
        continue;
      }

      for (const mentionedCharacterId of this.ragHelper.getMentionedCharacterIds(message.message.id)) {
        if (seen.has(mentionedCharacterId) || this.isCurrentlyPresent(mentionedCharacterId)) {
          continue;
        }

        seen.add(mentionedCharacterId);
        result.push(mentionedCharacterId);

        if (result.length >= limit) {
          return result;
        }
      }
    }

    return result;
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
