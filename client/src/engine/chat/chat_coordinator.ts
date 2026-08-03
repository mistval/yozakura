import { assert, assertNonNullish } from '../../errors/application_error';
import { chatCompletion } from '../llm.js';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry.js';
import { buildFullPrompt, generateChatImage } from '../image_gen.js';
import {
  buildChatModeratorContext,
  buildConversationEndJudgeContext,
  buildFocusedChatTemplateContext,
} from '../prompt_templates/prompt_context_builder';
import { decideIntelligentChatEnd, type ChatEndDecision } from './intelligent_chat_end';
import { useSettingsStore, type SpeakerSelectionMode } from '../../state/settings_store.js';
import * as Database from '../../backend_bridge/database.js';
import type { Character, ChatMessage, EphemeralLocation, StoredConversation } from '../types';
import { getRequiredActiveScenario } from '../../state/scenario_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store.js';
import { ConversationTranscript } from './transcript';
import {
  getActiveChatMedium,
  getActiveChatParticipants,
  getAllActiveChatSpeakers,
  useTurnMachineStore,
  type StartChatSessionArgs,
} from '../../state/turn_machine_store';
import { chatSceneImageChainGroup } from '../prompt_templates/chat/chat_scene_image';
import { moderationNextSpeakerTemplatesGroup } from '../prompt_templates/chat/moderation_next_speaker';
import { conversationEndJudgeTemplatesGroup } from '../prompt_templates/chat/conversation_end_judge';
import { chatSystemPromptChain } from '../prompt_templates/chat/chat_system_prompt';
import { newId } from '../../util/id';
import { buildConversationStateUpdates, generateCharacterEndOfChatUpdates } from './post_chat_memories';
import { wait } from '../../util/promise';
import { getRequiredRandomChoice } from '../../util/array';
import { withPhaseTransitionGate } from '../../util/phase_transition_gate';
import { rethrowSignalException } from '../scenario_loop/flow_control';

export class ChatCoordinator {
  public static async prepareChatStart(participantIds: string[]): Promise<StartChatSessionArgs> {
    assert(participantIds.length >= 2, 'At least two participants are required to initialize chat');

    const participants = useScenarioCharacterStore.getState().getCharactersByIds(participantIds);
    const firstParticipant = participants[0];
    assertNonNullish(firstParticipant);

    const gossipTargetCharacterId = await this.selectChatStartGossipTargetCharacterId(
      participantIds,
      getRequiredActiveScenario().userCharacterId
    );

    return {
      participantIds,
      initiatorId: firstParticipant.id,
      gossipTargetCharacterId,
    };
  }

  public static async shouldEndNpcChat(fromCharacterPerspectiveId: string): Promise<boolean> {
    const chatState = this.turnMachineStore();
    const settings = useSettingsStore.getState();

    if (chatState.userIsParticipant() || this.isChatPaused()) {
      return false;
    }

    const currentLength = this.countChatMessages();
    const isGroup = chatState.participantIds.length > 2;

    if (settings.npcChatEndMode === 'fixed') {
      const limit = isGroup ? settings.groupChatMessageLimit : settings.richNpcMessageCount * 2;
      return currentLength >= limit;
    }

    const targetLength = isGroup
      ? settings.intelligentChatEndGroupTargetLength
      : settings.intelligentChatEndTargetLength;

    const minLength = isGroup
      ? settings.intelligentChatEndGroupMinLength
      : settings.intelligentChatEndMinLength;
    const maxLength = isGroup
      ? settings.intelligentChatEndGroupMaxLength
      : settings.intelligentChatEndMaxLength;

    const decision = await decideIntelligentChatEnd({
      currentLength,
      minLength,
      maxLength,
      judgementInterval: settings.intelligentChatEndJudgementInterval,
      runJudge: () =>
        this.runConversationEndJudge(fromCharacterPerspectiveId, {
          targetLength,
          maxLength,
          currentLength,
          historyLength: settings.intelligentChatEndJudgeHistoryLength,
        }),
    });

    return decision === 'stop';
  }

