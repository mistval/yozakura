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

    const shuffled = [...pendingTurnCharacterIds]; // TODO: Sort this so user character comes first, all other characters follow in random order. Assert that
    return new TurnState(shuffled, {});
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
