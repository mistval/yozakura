import { assert, assertNonNullish } from '../../../errors/application_error';
import { useTurnMachineStore } from '../../../state/turn_machine_store';
import { useScenarioCharacterStore } from '../../../state/scenario_character_store';
import { useScenarioCharacterRelationshipStore } from '../../../state/scenario_character_relationship_store';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store';
import { useSettingsStore } from '../../../state/settings_store';
import { getRequiredActiveScenario, getRequiredActiveScenarioMap } from '../../../state/scenario_store';
import { weightedSampleWithoutReplacement } from '../../../util/array';
import { ChatCoordinator } from '../../chat/chat_coordinator';
import { getScheduledMoveForNpc } from '../../character_schedule/get_scheduled_move';
import type { ScheduledMove } from '../../character_schedule/schedule_movement';
import { familiarityRelativeWeight, relationshipKey } from '../../relationship';
import type { Character, CharacterRelationship } from '../../types';
import type { ChatInputResult, TurnMove, TurnMoveResult } from '../types';
import { CharacterInputInterface } from './character_input_interface';

export type NpcChatSettings = {
  npcChatRate: number;
  npcTriggeredGroupChatRate: number;
  npcGroupChatAdditionalParticipants: number;
  npcRemoteChatRate: number;
  familiarityWeightMultiplier: number;
  richNpcInteractionRate: number;
};

export type NpcChatCharacter = Pick<Character, 'id' | 'nextConversationWithCharacterId'>;

export type NpcCharacterRelationship = Pick<CharacterRelationship, 'familiarity'> & {
  rollingPairwiseSummaries: readonly unknown[];
};

export type NpcInputResolvers = {
  getRequiredCharacterById: (characterId: string) => NpcChatCharacter;
  getCharacterById: (characterId: string) => NpcChatCharacter | undefined;
  getAllCharacters: () => NpcChatCharacter[];
  getUserCharacterId: () => string | undefined;
  getCharacterLocationId: (characterId: string) => string;
  hasChatted: (characterIdA: string, characterIdB: string) => boolean;
  recordChat: (npcId: string, otherParticipantIds: string[]) => void;
  clearForcedConversationTarget: (npcId: string) => void;
  getCharacterRelationships: (
    pairs: { fromId: string; toId: string }[]
  ) => Promise<Record<string, NpcCharacterRelationship>>;
  getScheduledMove: (npc: NpcChatCharacter) => ScheduledMove;
  userIsDisabled: () => boolean;
  getSettings: () => NpcChatSettings;
  random: () => number;
};

function defaultNpcInputResolvers(): NpcInputResolvers {
  return {
    getRequiredCharacterById: (characterId) =>
      useScenarioCharacterStore.getState().getRequiredCharacterById(characterId),
    getCharacterById: (characterId) =>
      useScenarioCharacterStore.getState().scenarioCharactersById[characterId],
    getAllCharacters: () => useScenarioCharacterStore.getState().scenarioCharacters,
    getUserCharacterId: () => getRequiredActiveScenario().userCharacterId,
    getCharacterLocationId: (characterId) => {
      const character = useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
      const activeMap = getRequiredActiveScenarioMap();
      const resolvedLocation =
        activeMap.locations.find((l) => l.id === character.locationId) ?? activeMap.locations[0];

      assertNonNullish(resolvedLocation, 'Failed to find NPC location');

      return resolvedLocation.id;
    },
    hasChatted: (characterIdA, characterIdB) =>
      useTurnMachineStore.getState().hasChatted(characterIdA, characterIdB),
    recordChat: (npcId, otherParticipantIds) =>
      useTurnMachineStore.getState().recordChat(npcId, otherParticipantIds),
    clearForcedConversationTarget: (npcId) =>
      useScenarioCharacterStore
        .getState()
        .saveScenarioCharacterFields(npcId, { nextConversationWithCharacterId: '' }),
    getCharacterRelationships: (pairs) =>
      useScenarioCharacterRelationshipStore.getState().getCharacterRelationships(pairs),
    getScheduledMove: (npc) =>
      getScheduledMoveForNpc(useScenarioCharacterStore.getState().getRequiredCharacterById(npc.id)),
    userIsDisabled: () => useScenarioLoopStateStore.getState().autoMode,
    getSettings: () => {
      const settings = useSettingsStore.getState();
      return {
        npcChatRate: settings.npcChatRate,
        npcTriggeredGroupChatRate: settings.npcTriggeredGroupChatRate,
        npcGroupChatAdditionalParticipants: settings.npcGroupChatAdditionalParticipants,
        npcRemoteChatRate: settings.npcRemoteChatRate,
        familiarityWeightMultiplier: settings.familiarityWeightMultiplier,
        richNpcInteractionRate: settings.richNpcInteractionRate,
      };
    },
    random: () => Math.random(),
  };
}

export type ChatCandidate = {
  character: NpcChatCharacter;
  isColocated: boolean;
  hasMet: boolean;
  familiarity: number;
};

// We determine based on the selected characters whether the chat is remote or not.
// If it is remote, we need to make sure it includes ONLY met candidates, not any
// unmet candidates, even if they are colocated with speaker.
export function applyRemoteChatConstraint(
  rankedCandidates: ChatCandidate[],
  maxOtherParticipants: number
): ChatCandidate[] {
  const selected = rankedCandidates.slice(0, maxOtherParticipants);
  const isRemoteChat = selected.some((candidate) => !candidate.isColocated);

  if (!isRemoteChat) {
    return selected;
  }

  return rankedCandidates.filter((candidate) => candidate.hasMet).slice(0, maxOtherParticipants);
}