  private static runConversationEndJudge(
    fromPerspectiveId: string,
    lengthParameters: {
      targetLength: number;
      maxLength: number;
      currentLength: number;
      historyLength: number;
    }
  ): Promise<ChatEndDecision> {
    return this.turnMachineStore().doWithState('judging_conversation_end', () => {
      return withPhaseTransitionGate(
        async (abortSignal) => {
          return conversationEndJudgeTemplatesGroup.renderAndExecute(
            await buildConversationEndJudgeContext(fromPerspectiveId, lengthParameters),
            { abortSignal }
          );
        },
        { pauseBehavior: 'abort' }
      );
    });
  }

  public static deactivate() {
    this.turnMachineStore().deactivateChat();
  }

  public static addParticipant(participantId: string) {
    return this.turnMachineStore().addChatParticipant(participantId);
  }

  public static removeParticipant(participantId: string) {
    if (participantId === this.userCharacterId()) {
      useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('paused');
    }

    return this.turnMachineStore().removeChatParticipant(participantId);
  }

  public static setStateAwaitingCharacterInput() {
    this.turnMachineStore().setStateAwaitingCharacterInput();
  }

  public static setEphemeralLocation(setter: (prev: EphemeralLocation) => EphemeralLocation) {
    this.turnMachineStore().setEphemeralLocation(setter);
  }

  public static setChatInstructions(instructions: string) {
    this.turnMachineStore().setChatInstructions(instructions);
  }

  public static setCharacterChatInstructions(characterId: string, instructions: string) {
    this.turnMachineStore().setCharacterChatInstructions(characterId, instructions);
  }

  public static deleteMessageById(messageId: string) {
    const { deletedMessage, updatedTranscript } = this.transcript().deleteMessageById(messageId);
    this.setTranscript(updatedTranscript);

    return deletedMessage;
  }

  public static deleteMessagesAboveAndIncluding(messageId: string) {
    const { newTranscript, deletedMessage } = this.transcript().deleteMessagesAboveAndIncluding(messageId);
    this.setTranscript(newTranscript);

    return {
      deletedMessageSpeakerId: deletedMessage.associatedCharacter?.id,
    };
  }

  public static async editMessageById(id: string, newContent: string) {
    const { updatedTranscript } = this.transcript().editMessageById(id, newContent);
    this.setTranscript(updatedTranscript);
  }

  public static async addCharacterMessage(
    senderId: string,
    message: string,
    options: { forceSkipAutoImage?: boolean } = {}
  ) {
    const sender = this.getCharacterById(senderId);
    const { updatedTranscript, newRawMessage } = this.transcript().addCharacterChatMessage(message, sender);

    this.setTranscript(updatedTranscript);

    if (!options.forceSkipAutoImage) {
      await this.maybeGenerateAutoImageForMessage(newRawMessage);
    }
  }

  public static hasUserChatMessages() {
    const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
    return userCharacter && this.transcript().hasMessagesFromCharacter(userCharacter.id);
  }

  public static async buildSceneImagePromptForRequest(afterMessageId: string | undefined) {
    const imageCharacterId = afterMessageId
      ? this.transcript().getMessageById(afterMessageId)!.asCharacterChatMessage().senderId
      : (this.transcript().getMostRecentSpeakerId() ?? this.firstNonUserParticipantId());

    return this.buildSceneImageFullPrompt(imageCharacterId, { upToMessageId: afterMessageId });
  }

  private static firstNonUserParticipantId(): string {
    const userCharacterId = this.getUserCharacter().id;
    const participant = getActiveChatParticipants().find((p) => p.id !== userCharacterId);
    assertNonNullish(participant, 'No non-user participant available for image generation');
    return participant.id;
  }

  public static async buildSceneImageFullPrompt(
    primaryCharacterId: string,
    opts?: { upToMessageId?: string | undefined }
  ) {
    return this.turnMachineStore().doWithState('generating_image', async () => {
      return withPhaseTransitionGate(
        async (abortSignal) => {
          const primaryCharacter = this.getCharacterById(primaryCharacterId);
          const generatedScenePrompt = await chatSceneImageChainGroup.renderAndExecute(
            await buildFocusedChatTemplateContext(primaryCharacter.id, undefined, opts),
            { abortSignal }
          );

          return buildFullPrompt(primaryCharacter, generatedScenePrompt);
        },
        { pauseBehavior: 'ignore' }
      );
    });
  }

