import { assertNonNullish } from '../errors/application_error';
import { getActiveChatParticipants, useTurnMachineStore } from '../state/active_chat_store';
import { useScenarioCharacterStore } from '../state/scenario_character_store';
import { useSettingsStore } from '../state/settings_store.js';
import { buildCharacterNameIndex, matchStringToIndex } from './tokenization';

export class MemoryRAGHelper {
  private mentionKeyToCharacterIds: Map<string, string[]> = new Map();
  private readonly messageIdToMentionedCharacterIds: Map<string, string[]> = new Map();
  private readonly unsubscribe: () => void;

  constructor() {
    this.unsubscribe = useTurnMachineStore.subscribe((newState, prevState) => {
      if (prevState.participantIds !== newState.participantIds) {
        this.rebuildMentionIndex();

        const participantIdSet = new Set(newState.participantIds);
        for (const [messageId, mentionedCharacterIds] of this.messageIdToMentionedCharacterIds.entries()) {
          const nextMentionedCharacterIds = mentionedCharacterIds.filter((id) => !participantIdSet.has(id));
          if (nextMentionedCharacterIds.length > 0) {
            this.messageIdToMentionedCharacterIds.set(messageId, nextMentionedCharacterIds);
          } else {
            this.messageIdToMentionedCharacterIds.delete(messageId);
          }
        }
      }
    });
  }

  public teardown() {
    this.unsubscribe();
  }

  public collectMentionedOffscreenCharacterIds(messageId: string, messageText: string) {
    this.rebuildMentionIndex();

    const previouslyMentioned = this.getMentionedOffscreenCharacterIdSet();

    const matches = matchStringToIndex(messageText, this.mentionKeyToCharacterIds);
    const uniqueMatchesThisMessage: string[] = [];
    const seenThisMessage = new Set<string>();

    while (matches.length > 0) {
      const candidateId = matches.pop();
      assertNonNullish(candidateId, 'Candidate ID from matches should not be null');
      if (!seenThisMessage.has(candidateId)) {
        uniqueMatchesThisMessage.push(candidateId);
        seenThisMessage.add(candidateId);
      }
    }

    this.messageIdToMentionedCharacterIds.set(messageId, uniqueMatchesThisMessage);

    const currentlyMentioned = this.getMentionedOffscreenCharacterIdSet();
    const newMatchesThisMessage = uniqueMatchesThisMessage.filter(
      (id) => currentlyMentioned.has(id) && !previouslyMentioned.has(id)
    );

    return newMatchesThisMessage;
  }

  public deleteMessage(messageId: string) {
    this.messageIdToMentionedCharacterIds.delete(messageId);
  }

  public getMentionedOffscreenCharacters() {
    return useScenarioCharacterStore
      .getState()
      .getCharactersByIds(Array.from(this.getMentionedOffscreenCharacterIdSet()));
  }

  private rebuildMentionIndex() {
    const allCharacters = Object.values(useScenarioCharacterStore.getState().scenarioCharactersById);
    const participants = getActiveChatParticipants({ includeRemoved: true });
    const participantIdSet = new Set(participants.map((p) => p.id));
    const nonParticipantCharacters = allCharacters.filter((character) => !participantIdSet.has(character.id));
    this.mentionKeyToCharacterIds = buildCharacterNameIndex(nonParticipantCharacters);
  }

  private getMentionedOffscreenCharacterIdSet() {
    const maxOffscreenMentions = Math.max(1, Math.round(useSettingsStore.getState().offscreenMentionLimit));
    const mentionedIds = new Set<string>();

    for (const characterIds of this.messageIdToMentionedCharacterIds.values()) {
      for (const characterId of characterIds) {
        if (mentionedIds.size >= maxOffscreenMentions) {
          return mentionedIds;
        }
        mentionedIds.add(characterId);
      }
    }

    return mentionedIds;
  }
}
