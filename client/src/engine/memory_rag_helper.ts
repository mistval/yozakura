import type { Character, RagMessage, SerializedRagHelper } from './types';
import { buildCharacterNameIndex, matchStringToIndex } from './tokenization';

export type RagMessageDelegate = (
  focusedCharacterId: string,
  mentionedCharacterId: string,
  mentionedByCharacterId: string
) => Promise<string>;

export type RagReminder = {
  mentionedCharacterId: string;
  content: () => Promise<string>;
};

/**
 * Tracks which characters are mentioned in each chat message and caches the rendered
 * reminder ("memory RAG message") for each (perspective, mentioned, sender) 3-tuple.
 */
export class MemoryRAGHelper {
  private readonly messageMentions: Map<string, { senderId: string; mentionedCharacterIds: string[] }>;
  private readonly ragCache: Map<string, RagMessage>;

  constructor(
    private readonly getRagMessage: RagMessageDelegate,
    private readonly getAllScenarioCharacters: () => Character[],
    serializedState?: SerializedRagHelper
  ) {
    this.messageMentions = new Map(serializedState?.messageMentions ?? []);
    this.ragCache = new Map(serializedState?.ragCache ?? []);
  }

  public addMessage(messageId: string, text: string, senderId: string): void {
    this.recordMentions(messageId, text, senderId);
  }

  public editMessage(messageId: string, newText: string, senderId: string): void {
    this.recordMentions(messageId, newText, senderId);
  }

  public deleteMessage(messageId: string): void {
    this.messageMentions.delete(messageId);
  }

  public getMentionedCharacterIds(messageId: string): string[] {
    return this.messageMentions.get(messageId)?.mentionedCharacterIds ?? [];
  }

  public getRAGMessagesForMessage(messageId: string, fromPerspectiveId: string): RagReminder[] {
    const entry = this.messageMentions.get(messageId);
    if (!entry) {
      return [];
    }

    return entry.mentionedCharacterIds
      .filter((id) => id !== fromPerspectiveId)
      .map((mentionedCharacterId) => ({
        mentionedCharacterId,
        content: () => this.getRagContent(fromPerspectiveId, mentionedCharacterId, entry.senderId),
      }));
  }

  public serialize(): SerializedRagHelper {
    return {
      messageMentions: [...this.messageMentions],
      ragCache: [...this.ragCache],
    };
  }

  private recordMentions(messageId: string, text: string, senderId: string): void {
    const mentionedCharacterIds = this.matchMentions(text);
    this.messageMentions.set(messageId, { senderId, mentionedCharacterIds });
  }

  private matchMentions(text: string): string[] {
    const mentionIndex = buildCharacterNameIndex(this.getAllScenarioCharacters());
    return matchStringToIndex(text, mentionIndex);
  }

  private async getRagContent(
    perspectiveId: string,
    mentionedCharacterId: string,
    senderId: string
  ): Promise<string> {
    const key = this.cacheKey(perspectiveId, mentionedCharacterId, senderId);

    const cached = this.ragCache.get(key);
    if (cached) {
      return cached.content;
    }

    const content = await this.getRagMessage(perspectiveId, mentionedCharacterId, senderId);
    this.ragCache.set(key, { mentionedCharacterId, content });
    return content;
  }

  private cacheKey(perspectiveId: string, mentionedCharacterId: string, senderId: string): string {
    return `${perspectiveId}:${mentionedCharacterId}:${senderId}`;
  }
}
