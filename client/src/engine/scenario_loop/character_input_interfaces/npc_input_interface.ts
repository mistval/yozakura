import _ from 'lodash';
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
import { familiarityRelativeWeight, getDirectedRelationship } from '../../relationship';
import type { Character, CharacterRelationships, WorldMapLocation } from '../../types';
import type { ChatInputResult, TurnMove, TurnMoveResult } from '../types';
import { CharacterInputInterface } from './character_input_interface';

export class NPCInputInterface extends CharacterInputInterface {
  public constructor(private readonly characterId: string) {
    super();
  }

  public async getNextTurnMove(): Promise<TurnMoveResult> {
    const npc = useScenarioCharacterStore.getState().getRequiredCharacterById(this.characterId);
    const currentLocation = this.getCharacterLocation(npc.id);
    const forcedConversationTargetId = npc.nextConversationWithCharacterId;
    const userCharacterId = useScenarioCharacterStore.getState().getUserCharacter()?.id;
    const scheduledMove = getScheduledMoveForNpc(npc);

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

        if (!useTurnMachineStore.getState().hasChatted(npc.id, forcedConversationTarget.id)) {
          useTurnMachineStore.getState().recordChat(npc.id, [forcedConversationTarget.id]);
          return {
            move: this.buildChatMove(
              npc,
              [forcedConversationTarget],
              forcedConversationTargetRelationship,
              1,
              {
                forceRichInteraction: true,
              }
            ),
          };
        }
      }
    }

    if (scheduledMove.forceMove) {
      return {
        move: { actionType: 'move', ...scheduledMove },
      };
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
            !useTurnMachineStore.getState().hasChatted(c.id, npc.id) &&
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
        useTurnMachineStore.getState().recordChat(
          npc.id,
          chatCandidates.map((c) => c.id)
        );
        return {
          move: this.buildChatMove(npc, chatCandidates, directedRelationships, maxOtherParticipants),
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

  private get autoModeEnabled(): boolean {
    return useScenarioLoopStateStore.getState().autoMode;
  }

  private buildChatMove(
    npc: Character,
    chatCandidates: Character[],
    directedRelationships: CharacterRelationships,
    maxOtherParticipants: number,
    options?: {
      forceRichInteraction?: boolean;
    }
  ): TurnMove {
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

    return {
      actionType: 'chat',
      participantIds: allParticipants.map((p) => p.id),
      rich: isRich,
    };
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
