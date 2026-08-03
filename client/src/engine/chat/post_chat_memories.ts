import * as Database from '../../backend_bridge/database';
import { assert } from '../../errors/application_error';
import {
  getActiveChatMedium,
  getActiveChatParticipants,
  useTurnMachineStore,
} from '../../state/turn_machine_store';
import { getRequiredUserCharacterId, useScenarioStore } from '../../state/scenario_store';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store';
import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import { useSettingsStore } from '../../state/settings_store';
import { DEFERRED_SYNC } from '../../state/ephemeral_state_helper';
import { trimNewestByCreatedAt } from '../../util/array';
import { newId } from '../../util/id';
import { withPhaseTransitionGate } from '../../util/phase_transition_gate';
import { conversationRollingSummaryChainGroup } from '../prompt_templates/memories/conversation_rolling_summary';
import { nextConversationGoalUpdatesChainGroup } from '../prompt_templates/memories/next_conversation_goal_updates';
import { offscreenMemoryExtractionChainGroup } from '../prompt_templates/memories/offscreen_memory_extraction';
import { offscreenMemoryUpdateConversationGoalChainGroup } from '../prompt_templates/memories/offscreen_memory_update_conversation_goal';
import { relationshipDescriptorUpdateChainGroup } from '../prompt_templates/memories/relationship_descriptor_update';
import { rollingGlobalMemoryRewriteChainGroup } from '../prompt_templates/memories/rolling_global_memory_rewrite';
import { rollingPairwiseMemoryRewriteChainGroup } from '../prompt_templates/memories/rolling_pairwise_memory_rewrite';
import {
  buildFocusedChatTemplateContext,
  buildOffscreenMemoryUpdateConversationGoalContext,
  buildTargetedChatTemplateContext,
} from '../prompt_templates/prompt_context_builder';
import { calculateInteractionUpdatedFamiliarity } from '../relationship';
import type {
  Character,
  CharacterRelationship,
  ConversationPairwiseUpdate,
  ConversationStateUpdateNode,
  ConversationSummary,
  OffscreenLearnedInformation,
  StoredConversation,
} from '../types';

// Create a version of a function that is surrounded by withPhaseTransitionGate and passes
// through the abortSignal
function createGatedRenderFunction<
  TTemplateRenderer extends {
    renderAndExecute: (firstArg: any, options: { abortSignal: AbortSignal }) => Promise<any>;
  },
>(templateRenderer: TTemplateRenderer) {
  return (
    firstArg: Parameters<TTemplateRenderer['renderAndExecute']>[0]
  ): Promise<Awaited<ReturnType<TTemplateRenderer['renderAndExecute']>>> => {
    return withPhaseTransitionGate(
      (abortSignal) => {
        return templateRenderer.renderAndExecute(firstArg, { abortSignal });
      },
      { pauseBehavior: 'abort' }
    );
  };
}

const gatedRenderFunctions = {
  conversationRollingSummaryChainGroup: createGatedRenderFunction(conversationRollingSummaryChainGroup),
  offscreenMemoryExtractionChainGroup: createGatedRenderFunction(offscreenMemoryExtractionChainGroup),
  offscreenMemoryUpdateConversationGoalChainGroup: createGatedRenderFunction(
    offscreenMemoryUpdateConversationGoalChainGroup
  ),
  rollingPairwiseMemoryRewriteChainGroup: createGatedRenderFunction(rollingPairwiseMemoryRewriteChainGroup),
  nextConversationGoalUpdatesChainGroup: createGatedRenderFunction(nextConversationGoalUpdatesChainGroup),
  relationshipDescriptorUpdateChainGroup: createGatedRenderFunction(relationshipDescriptorUpdateChainGroup),
  rollingGlobalMemoryRewriteChainGroup: createGatedRenderFunction(rollingGlobalMemoryRewriteChainGroup),
};

function getResolvedCharacter(characterId: string): Character {
  return useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
}

function getResolvedRelationship(fromId: string, toId: string): Promise<CharacterRelationship> {
  return useScenarioCharacterRelationshipStore.getState().getCharacterRelationship(fromId, toId);
}

