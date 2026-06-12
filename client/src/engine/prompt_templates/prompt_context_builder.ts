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
  CharacterEditorContext,
  ContextCharacter,
  ConversationExecutionContext,
  FocusedConversationExecutionContext,
  GlobalExecutionContext,
  ScenarioExecutionContext,
  TargetedConversationContext,
} from './prompt_template_context_fields.js';
import { useSettingsStore } from '../../state/settings_store.js';
import { generatePersonalityTraits } from '../../util/personality.js';
import _ from 'lodash';

const globalWritableContext = {};

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
    allCharacters: Object.values(scenarioCharacterStore.scenarioCharactersById),
    userCharacter,
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

  return {
    ...(await buildScenarioTemplateContext()),
    participants: getActiveChatParticipants(),
    chatMedium: getActiveChatMedium(),
    raggedCharacters,
    transcript: activeChatStore.transcript.toTextTranscript(focusedCharacter?.id),
    conversationMessages: activeChatStore.transcript.getRawMessages(),
    ...(await getActiveChatGossipCharacter(focusedCharacter?.id)),
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
    focusedCharacter: focusedCharacter,
    focusedCharacterAppearance: buildAppearanceTags(focusedCharacter),
    rollingConversationSummariesText: formatGlobalMemoriesForPrompt(
      focusedCharacter,
      chatTemplateContext.allCharacters
    ),
  };
}

export async function buildTargetedChatTemplateContext(
  focusedCharacterId: string,
  targetCharacterId: string
): Promise<TargetedConversationContext> {
  const scenarioCharacterStore = useScenarioCharacterStore.getState();
  const focusedCharacter = scenarioCharacterStore.scenarioCharactersById[focusedCharacterId];
  const targetCharacter = scenarioCharacterStore.scenarioCharactersById[targetCharacterId];

  assertNonNullish(focusedCharacter, 'Focused character not found in scenario characters');
  assertNonNullish(targetCharacter, 'Target character not found in scenario characters');

  const focusedContext = await buildFocusedChatTemplateContext(focusedCharacterId);

  return {
    ...focusedContext,
    targetCharacter,
    targetCharacterRelationship: await useScenarioCharacterRelationshipStore
      .getState()
      .getCharacterRelationship(focusedCharacter.id, targetCharacter.id),
    targetCharacterFormattedRollingMemoriesText: formatPairwiseMemoriesForPrompt(
      await useScenarioCharacterRelationshipStore
        .getState()
        .getCharacterRelationship(focusedCharacter.id, targetCharacter.id),
      focusedCharacter,
      targetCharacter,
      focusedContext.allCharacters
    ),
  };
}

export function buildCharacterEditorContext(focusedCharacter: Character): CharacterEditorContext {
  return {
    ...buildGlobalTemplateContext(),
    randomPersonalityTraits: generatePersonalityTraits(),
    focusedCharacter,
  };
}

export async function buildChatModeratorContext(speakerCandidates: Character[]) {
  return {
    ...(await buildChatTemplateContext()),
    speakerCandidates,
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