  public static async generateImageFromPrompt(
    fullPrompt: string,
    opts?: { afterMessageId?: string | undefined }
  ) {
    return this.turnMachineStore().doWithState('generating_image', async () => {
      return withPhaseTransitionGate(
        async (abortSignal) => {
          const saveTo = `scenario/${getRequiredActiveScenario().id}/chat_images/${newId()}.png`;
          const files = await generateChatImage({
            fullPrompt,
            saveTo,
            abortSignal,
          });

          const firstFile = files[0];
          assertNonNullish(firstFile, 'No file returned from image generation call');

          this.setTranscript(this.transcript().addImageMessage(firstFile, opts).updatedTranscript);
        },
        { pauseBehavior: 'ignore' }
      );
    });
  }

  public static async endActiveChat(noEffect: boolean) {
    const scenario = getRequiredActiveScenario();

    if (!noEffect) {
      const characterStore = useScenarioCharacterStore.getState();
      const relationshipStore = useScenarioCharacterRelationshipStore.getState();
      const characterUpdates: Array<Awaited<ReturnType<typeof generateCharacterEndOfChatUpdates>>> = [];

      try {
        for (const participant of getAllActiveChatSpeakers()) {
          if (participant.id !== this.getUserCharacter().id) {
            characterUpdates.push(
              await generateCharacterEndOfChatUpdates(participant, (statusInfo) =>
                this.setStateProcessingMemories(statusInfo)
              )
            );
          }
        }

        await Promise.all([characterStore.commitAllChanges(), relationshipStore.commitAllChanges()]);
      } catch {
        await Promise.all([
          characterStore.discardPendingChanges(),
          relationshipStore.discardPendingChanges(),
        ]);
      }

      const conversationLog: StoredConversation = Database.createPersistedObject({
        serializedTranscript: this.transcript().serialize(),
        label: this.getPastTenseLabel(),
        characterUpdates,
        stateUpdates: buildConversationStateUpdates(characterUpdates),
        turnNumber: scenario.turnNumber,
      });

      void Database.doAsDataWrite(
        async () => {
          await Database.storeConversation(scenario.id, conversationLog);
        },
        'conversation',
        {
          debouncerKey: conversationLog.id,
        }
      );
    }

    this.deactivate();
  }

  public static async speakAsNpc(npcId: string) {
    const speaker = useScenarioCharacterStore.getState().getRequiredCharacterById(npcId);
    const wasPaused = this.isChatPaused();
    const completionRequestId = newId();

    const promptContext = await buildFocusedChatTemplateContext(speaker.id);
    const renderedPrompts = await chatSystemPromptChain.render(promptContext, {
      completionRequestId,
    });

    const aiPromptMessages = await this.transcript().toAIPromptMessages(speaker.id);
    const prompts = [renderedPrompts[0]!].concat(aiPromptMessages);

    if (aiPromptMessages.length > 0) {
      prompts.push(renderedPrompts[1]!);
    }

    const userNudgePrompt = renderedPrompts[2];
    if (userNudgePrompt?.content) {
      prompts.push(userNudgePrompt);
    }

    const tokenStreamingEnabled = useSettingsStore.getState().tokenStreamingEnabled;

    return useTurnMachineStore.getState().doWithState('character_speaking', async () => {
      return withPhaseTransitionGate(
        async (abortSignal) => {
          if (!tokenStreamingEnabled) {
            const response = await chatCompletion(prompts, {
              promptTemplateGroup: 'gen_npc_response',
              completionRequestId,
              promptContext,
              abortSignal,
            });

            const parsedResponse = await chatSystemPromptChain.parse(response, promptContext, {
              completionRequestId,
            });

            const didPause = !wasPaused && this.isChatPaused();

            await this.addCharacterMessage(speaker.id, parsedResponse, { forceSkipAutoImage: didPause });
            await this.pauseAfterNpcOnlyMessage();

            return this.transcript;
          }

          const draftMessage = await this.startStreamingNpcDraftMessage(speaker);

          try {
            const response = await chatCompletion(prompts, {
              promptTemplateGroup: 'gen_npc_response',
              promptContext,
              completionRequestId,
              abortSignal,
              onTokens: async (fullText: string) => {
                this.setTranscript(
                  this.transcript().editLatestMessage(fullText, { isStreaming: true }).updatedTranscript
                );
              },
            });

            const parsedResponse = await chatSystemPromptChain.parse(response, promptContext, {
              completionRequestId,
            });

            const didPause = !wasPaused && this.isChatPaused();

            // Delete and re-add. Slightly hacky way to trigger auto image and other effects.
            this.deleteMessageById(draftMessage.id);
            await this.addCharacterMessage(speaker.id, parsedResponse, { forceSkipAutoImage: didPause });

            await this.pauseAfterNpcOnlyMessage();

            return this.transcript;
          } catch (err) {
            this.deleteMessageById(draftMessage.id);
            throw err;
          }
        },
        { pauseBehavior: 'ignore' }
      );
    });
  }

