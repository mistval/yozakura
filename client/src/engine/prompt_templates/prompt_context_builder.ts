import { assertNonNullish } from '../../errors/application_error.js';
import type { Character, CharacterRelationship } from '../types.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import { buildAppearanceTags } from '../image_gen.js';
import {
  getActiveChatGossipCharacter,
  getActiveChatMedium,
  getActiveChatParticipants,
  useActiveChatStore,
} from '../../state/active_chat_store.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import type {
  CharacterEditorExecutionContext,
  ContextCharacter,
  ConversationExecutionContext,
  FocusedConversationExecutionContext,
  GlobalExecutionContext,
  MemoryRagExectionContext,
  ModerationNextSpeakerExecutionContext,
  ScenarioExecutionContext,
  TargetedConversationExecutionContext,
} from './prompt_template_context_fields.js';
import { useSettingsStore } from '../../state/settings_store.js';
import { generatePersonalityTraits } from '../../util/personality.js';
import { getCharacterMovementConstraint } from '../character_schedule/get_scheduled_move.js';
import _ from 'lodash';

const globalWritableContext = {};

function toContextCharacter(character: Character): ContextCharacter {
  return {
    ...character,
    xmlTagSafeName: `${character.firstName}_${character.lastName}`.toLowerCase().replaceAll(/\s+/g, '_'),
  };
}

function formatPairwiseMemoriesForPrompt(
  relationship: CharacterRelationship,
  focusedCharacter: ContextCharacter,
  targetCharacter: ContextCharacter,
  allCharacters: ContextCharacter[]
): string {
  const informationText = relationship.rollingPairwiseSummaries
    .map((summaryEntry) => {
      const participantNames = summaryEntry.participantIds.map(
        (id) => allCharacters.find((p) => p.id === id)?.firstName || 'Unknown Person'
      );

      return {
        content: `<information>
Type: Conversation Summary (summary of a conversation between ${participantNames.join(', ')})
Conversation medium: ${summaryEntry.chatMedium}
Summary:
${summaryEntry.summary}
</information>`,
        createdAt: summaryEntry.createdAt,
      };
    })
    .concat(
      relationship.rollingOffscreenLearnedInformation.map((informationEntry) => ({
        content: `<information>
Type: Gossip Information (memories about ${targetCharacter.firstName} that ${focusedCharacter.firstName} acquired during conversations that ${targetCharacter.firstName} was absent from, but in which they were spoken about)
Source: ${informationEntry.source ?? 'Unknown'}
Information: ${informationEntry.information}
</information>`,
        createdAt: informationEntry.createdAt,
      }))
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => entry.content)
    .join('\n\n');

  return `<informations>
${informationText}
</informations>`;
}

function formatGlobalMemoriesForPrompt(
  focusedCharacter: ContextCharacter,
  allCharacters: ContextCharacter[]
): string {
  const summariesText = Array.from(focusedCharacter.rollingConversationSummaries)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => {
      const participantNames = entry.participantIds.map(
        (id) => allCharacters.find((p) => p.id === id)?.firstName || 'Unknown Person'
      );
      return `<summary>
Conversation participants: ${participantNames.join(', ')}
Conversation medium: ${entry.chatMedium}):
Conversation summary:
${entry.summary}
</summary>`;
    })
    .join('\n\n');

  return `<summaries>
${summariesText || '(none yet)'}
</summaries>`;
}

function buildGlobalTemplateContext(): GlobalExecutionContext {
  return {
    settings: _.omitBy(useSettingsStore.getState(), _.isFunction),
    globalWritableContext,
  };
}

function buildScenarioTemplateContext(): ScenarioExecutionContext {
  const scenarioStore = useScenarioStore.getState();
  const scenarioCharacterStore = useScenarioCharacterStore.getState();

  const userCharacter =
    scenarioCharacterStore.scenarioCharactersById[scenarioStore.activeScenario?.userCharacterId || ''];
  assertNonNullish(userCharacter, 'User character not found in scenario characters');

  if (!scenarioStore.activeScenario || !scenarioStore.activeScenarioMap) {
    throw new Error('Failed to build scenario context. Scenario or active map not found');
  }

  return {
    ...buildGlobalTemplateContext(),
    allCharacters: Object.values(scenarioCharacterStore.scenarioCharactersById).map(toContextCharacter),
    userCharacter: toContextCharacter(userCharacter),
    scenario: scenarioStore.activeScenario,
    worldMap: scenarioStore.activeScenarioMap,
    getRelationship: (characterAId: string, characterBId: string) =>
      useScenarioCharacterRelationshipStore.getState().getCharacterRelationship(characterAId, characterBId),
  };
}