function stageCharacterFields(characterId: string, fields: Partial<Character>) {
  useScenarioCharacterStore.getState().saveScenarioCharacterFields(characterId, fields, DEFERRED_SYNC);
}

function stageConversationSummary(characterId: string, summary: ConversationSummary) {
  const character = getResolvedCharacter(characterId);
  stageCharacterFields(characterId, {
    rollingConversationSummaries: trimNewestByCreatedAt(
      character.rollingConversationSummaries.concat(summary)
    ),
  });
}

function stageRelationshipFields(fromId: string, toId: string, fields: Partial<CharacterRelationship>) {
  return useScenarioCharacterRelationshipStore
    .getState()
    .saveRelationshipFields({ fromId, toId }, fields, DEFERRED_SYNC);
}

async function stagePairwiseConversationSummary(fromId: string, toId: string, summary: ConversationSummary) {
  const relationship = await getResolvedRelationship(fromId, toId);
  await stageRelationshipFields(fromId, toId, {
    rollingPairwiseSummaries: trimNewestByCreatedAt(relationship.rollingPairwiseSummaries.concat(summary)),
  });
}

async function stagePairwiseLearnedInformation(
  fromId: string,
  toId: string,
  information: OffscreenLearnedInformation
) {
  const relationship = await getResolvedRelationship(fromId, toId);
  await stageRelationshipFields(fromId, toId, {
    rollingOffscreenLearnedInformation: trimNewestByCreatedAt(
      relationship.rollingOffscreenLearnedInformation.concat(information)
    ),
  });
}

