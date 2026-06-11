import * as Database from '../../backend_bridge/database';
import { assert } from '../../errors/application_error';
import { getActiveChatMedium, getActiveChatParticipants } from '../../state/active_chat_store';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store';
import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import { useScenarioStore } from '../../state/scenario_store';
import { useSettingsStore } from '../../state/settings_store';
import { newId } from '../../util/id';
import type { MemoryRAGHelper } from '../memory_rag_helper';
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

export async function generateCharacterEndOfChatUpdates(
  fromCharacterPerspective: Character,
  memoryRagHelper: MemoryRAGHelper,
  onProgress: (statusInfo: string) => void
) {
  const { activeScenario } = useScenarioStore.getState();
  const {
    saveRelationshipFields,
    addPairwiseConversationSummary,
    addPairwiseLearnedInformation,
    getCharacterRelationship,
  } = useScenarioCharacterRelationshipStore.getState();
  const { saveScenarioCharacterFields, addConversationSummary } = useScenarioCharacterStore.getState();

  const userCharacterId = activeScenario?.userCharacterId;

  assert(activeScenario, 'No scenario');
  assert(userCharacterId, 'No user character');

  if (fromCharacterPerspective.id === userCharacterId) {
    throw new Error('Cannot generate end of chat updates for the user character');
  }

  const participants = getActiveChatParticipants();
  const otherParticipants = participants.filter(
    (participant) => participant.id !== fromCharacterPerspective.id
  );

  // Decide which characters to update fromCharacterPerspective's memories towards
  const offscreenMentionedCharacters = memoryRagHelper.getMentionedOffscreenCharacters();
  const memoryUpdateTargets = otherParticipants.concat(offscreenMentionedCharacters);

  onProgress(`Summarizing conversation for ${fromCharacterPerspective.firstName}...`);

  // Summarize the conversation from fromCharacterPerspective's point of view
  const conversationSummaryResultText = await conversationRollingSummaryChainGroup.renderAndExecute(
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

  addConversationSummary(fromCharacterPerspective.id, conversationSummaryEntry);

  const newRollingConversationSummaries =
    useScenarioCharacterStore.getState().scenarioCharactersById[fromCharacterPerspective.id]!
      .rollingConversationSummaries;

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

    const initialPairwiseRelationship = await getCharacterRelationship(
      fromCharacterPerspective.id,
      otherCharacter.id
    );

    const isOffscreenMention = offscreenMentionedCharacters.some(
      (mentioned) => mentioned.id === otherCharacter.id
    );

    const shouldAppendConversationSummary = !isOffscreenMention;

    if (shouldAppendConversationSummary) {
      await addPairwiseConversationSummary(initialPairwiseRelationship, conversationSummaryEntry);
    }

    let newLearnedInformation: OffscreenLearnedInformation | undefined;

    if (isOffscreenMention) {
      const extractedInformation = await offscreenMemoryExtractionChainGroup.renderAndExecute(
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

        await addPairwiseLearnedInformation(initialPairwiseRelationship, newLearnedInformation);

        const replacementConversationGoal =
          await offscreenMemoryUpdateConversationGoalChainGroup.renderAndExecute(
            await buildOffscreenMemoryUpdateConversationGoalContext(
              fromCharacterPerspective.id,
              otherCharacter.id,
              extractedInformation
            )
          );

        if (replacementConversationGoal) {
          await saveRelationshipFields(initialPairwiseRelationship, {
            nextConversationGoal: replacementConversationGoal,
          });
        }

        const newPairwiseMemory = await rollingPairwiseMemoryRewriteChainGroup.renderAndExecute(
          await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id)
        );

        await saveRelationshipFields(initialPairwiseRelationship, {
          memory: newPairwiseMemory,
        });

        const updatedRelationshipDescriptor = await relationshipDescriptorUpdateChainGroup.renderAndExecute(
          await buildTargetedChatTemplateContext(fromCharacterPerspective.id, otherCharacter.id)
        );

        await saveRelationshipFields(initialPairwiseRelationship, {
          descriptor: updatedRelationshipDescriptor,
        });

        const updatedPairwiseRelationship = await getCharacterRelationship(
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

    const pairwiseContext = await buildTargetedChatTemplateContext(
      fromCharacterPerspective.id,
      otherCharacter.id
    );

    const newConversationGoal = await nextConversationGoalUpdatesChainGroup.renderAndExecute(pairwiseContext);

    await saveRelationshipFields(initialPairwiseRelationship, {
      nextConversationGoal: newConversationGoal,
    });

    const newMemory = await rollingPairwiseMemoryRewriteChainGroup.renderAndExecute(pairwiseContext);

    await saveRelationshipFields(initialPairwiseRelationship, {
      memory: newMemory,
    });

    const newRelationshipDescriptor =
      await relationshipDescriptorUpdateChainGroup.renderAndExecute(pairwiseContext);

    const familiarity = calculateInteractionUpdatedFamiliarity(
      initialPairwiseRelationship,
      fromCharacterPerspective.id === userCharacterId || otherCharacter.id === userCharacterId,
      useSettingsStore.getState().userFamiliarityInteractionMultiplier
    );

    await saveRelationshipFields(initialPairwiseRelationship, {
      familiarity: familiarity.new,
      descriptor: newRelationshipDescriptor,
    });

    const updatedPairwiseRelationship = await getCharacterRelationship(
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

  const oldGlobalMemory = fromCharacterPerspective.globalMemories;
  const newGlobalMemory = await rollingGlobalMemoryRewriteChainGroup.renderAndExecute(
    await buildFocusedChatTemplateContext(fromCharacterPerspective.id)
  );

  await saveScenarioCharacterFields(fromCharacterPerspective.id, {
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
    const participant = getActiveChatParticipants().find((entry) => entry.id === characterId);
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
