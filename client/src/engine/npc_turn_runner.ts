import _ from 'lodash';
import { assert, assertNonNullish } from '../errors/application_error';
import { getRequiredRandomChoice, weightedSampleWithoutReplacement } from '../util/array';
import { familiarityRelativeWeight, getDirectedRelationship, relationshipKey } from './relationship';
import type { Character, CharacterRelationships, WorldMapLocation } from './types';
import { useScenarioCharacterStore } from '../state/scenario_character_store';
import { useScenarioCharacterRelationshipStore } from '../state/scenario_character_relationship_store';
import { useSettingsStore } from '../state/settings_store';
import { getRequiredActiveScenario, getRequiredActiveScenarioMap } from '../state/scenario_store';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store';

type NPCTurnResult =
  | {
      result: 'all_turns_complete';
    }
  | {
      result: 'npc_moved';
      characterId: string;
      destinationLocationId: string;
    }
  | {
      result: 'do_simple_interaction';
      participants: Character[];
    }
  | {
      result: 'do_rich_interaction';
      participants: Character[];
    };

export class NPCTurnRunner {
  private readonly npcTurnQueue: Character[];
  private readonly hasChatted = new Set<string>();

  constructor() {
    this.npcTurnQueue = _.shuffle(useScenarioCharacterStore.getState().getNPCs());
  }

  private get autoModeEnabled(): boolean {
    return useScenarioLoopStateStore.getState().autoMode;
  }

  async runNextTurn(): Promise<NPCTurnResult> {
    const npc = this.npcTurnQueue.pop();
    if (!npc) {
      return { result: 'all_turns_complete' };
    }

    const currentLocation = this.getCharacterLocation(npc.id);
    const forcedConversationTargetId = npc.nextConversationWithCharacterId;
    const userCharacterId = useScenarioCharacterStore.getState().getUserCharacter()?.id;

    if (
      forcedConversationTargetId &&
      (!this.autoModeEnabled || forcedConversationTargetId !== userCharacterId)
    ) {
      assert(forcedConversationTargetId !== npc.id, 'Character has force chat target set to themself');

      const forcedConversationTarget =
        useScenarioCharacterStore.getState().scenarioCharactersById[forcedConversationTargetId];

      if (forcedConversationTarget) {
        const forcedConversationTargetRelationship = await useScenarioCharacterRelationshipStore
          .getState()
          .getCharacterRelationships([
            {
              fromId: npc.id,
              toId: forcedConversationTarget.id,
            },
          ]);

        useScenarioCharacterStore.getState().saveScenarioCharacterFields(npc.id, {
          nextConversationWithCharacterId: '',
        });

        const key = relationshipKey(npc.id, forcedConversationTarget.id);
        if (!this.hasChatted.has(key)) {
          this.hasChatted.add(key);
          return this.runChatTurn(npc, [forcedConversationTarget], forcedConversationTargetRelationship, 1, {
            forceRichInteraction: true,
          });
        }
      }
    }

    const chatDecider = Math.random();
    const settings = useSettingsStore.getState();
    const chatRate = settings.npcChatRate;

    if (chatDecider < chatRate) {
      const groupDecider = Math.random();
      const groupChatRate = settings.npcTriggeredGroupChatRate;
      const maxOtherParticipants =
        groupDecider < groupChatRate ? settings.npcGroupChatAdditionalParticipants : 1;

      const scenario = getRequiredActiveScenario();
      const initialChatCandidates = useScenarioCharacterStore
        .getState()
        .scenarioCharacters.filter(
          (c) =>
            c.id !== npc.id &&
            !this.hasChatted.has(relationshipKey(c.id, npc.id)) &&
            (!this.autoModeEnabled || c.id !== scenario.userCharacterId)
        );

      const directedRelationships = await useScenarioCharacterRelationshipStore
        .getState()
        .getCharacterRelationships(
          initialChatCandidates.map((character) => ({
            fromId: npc.id,
            toId: character.id,
          }))
        );

      const candidatesInCurrentLocation = new Set(
        initialChatCandidates.filter((c) => this.getCharacterLocation(c.id) === currentLocation)
      );

      const remoteChatDecider = Math.random();
      const allowRemoteChat = remoteChatDecider < settings.npcRemoteChatRate;

      const chatCandidates = initialChatCandidates.filter(
        (c) =>
          candidatesInCurrentLocation.has(c) ||
          (allowRemoteChat &&
            getDirectedRelationship(directedRelationships, npc.id, c.id).rollingPairwiseSummaries.length > 0) // Has met character, remote messaging enabled
      );

      // If there are no chat candidates, fall through and do a move instead
      if (chatCandidates.length > 0) {
        chatCandidates.forEach((c) => this.hasChatted.add(relationshipKey(c.id, npc.id)));
        return this.runChatTurn(npc, chatCandidates, directedRelationships, maxOtherParticipants);
      }
    }

    return this.runMoveTurn(npc);
  }

  runChatTurn(
    npc: Character,
    chatCandidates: Character[],
    directedRelationships: CharacterRelationships,
    maxOtherParticipants: number,
    options?: {
      forceRichInteraction?: boolean;
    }
  ): NPCTurnResult {
    const settings = useSettingsStore.getState();
    const candidateWeights = chatCandidates.map((c) => ({
      value: c,
      weight: familiarityRelativeWeight(
        getDirectedRelationship(directedRelationships, npc.id, c.id).familiarity,
        settings.familiarityWeightMultiplier
      ),
    }));

    const otherParticipants = weightedSampleWithoutReplacement(candidateWeights, maxOtherParticipants);
    const allParticipants = [npc].concat(otherParticipants);

    const scenario = getRequiredActiveScenario();
    const isRich =
      options?.forceRichInteraction ||
      Math.random() < settings.richNpcInteractionRate ||
      otherParticipants.some((p) => p.id === scenario.userCharacterId);

    if (isRich) {
      return {
        result: 'do_rich_interaction',
        participants: allParticipants,
      };
    } else {
      return { result: 'do_simple_interaction', participants: allParticipants };
    }
  }

  async runMoveTurn(npc: Character): Promise<NPCTurnResult> {
    const location = this.getCharacterLocation(npc.id);
    const candidates = [location.id].concat(location.adjacency);
    const targetLocation = getRequiredRandomChoice(candidates);

    return { result: 'npc_moved', characterId: npc.id, destinationLocationId: targetLocation };
  }

  private getCharacterLocation(characterId: string): WorldMapLocation {
    const character = useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
    const activeMap = getRequiredActiveScenarioMap();

    const resolvedLocation =
      activeMap.locations.find((l) => l.id === character.locationId) ?? activeMap.locations[0];

    assertNonNullish(resolvedLocation, 'Failed to find NPC location');

    return resolvedLocation;
  }
}
