import type { Character, RagMessage, SerializedRagHelper } from './types';
import { buildCharacterNameIndex, matchStringToIndex } from './tokenization';

export type RagMessageDelegate = (
  focusedCharacterId: string,
  mentionedCharacterId: string,
  mentionedByCharacterId: string
) => Promise<string>;

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
    private readonly getReminderPerspectiveIds: () => string[],
    serializedState?: SerializedRagHelper
  ) {
    this.messageMentions = new Map(serializedState?.messageMentions ?? []);
    this.ragCache = new Map(serializedState?.ragCache ?? []);
  }

  public async addMessage(messageId: string, text: string, senderId: string): Promise<void> {
    await this.recordMentions(messageId, text, senderId);
  }

  public async editMessage(messageId: string, newText: string, senderId: string): Promise<void> {
    await this.recordMentions(messageId, newText, senderId);
  }

  public deleteMessage(messageId: string): void {
    this.messageMentions.delete(messageId);
  }

  public getMentionedCharacterIds(messageId: string): string[] {
    return this.messageMentions.get(messageId)?.mentionedCharacterIds ?? [];
  }

  public getRAGMessagesForMessage(messageId: string, fromPerspectiveId: string): RagMessage[] {
    const entry = this.messageMentions.get(messageId);
    if (!entry) {
      return [];
    }

    const messages: RagMessage[] = [];
    for (const mentionedCharacterId of entry.mentionedCharacterIds) {
      const cached = this.ragCache.get(
        this.cacheKey(fromPerspectiveId, mentionedCharacterId, entry.senderId)
      );

      if (cached) {
        messages.push(cached);
      }
    }

    return messages;
  }

  public serialize(): SerializedRagHelper {
    return {
      messageMentions: [...this.messageMentions],
      ragCache: [...this.ragCache],
    };
  }

  private async recordMentions(messageId: string, text: string, senderId: string): Promise<void> {
    const mentionedCharacterIds = this.matchMentions(text);
    this.messageMentions.set(messageId, { senderId, mentionedCharacterIds });
    await this.ensureRemindersCached(mentionedCharacterIds, senderId);
  }

  private matchMentions(text: string): string[] {
    const mentionIndex = buildCharacterNameIndex(this.getAllScenarioCharacters());
    return matchStringToIndex(text, mentionIndex);
  }

  private async ensureRemindersCached(mentionedCharacterIds: string[], senderId: string): Promise<void> {
    const perspectiveIds = this.getReminderPerspectiveIds();

    for (const mentionedCharacterId of mentionedCharacterIds) {
      for (const perspectiveId of perspectiveIds) {
        if (perspectiveId === mentionedCharacterId) {
          continue;
        }

        const key = this.cacheKey(perspectiveId, mentionedCharacterId, senderId);
        if (this.ragCache.has(key)) {
          continue;
        }

        const content = await this.getRagMessage(perspectiveId, mentionedCharacterId, senderId);
        this.ragCache.set(key, { mentionedCharacterId, content });
      }
    }
  }

  private cacheKey(perspectiveId: string, mentionedCharacterId: string, senderId: string): string {
    return `${perspectiveId}:${mentionedCharacterId}:${senderId}`;
  }
}