async function buildChatTemplateContext(focusedCharacter?: Character): Promise<ConversationExecutionContext> {
  const activeChatStore = useActiveChatStore.getState();
  const scenarioCharacterStore = useScenarioCharacterStore.getState();

  if (!activeChatStore.isActive()) {
    throw new Error('buildChatTemplateContext() should only be called when a chat is active');
  }

  assertNonNullish(activeChatStore.transcript, 'Expected transcript for active chat context');

  const mentionedOffscreenCharacterIds =
    activeChatStore.transcript.getAllMentionedOffscreenRaggedCharacterIds();
  const raggedCharacters = mentionedOffscreenCharacterIds
    .map((id) => scenarioCharacterStore.scenarioCharactersById[id])
    .filter((char): char is Character => char !== undefined);

  const { gossipTargetCharacter, gossipTargetRelationship } = await getActiveChatGossipCharacter(
    focusedCharacter?.id
  );

  return {
    ...(await buildScenarioTemplateContext()),
    participants: getActiveChatParticipants().map(toContextCharacter),
    chatMedium: getActiveChatMedium(),
    raggedCharacters: raggedCharacters.map(toContextCharacter),
    transcript: activeChatStore.transcript.toTextTranscript(focusedCharacter?.id),
    conversationMessages: activeChatStore.transcript.getRawMessages(),
    gossipTargetCharacter: gossipTargetCharacter ? toContextCharacter(gossipTargetCharacter) : undefined,
    gossipTargetRelationship,
    chatInstructions: activeChatStore.chatInstructions,
  };
}

export async function buildFocusedChatTemplateContext(
  focusedCharacterId: string
): Promise<FocusedConversationExecutionContext> {
  const scenarioCharacterStore = useScenarioCharacterStore.getState();
  const focusedCharacter = scenarioCharacterStore.scenarioCharactersById[focusedCharacterId];
  assertNonNullish(focusedCharacter, 'Focused character not found in scenario characters');

  const chatTemplateContext = await buildChatTemplateContext(focusedCharacter);
  const currentLocation = useActiveChatStore.getState().getChatCharacterLocation(focusedCharacter.id);
  assertNonNullish(currentLocation, 'currentLocation not found');

  return {
    ...chatTemplateContext,
    currentLocation,
    focusedCharacter: toContextCharacter(focusedCharacter),
    focusedCharacterAppearance: buildAppearanceTags(focusedCharacter),
    rollingConversationSummariesText: formatGlobalMemoriesForPrompt(
      toContextCharacter(focusedCharacter),
      chatTemplateContext.allCharacters
    ),
    focusedCharacterChatInstructions:
      useActiveChatStore.getState().chatInstructionsByCharacterId[focusedCharacter.id] ?? '',
    characterMovementConstraint: getCharacterMovementConstraint(focusedCharacter),
  };
}

export async function buildTargetedChatTemplateContext(
  focusedCharacterId: string,
  targetCharacterId: string
): Promise<TargetedConversationExecutionContext> {
  const scenarioCharacterStore = useScenarioCharacterStore.getState();
  const focusedCharacter = scenarioCharacterStore.scenarioCharactersById[focusedCharacterId];
  const targetCharacter = scenarioCharacterStore.scenarioCharactersById[targetCharacterId];

  assertNonNullish(focusedCharacter, 'Focused character not found in scenario characters');
  assertNonNullish(targetCharacter, 'Target character not found in scenario characters');

  const focusedContext = await buildFocusedChatTemplateContext(focusedCharacterId);

  return {
    ...focusedContext,
    targetCharacter: toContextCharacter(targetCharacter),
    targetCharacterRelationship: await useScenarioCharacterRelationshipStore
      .getState()
      .getCharacterRelationship(focusedCharacter.id, targetCharacter.id),
    targetCharacterFormattedRollingMemoriesText: formatPairwiseMemoriesForPrompt(
      await useScenarioCharacterRelationshipStore
        .getState()
        .getCharacterRelationship(focusedCharacter.id, targetCharacter.id),
      toContextCharacter(focusedCharacter),
      toContextCharacter(targetCharacter),
      focusedContext.allCharacters
    ),
  };
}

export function buildCharacterEditorContext(focusedCharacter: Character): CharacterEditorExecutionContext {
  return {
    ...buildGlobalTemplateContext(),
    randomPersonalityTraits: generatePersonalityTraits(),
    focusedCharacter: toContextCharacter(focusedCharacter),
  };
}

export async function buildChatModeratorContext(
  speakerCandidates: Character[]
): Promise<ModerationNextSpeakerExecutionContext> {
  return {
    ...(await buildChatTemplateContext()),
    speakerCandidates: speakerCandidates.map(toContextCharacter),
  };
}

export async function buildOffscreenMemoryUpdateConversationGoalContext(
  fromCharacterId: string,
  toCharacterId: string,
  candidateInformation: string
) {
  return {
    ...(await buildTargetedChatTemplateContext(fromCharacterId, toCharacterId)),
    candidateInformation,
  };
}

export async function buildMemoryRagTemplateContext(
  focusedCharacter: Character,
  mentionedCharacter: Character,
  mentionedByCharacter: Character
): Promise<MemoryRagExectionContext> {
  return {
    ...(await buildTargetedChatTemplateContext(focusedCharacter.id, mentionedCharacter.id)),
    mentionedByCharacter: toContextCharacter(mentionedByCharacter),
  };
}