export async function generateCharacterEndOfChatUpdates(
  fromCharacterPerspective: Character,
  onProgress: (statusInfo: string) => void
) {
  const { activeScenario } = useScenarioStore.getState();
  const userCharacterId = getRequiredUserCharacterId();

  assert(activeScenario, 'No scenario');

  if (fromCharacterPerspective.id === userCharacterId) {
    throw new Error('Cannot generate end of chat updates for the user character');
  }

  const transcript = useTurnMachineStore.getState().transcript;
  assert(transcript, 'Cannot generate end of chat updates without a transcript');

  const participants = getActiveChatParticipants({ includeRemoved: true });

  const coPresentSpeakerIds = transcript.getCoPresentSpeakerIds(fromCharacterPerspective.id);
  const offscreenOnlyIds = transcript
    .getMentionedOffscreenCharacterIds(fromCharacterPerspective.id)
    .filter((id) => !coPresentSpeakerIds.includes(id));

  const memoryUpdateTargets = useScenarioCharacterStore
    .getState()
    .getCharactersByIds(coPresentSpeakerIds.concat(offscreenOnlyIds));

  onProgress(`Summarizing conversation for ${fromCharacterPerspective.firstName}...`);

  // Summarize the conversation from fromCharacterPerspective's point of view
  const conversationSummaryResultText = await gatedRenderFunctions.conversationRollingSummaryChainGroup(
    await buildFocusedChatTemplateContext(fromCharacterPerspective.id)
  );

  const conversationId = newId();
  const createdAt = new Date().toISOString();

  const conversationSummaryEntry: ConversationSummary = Database.createPersistedObject({
    conversationId,
    turnNumber: activeScenario.turnNumber,
    createdAt,
    summary: conversationSummaryResultText,
    participantIds: participants.map((participant) => participant.id),
    chatMedium: getActiveChatMedium(),
  });

  stageConversationSummary(fromCharacterPerspective.id, conversationSummaryEntry);

  const newRollingConversationSummaries = getResolvedCharacter(
    fromCharacterPerspective.id
  ).rollingConversationSummaries;

  const pairwiseUpdates: Array<
    ConversationPairwiseUpdate & {
      newRollingPairwiseSummaries: CharacterRelationship['rollingPairwiseSummaries'];
      newRollingOffscreenLearnedInformation: CharacterRelationship['rollingOffscreenLearnedInformation'];
    }
  > = [];

  // For each character we decided to update fromCharacterPerspective's memories towards,
  // generate updates
  for (const otherCharacter of memoryUpdateTargets) {
    onProgress(`Updating ${fromCharacterPerspective.firstName}'s memories of ${otherCharacter.firstName}...`);

    const initialPairwiseRelationship = await getResolvedRelationship(
      fromCharacterPerspective.id,
      otherCharacter.id
    );

    const isOffscreenMention = offscreenOnlyIds.includes(otherCharacter.id);

    let newLearnedInformation: OffscreenLearnedInformation | undefined;

    if (isOffscreenMention) {
      const extractedInformation = await gatedRenderFunctions.offscreenMemoryExtractionChainGroup(
        await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id)
      );

      if (extractedInformation) {
        newLearnedInformation = Database.createPersistedObject({
          sourceConversationId: conversationId,
          turnNumber: activeScenario.turnNumber,
          createdAt,
          information: extractedInformation,
          source: `A conversation between ${participants.map((participant) => `${participant.firstName} ${participant.lastName}`).join(', ')}`,
        });

        await stagePairwiseLearnedInformation(
          fromCharacterPerspective.id,
          otherCharacter.id,
          newLearnedInformation
        );

        const replacementConversationGoal =
          await gatedRenderFunctions.offscreenMemoryUpdateConversationGoalChainGroup(
            await buildOffscreenMemoryUpdateConversationGoalContext(
              fromCharacterPerspective.id,
              otherCharacter.id,
              extractedInformation
            )
          );

        if (replacementConversationGoal) {
          await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
            nextConversationGoal: replacementConversationGoal,
          });
        }

        const newPairwiseMemory = await gatedRenderFunctions.rollingPairwiseMemoryRewriteChainGroup(
          await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id)
        );

        await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
          memory: newPairwiseMemory,
        });

        const updatedRelationshipDescriptor =
          await gatedRenderFunctions.relationshipDescriptorUpdateChainGroup(
            await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id)
          );

        await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
          descriptor: updatedRelationshipDescriptor,
        });

        const updatedPairwiseRelationship = await getResolvedRelationship(
          fromCharacterPerspective.id,
          otherCharacter.id
        );

        pairwiseUpdates.push(
          Database.createPersistedObject({
            towardsCharacter: otherCharacter,
            oldMemory: initialPairwiseRelationship.memory,
            newMemory: updatedPairwiseRelationship.memory,
            oldConversationGoal: initialPairwiseRelationship.nextConversationGoal,
            newConversationGoal: updatedPairwiseRelationship.nextConversationGoal,
            oldRelationshipDescriptor: initialPairwiseRelationship.descriptor,
            newRelationshipDescriptor: updatedPairwiseRelationship.descriptor,
            oldFamiliarity: initialPairwiseRelationship.familiarity,
            newFamiliarity: updatedPairwiseRelationship.familiarity,
            learnedInformation: newLearnedInformation,
            newRollingPairwiseSummaries: updatedPairwiseRelationship.rollingPairwiseSummaries,
            newRollingOffscreenLearnedInformation:
              updatedPairwiseRelationship.rollingOffscreenLearnedInformation,
          })
        );
      }

      continue;
    }

    await stagePairwiseConversationSummary(
      fromCharacterPerspective.id,
      otherCharacter.id,
      conversationSummaryEntry
    );

    let pairwiseContext = await buildTargetedChatTemplateContext(
      fromCharacterPerspective.id,
      otherCharacter.id
    );

    const newConversationGoal =
      await gatedRenderFunctions.nextConversationGoalUpdatesChainGroup(pairwiseContext);

    await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
      nextConversationGoal: newConversationGoal,
    });

    pairwiseContext = await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id);

    const newMemory = await gatedRenderFunctions.rollingPairwiseMemoryRewriteChainGroup(pairwiseContext);

    await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
      memory: newMemory,
    });

    pairwiseContext = await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id);

    const newRelationshipDescriptor =
      await gatedRenderFunctions.relationshipDescriptorUpdateChainGroup(pairwiseContext);

    await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
      descriptor: newRelationshipDescriptor,
    });

    const familiarity = calculateInteractionUpdatedFamiliarity(
      initialPairwiseRelationship,
      fromCharacterPerspective.id === userCharacterId || otherCharacter.id === userCharacterId,
      useSettingsStore.getState().userFamiliarityInteractionMultiplier
    );

    await stageRelationshipFields(fromCharacterPerspective.id, otherCharacter.id, {
      familiarity: familiarity.new,
    });

    const updatedPairwiseRelationship = await getResolvedRelationship(
      fromCharacterPerspective.id,
      otherCharacter.id
    );

    pairwiseUpdates.push(
      Database.createPersistedObject({
        towardsCharacter: otherCharacter,
        oldMemory: initialPairwiseRelationship.memory,
        newMemory: updatedPairwiseRelationship.memory,
        oldConversationGoal: initialPairwiseRelationship.nextConversationGoal,
        newConversationGoal: updatedPairwiseRelationship.nextConversationGoal,
        oldRelationshipDescriptor: initialPairwiseRelationship.descriptor,
        newRelationshipDescriptor: updatedPairwiseRelationship.descriptor,
        oldFamiliarity: initialPairwiseRelationship.familiarity,
        newFamiliarity: updatedPairwiseRelationship.familiarity,
        learnedInformation: undefined,
        newRollingPairwiseSummaries: updatedPairwiseRelationship.rollingPairwiseSummaries,
        newRollingOffscreenLearnedInformation: updatedPairwiseRelationship.rollingOffscreenLearnedInformation,
      })
    );
  }

  onProgress(`Rewriting global memory for ${fromCharacterPerspective.firstName}...`);

  const oldGlobalMemory = getResolvedCharacter(fromCharacterPerspective.id).globalMemories;
  const newGlobalMemory = await gatedRenderFunctions.rollingGlobalMemoryRewriteChainGroup(
    await buildFocusedChatTemplateContext(fromCharacterPerspective.id)
  );

  stageCharacterFields(fromCharacterPerspective.id, {
    globalMemories: newGlobalMemory,
  });

  return Database.createPersistedObject({
    conversationSummary: conversationSummaryEntry,
    characterId: fromCharacterPerspective.id,
    oldGlobalMemory,
    newGlobalMemory,
    newRollingConversationSummaries,
    pairwiseUpdates,
  });
}