  public static getSpeakerSelectionMode(): SpeakerSelectionMode {
    return useSettingsStore.getState().speakerSelectionMode;
  }

  public static isChatPaused(): boolean {
    return useScenarioLoopStateStore.getState().userRequestedPhaseTransition === 'paused';
  }

  public static async selectNextSpeaker(opts?: {
    notSpeakerId?: string | undefined;
    forcedSpeakerId?: string | undefined;
  }): Promise<Character> {
    if (opts?.forcedSpeakerId) {
      return this.getCharacterById(opts.forcedSpeakerId);
    }

    if (this.isChatPaused()) {
      return this.getUserCharacter();
    }

    assert(
      getActiveChatParticipants().length >= 2,
      'Trying to select next speaker in chat with less than 2 participants'
    );

    const selectionMode = this.getSpeakerSelectionMode();
    const participants = getActiveChatParticipants();
    const excludedSpeakerId = opts?.notSpeakerId;
    const nonExcludedParticipants = participants.filter((p) => p.id !== excludedSpeakerId);

    try {
      // If it's the first message, return the initiator (unless they are specifically excluded)
      if (!this.transcript().hasCharacterMessages()) {
        if (excludedSpeakerId !== this.initiatorId()) {
          const initiator = this.initiator();
          if (initiator) {
            return initiator;
          }
        } else {
          const firstAvailable = nonExcludedParticipants[0];
          assertNonNullish(firstAvailable, 'No available participant for first message speaker selection');
          return firstAvailable;
        }
      }

      const mostRecentSpeakerId = this.transcript().getMostRecentSpeakerId();
      assertNonNullish(
        mostRecentSpeakerId,
        'Expected next speaker since we established that this is not the first message'
      );

      const speakerCandidates = nonExcludedParticipants.filter(
        (participant) => participant.id !== mostRecentSpeakerId
      );

      // If there are no candidates, we must be in a two-person chat and
      // a notSpeakerId must have been specified. We'll return the
      // most recent speaker for lack of a better option besides
      // maybe throwing
      if (speakerCandidates.length === 0) {
        assertNonNullish(opts?.notSpeakerId, 'expected not speaker');
        assert(getActiveChatParticipants().length === 2, 'expected 2 participants');
        return this.getCharacterById(mostRecentSpeakerId);
      }

      // If there's only one candidate, easy choice
      if (speakerCandidates.length === 1) {
        return speakerCandidates[0]!;
      }

      // If we're in round robin mode, scan over the transcript backwards and figure out who
      // spoke least recently
      if (selectionMode === 'round_robin') {
        const quietestSpeakerId = this.transcript().getRecentlyQuietSpeakerId(
          speakerCandidates.map((s) => s.id)
        );

        const chosenCandidate = participants.find((participant) => participant.id === quietestSpeakerId);
        assertNonNullish(chosenCandidate, 'No round robin fallback speaker available');
        return chosenCandidate;
      }

      if (selectionMode === 'intelligent') {
        return useTurnMachineStore.getState().doWithState('selecting_speaker', async () => {
          return withPhaseTransitionGate(
            async (abortSignal) => {
              const moderatorSelectedSpeakerId = await moderationNextSpeakerTemplatesGroup.renderAndExecute(
                await buildChatModeratorContext(speakerCandidates),
                { abortSignal }
              );

              if (moderatorSelectedSpeakerId) {
                const character = speakerCandidates.find((s) => s.id === moderatorSelectedSpeakerId);

                if (character) {
                  return character;
                }
              }

              // If moderator didn't select a speaker or selected one not in the chat,
              // select randomly.
              return getRequiredRandomChoice(speakerCandidates);
            },
            { pauseBehavior: 'abort' }
          );
        });
      }

      assert(
        false,
        'Reached end of selectNextSpeaker function unexpectedly. Unknown speaker selection strategy?'
      );
    } catch (err) {
      await showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'select_next_speaker',
        hint: 'Control will be handed to first participant',
      });