export class NPCInputInterface extends CharacterInputInterface {
  public constructor(
    private readonly characterId: string,
    private readonly resolvers: NpcInputResolvers = defaultNpcInputResolvers()
  ) {
    super();
  }

  public async getNextTurnMove(): Promise<TurnMoveResult> {
    const npc = this.resolvers.getRequiredCharacterById(this.characterId);
    const userCharacterId = this.resolvers.getUserCharacterId();
    const forcedConversationTargetId = npc.nextConversationWithCharacterId;
    const scheduledMove = this.resolvers.getScheduledMove(npc);

    if (
      forcedConversationTargetId &&
      (!this.resolvers.userIsDisabled() || forcedConversationTargetId !== userCharacterId)
    ) {
      assert(forcedConversationTargetId !== npc.id, 'Character has force chat target set to themself');

      const forcedConversationTarget = this.resolvers.getCharacterById(forcedConversationTargetId);
      this.resolvers.clearForcedConversationTarget(npc.id);

      if (forcedConversationTarget) {
        this.resolvers.recordChat(npc.id, [forcedConversationTarget.id]);
        return {
          move: this.buildChatMove(npc, [forcedConversationTarget], { forceRichInteraction: true }),
        };
      }
    }

    if (scheduledMove.forceMove) {
      return {
        move: { actionType: 'move', ...scheduledMove },
      };
    }

    const settings = this.resolvers.getSettings();
    const chatDecider = this.resolvers.random();

    if (chatDecider < settings.npcChatRate) {
      const groupDecider = this.resolvers.random();
      const maxOtherParticipants =
        groupDecider < settings.npcTriggeredGroupChatRate ? settings.npcGroupChatAdditionalParticipants : 1;

      const initialChatCandidates = this.resolvers
        .getAllCharacters()
        .filter(
          (c) =>
            c.id !== npc.id &&
            !this.resolvers.hasChatted(c.id, npc.id) &&
            (!this.resolvers.userIsDisabled() || c.id !== userCharacterId)
        );

      const relationships = await this.resolvers.getCharacterRelationships(
        initialChatCandidates.map((character) => ({ fromId: npc.id, toId: character.id }))
      );

      const currentLocationId = this.resolvers.getCharacterLocationId(npc.id);
      const allowRemoteChat = this.resolvers.random() < settings.npcRemoteChatRate;

      const candidatePool: ChatCandidate[] = initialChatCandidates
        .map((character) => {
          const relationship = relationships[relationshipKey(npc.id, character.id)];
          return {
            character,
            isColocated: this.resolvers.getCharacterLocationId(character.id) === currentLocationId,
            hasMet: (relationship?.rollingPairwiseSummaries.length ?? 0) > 0,
            familiarity: relationship?.familiarity ?? 0,
          };
        })
        .filter((candidate) =>
          allowRemoteChat ? candidate.isColocated || candidate.hasMet : candidate.isColocated
        );

      // If there are no chat candidates, fall through and do a move instead
      if (candidatePool.length > 0) {
        const otherParticipants = this.selectChatParticipants(candidatePool, maxOtherParticipants);
        this.resolvers.recordChat(
          npc.id,
          otherParticipants.map((c) => c.id)
        );
        return {
          move: this.buildChatMove(npc, otherParticipants),
        };
      }
    }

    return { move: { actionType: 'move', ...scheduledMove } };
  }

  public async getNextChatInput(): Promise<ChatInputResult> {
    if (await ChatCoordinator.shouldEndNpcChat()) {
      return { input: { actionType: 'request_end_chat' } };
    }

    await ChatCoordinator.speakAsNpc(this.characterId);

    return { input: { actionType: 'spoke' } };
  }

  public continuesAfterMove(move: TurnMove): boolean {
    return move.actionType === 'move' && !move.consumesTurn;
  }

  private selectChatParticipants(
    candidatePool: ChatCandidate[],
    maxOtherParticipants: number
  ): NpcChatCharacter[] {
    const familiarityWeightMultiplier = this.resolvers.getSettings().familiarityWeightMultiplier;
    const weightedPool = candidatePool.map((candidate) => ({
      value: candidate,
      weight: familiarityRelativeWeight(candidate.familiarity, familiarityWeightMultiplier),
    }));

    const rankedCandidates = weightedSampleWithoutReplacement(weightedPool, weightedPool.length);

    return applyRemoteChatConstraint(rankedCandidates, maxOtherParticipants).map(
      (candidate) => candidate.character
    );
  }

  private buildChatMove(
    npc: NpcChatCharacter,
    otherParticipants: NpcChatCharacter[],
    options?: {
      forceRichInteraction?: boolean;
    }
  ): TurnMove {
    const settings = this.resolvers.getSettings();
    const userCharacterId = this.resolvers.getUserCharacterId();

    const isRich =
      options?.forceRichInteraction ||
      this.resolvers.random() < settings.richNpcInteractionRate ||
      otherParticipants.some((p) => p.id === userCharacterId);

    return {
      actionType: 'chat',
      participantIds: [npc].concat(otherParticipants).map((p) => p.id),
      rich: isRich,
    };
  }
}
