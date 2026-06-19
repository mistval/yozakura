import _ from 'lodash';
import { assert } from '../../errors/application_error';

export class TurnState {
  private constructor(
    private readonly pendingTurnCharacterIds: string[],
    public readonly chatsSoFar: Record<
      string,
      Array<{
        withIds: string[];
      }>
    >
  ) {}

  public static new(pendingTurnCharacterIds: string[], userCharacterIds: string[]) {
    assert(
      userCharacterIds.length === 1,
      'Number of user characters is not 1. Might allow 0 or multiple user characters in future, but not now'
    );

    const userCharacterId = userCharacterIds[0]!;
    // The user character takes their turn first, then all other characters follow in random order.
    const otherCharacterIds = pendingTurnCharacterIds.filter((id) => id !== userCharacterId);
    const ordered = [userCharacterId, ..._.shuffle(otherCharacterIds)];

    return new TurnState(ordered, {});
  }

  // The character whose turn is currently being processed, or undefined if the turn is complete. It
  // stays at the head until completed, so a persisted TurnState can resume mid-character.
  public peekCurrentCharacterId(): string | undefined {
    return this.pendingTurnCharacterIds[0];
  }

  public completeCurrentCharacter() {
    this.pendingTurnCharacterIds.shift();
  }

  public completeCharacter(characterId: string) {
    const index = this.pendingTurnCharacterIds.indexOf(characterId);
    if (index !== -1) {
      this.pendingTurnCharacterIds.splice(index, 1);
    }
  }

  // Whether the two characters have already chatted this turn (symmetric).
  public hasChatted(characterAId: string, characterBId: string): boolean {
    return (
      (this.chatsSoFar[characterAId] ?? []).some((chat) => chat.withIds.includes(characterBId)) ||
      (this.chatsSoFar[characterBId] ?? []).some((chat) => chat.withIds.includes(characterAId))
    );
  }

  // Record that the initiator chatted with the given characters this turn.
  public recordChat(initiatorId: string, withIds: string[]) {
    const existing = this.chatsSoFar[initiatorId] ?? [];
    existing.push({ withIds });
    this.chatsSoFar[initiatorId] = existing;
  }

  public serialize() {
    return {
      pendingTurnCharacterIds: this.pendingTurnCharacterIds,
      chatsSoFar: this.chatsSoFar,
    };
  }

  public static deserialize(serialized: ReturnType<typeof TurnState.prototype.serialize>) {
    return new TurnState(serialized.pendingTurnCharacterIds, serialized.chatsSoFar);
  }
}