      return participants[0]!;
    }
  }

  public static countChatMessages() {
    return this.transcript().countCharacterChatMessages();
  }

  private static setStateProcessingMemories(statusInfo: string) {
    this.turnMachineStore().setStateProcessingMemories(statusInfo);
  }

  private static turnMachineStore() {
    return useTurnMachineStore.getState();
  }

  private static userCharacterId() {
    return getRequiredActiveScenario().userCharacterId;
  }

  private static setTranscript(transcript: ConversationTranscript) {
    this.turnMachineStore().setTranscript(transcript);
  }

  private static transcript() {
    const { transcript } = this.turnMachineStore();
    assertNonNullish(transcript, 'Transcript is not initialized');

    return transcript;
  }

  private static async pauseAfterNpcOnlyMessage() {
    if (this.turnMachineStore().userIsParticipant()) {
      return;
    }

    const delaySeconds = useSettingsStore.getState().npcOnlyChatDelay;
    if (delaySeconds <= 0) {
      return;
    }

    if (this.isChatPaused()) {
      return;
    }

    await wait(delaySeconds * 1000);
  }

  private static getPastTenseLabel() {
    const participants = getActiveChatParticipants({
      includeRemoved: true,
    });

    if (participants.length === 2) {
      const verb = getActiveChatMedium() === 'in_person' ? 'spoke to' : 'remote chatted with';
      return `${participants[0]!.firstName} ${verb} ${participants[1]!.firstName}`;
    } else {
      const textPart = getActiveChatMedium() === 'in_person' ? '' : 'text ';
      return `Group ${textPart}chat: ${participants.map((entry) => entry.firstName).join(', ')}`;
    }
  }

  private static async startStreamingNpcDraftMessage(sender: Character) {
    const { updatedTranscript, newRawMessage } = this.transcript().addCharacterChatMessage('', sender, {
      isStreaming: true,
    });

    this.setTranscript(updatedTranscript);

    return newRawMessage;
  }

  private static async maybeGenerateAutoImageForMessage(
    chatMessage: Extract<ChatMessage, { messageType: 'chat_message' }>
  ) {
    try {
      const settings = useSettingsStore.getState();

      if (Math.random() >= settings.autoImageRate) {
        return;
      }

      const autoImageNpcOnly = settings.autoImageNpcOnly;
      if (autoImageNpcOnly && this.turnMachineStore().userIsParticipant()) {
        return;
      }

      const fullPrompt = await this.buildSceneImageFullPrompt(chatMessage.senderId);
      await this.generateImageFromPrompt(fullPrompt);
    } catch (err) {
      rethrowSignalException(err);

      await showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'auto_image.generate',
      });
    }
  }

  private static selectChatStartGossipTargetCharacterId(participantIds: string[], userCharacterId: string) {
    const settings = useSettingsStore.getState();
    if (Math.random() >= settings.gossipRate) {
      return Promise.resolve(undefined);
    }

    const gossipSourceId = participantIds.find((id) => id !== this.getUserCharacter().id);
    assertNonNullish(gossipSourceId, 'Could not get a gossip source ID');

    return Database.doAsDataRead(() => {
      return Database.loadWeightedGossipTargetCharacterId(
        gossipSourceId,
        participantIds,
        userCharacterId,
        settings.userGossipChanceMultiplier,
        settings.familiarityWeightMultiplier
      );
    }, 'gossip_target_query');
  }

  private static getCharacterById(characterId: string): Character {
    const character = useScenarioCharacterStore.getState().scenarioCharactersById[characterId];
    assertNonNullish(character, `Character with ID ${characterId} not found`);
    return character;
  }

  private static getUserCharacter(): Character {
    return this.getCharacterById(this.userCharacterId());
  }

  private static initiatorId() {
    return this.turnMachineStore().initiatorId;
  }

  private static initiator() {
    return getActiveChatParticipants().find((p) => p.id === this.initiatorId());
  }
}