export function buildConversationStateUpdates(
  characterUpdates: StoredConversation['characterUpdates']
): ConversationStateUpdateNode[] {
  if (characterUpdates.length === 0) {
    return [];
  }

  const getFirstNameForCharacterId = (characterId: string) => {
    const participant = getActiveChatParticipants({ includeRemoved: true }).find(
      (entry) => entry.id === characterId
    );
    return participant ? participant.firstName : characterId;
  };

  const pairwiseMemoryChildren: ConversationStateUpdateNode[] = characterUpdates.flatMap((update) => {
    const fromName = getFirstNameForCharacterId(update.characterId);

    return update.pairwiseUpdates.map((pairwise) => ({
      kind: 'spoiler' as const,
      name: `${fromName}'s new memory of ${pairwise.towardsCharacter.firstName}`,
      children: [
        {
          kind: 'text' as const,
          text: pairwise.newMemory || '(none)',
        },
        {
          kind: 'spoiler' as const,
          name: `${fromName}'s previous memory of ${pairwise.towardsCharacter.firstName}`,
          children: [
            {
              kind: 'text' as const,
              text: pairwise.oldMemory || '(none)',
            },
          ],
        },
      ],
    }));
  });

  const nextGoalsChildren: ConversationStateUpdateNode[] = characterUpdates.flatMap((update) => {
    const fromName = getFirstNameForCharacterId(update.characterId);

    return update.pairwiseUpdates
      .filter((pairwise) => pairwise.oldConversationGoal !== pairwise.newConversationGoal)
      .map((pairwise) => ({
        kind: 'spoiler' as const,
        name: `${fromName}'s goal in next conversation with ${pairwise.towardsCharacter.firstName}`,
        children: [
          {
            kind: 'text' as const,
            text: pairwise.newConversationGoal || '(none)',
          },
          {
            kind: 'spoiler' as const,
            name: `${fromName}'s previous goal in conversation with ${pairwise.towardsCharacter.firstName}`,
            children: [
              {
                kind: 'text' as const,
                text: pairwise.oldConversationGoal || '(none)',
              },
            ],
          },
        ],
      }));
  });

  const relationshipDescriptorChildren: ConversationStateUpdateNode[] = characterUpdates.flatMap((update) => {
    const fromName = getFirstNameForCharacterId(update.characterId);

    return update.pairwiseUpdates.map((pairwise) => ({
      kind: 'inline-delta' as const,
      inlineFromName: fromName,
      inlineToName: pairwise.towardsCharacter.firstName,
      inlineFromValue: pairwise.oldRelationshipDescriptor || 'Stranger',
      inlineToValue: pairwise.newRelationshipDescriptor || 'Stranger',
    }));
  });

  const familiarityChildren: ConversationStateUpdateNode[] = characterUpdates.flatMap((update) => {
    const fromName = getFirstNameForCharacterId(update.characterId);

    return update.pairwiseUpdates
      .filter((pairwise) => pairwise.oldFamiliarity !== pairwise.newFamiliarity)
      .map((pairwise) => ({
        kind: 'inline-delta' as const,
        inlineFromName: fromName,
        inlineToName: pairwise.towardsCharacter.firstName,
        inlineFromValue: Math.round(pairwise.oldFamiliarity),
        inlineToValue: Math.round(pairwise.newFamiliarity),
      }));
  });

  const globalMemoryChildren: ConversationStateUpdateNode[] = characterUpdates.map((update) => {
    const participantName = getFirstNameForCharacterId(update.characterId);

    return {
      kind: 'spoiler' as const,
      name: `${participantName}'s new global memory`,
      children: [
        {
          kind: 'text' as const,
          text: `${update.newGlobalMemory || '(none)'}`,
        },
        {
          kind: 'spoiler' as const,
          name: `${participantName}'s previous global memory`,
          children: [
            {
              kind: 'text' as const,
              text: update.oldGlobalMemory || '(none)',
            },
          ],
        },
      ],
    };
  });

  const conversationSummaries: ConversationStateUpdateNode[] = characterUpdates.map((update) => ({
    kind: 'spoiler' as const,
    name: `Conversation summary from ${getFirstNameForCharacterId(update.characterId)}'s point of view`,
    text: update.conversationSummary.summary || '(no summary)',
  }));

  const offscreenLearnedInformationChildren: ConversationStateUpdateNode[] = characterUpdates
    .flatMap((update) => ({
      kind: 'spoiler' as const,
      name: `Learned by ${getFirstNameForCharacterId(update.characterId)}` as const,
      children: update.pairwiseUpdates
        .flatMap((pairwise) => ({
          kind: 'spoiler' as const,
          name: `Learned about ${pairwise.towardsCharacter.firstName}`,
          text: pairwise.learnedInformation?.information,
        }))
        .filter((entry) => entry.text),
    }))
    .filter((e) => e.children.length > 0);

  return [
    {
      kind: 'spoiler' as const,
      name: 'Conversation Summaries',
      children: conversationSummaries,
    },
    {
      kind: 'spoiler' as const,
      name: 'Updated Pairwise Memories',
      children: pairwiseMemoryChildren,
    },
    {
      kind: 'spoiler' as const,
      name: 'Next Conversation Goals',
      children: nextGoalsChildren,
    },
    {
      kind: 'spoiler' as const,
      name: 'Relationship Descriptor Changes',
      children: relationshipDescriptorChildren,
    },
    {
      kind: 'spoiler' as const,
      name: 'Familiarity Updates',
      children: familiarityChildren,
    },
    {
      kind: 'spoiler' as const,
      name: 'Updated Global Memories',
      children: globalMemoryChildren,
    },
    {
      kind: 'spoiler' as const,
      name: 'Learned Offscreen Information',
      children: offscreenLearnedInformationChildren,
    },
  ].filter((e) => e.children.length > 0);
}
