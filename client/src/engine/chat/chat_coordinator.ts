import { assert, assertNonNullish } from '../../errors/application_error';
import { chatCompletion } from '../llm.js';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry.js';
import { buildFullPrompt, generateChatImage } from '../image_gen.js';
import {
  buildChatModeratorContext,
  buildFocusedChatTemplateContext,
  buildMemoryRagTemplateContext,
} from '../prompt_templates/prompt_context_builder';
import { useSettingsStore, type SpeakerSelectionMode } from '../../state/settings_store.js';
import * as Database from '../../backend_bridge/database.js';
import type { Character, ChatMessage, EphemeralLocation, StoredConversation } from '../types';
import { getRequiredActiveScenario } from '../../state/scenario_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { ConversationTranscript } from './transcript';
import {
  clearPersistedActiveChat,
  getActiveChatMedium,
  getActiveChatParticipants,
  getAllActiveChatSpeakers,
  useActiveChatStore,
} from '../../state/active_chat_store';
import { chatSceneImageChainGroup } from '../prompt_templates/chat/chat_scene_image';
import { moderationNextSpeakerTemplatesGroup } from '../prompt_templates/chat/moderation_next_speaker';
import { chatSystemPromptChain } from '../prompt_templates/chat/chat_system_prompt';
import { memoryRagPromptTemplatesGroup } from '../prompt_templates/chat/memory_rag_prompt';
import { newId } from '../../util/id';
import { buildConversationStateUpdates, generateCharacterEndOfChatUpdates } from './post_chat_memories';
import { wait } from '../../util/promise';
import { getRequiredRandomChoice } from '../../util/array';

export class ChatCoordinator {
  public static async activate(participantIds: string[]) {
    assert(participantIds.length >= 2, 'At least two participants are required to initialize chat');
    assert(this.activeChatStore().chatState === 'inactive', 'Already active');

    const scenarioCharacterState = useScenarioCharacterStore.getState();

    const participants = scenarioCharacterState.getCharactersByIds(participantIds);
    const firstParticipant = participants[0];
    assertNonNullish(firstParticipant);

    const gossipTargetCharacterId = await this.selectChatStartGossipTargetCharacterId(
      participantIds,
      getRequiredActiveScenario().userCharacterId
    ).catch((err) => {
      showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'get_gossip_target',
      });

      return undefined;
    });

    this.activeChatStore().activate({
      participantIds,
      initiatorId: firstParticipant.id,
      gossipTargetCharacterId,
    });
  }

  public static deactivate() {
    this.activeChatStore().deactivate();
  }

  public static addParticipant(participantId: string) {
    return this.activeChatStore().addChatParticipant(participantId);
  }

  public static removeParticipant(participantId: string) {
    return this.activeChatStore().removeChatParticipant(participantId);
  }

  public static setStateAwaitingUserInput() {
    this.activeChatStore().setStateAwaitingUserInput();
  }

  public static setStateNpcSpeaking() {
    this.activeChatStore().setStateNpcSpeaking();
  }

  public static setEphemeralLocation(setter: (prev: EphemeralLocation) => EphemeralLocation) {
    this.activeChatStore().setEphemeralLocation(setter);
  }

  public static deleteMessageById(messageId: string) {
    const { deletedMessage, updatedTranscript } = this.transcript().deleteMessageById(messageId);
    this.setTranscript(updatedTranscript);

    return deletedMessage;
  }

  public static redoMessageById(messageId: string) {
    const hasMessage = this.transcript().containsMessage(messageId);
    assert(hasMessage, 'Cannot redo a message that does not exist in the transcript');

    while (this.transcript().getMostRecentMessage()!.message.id !== messageId) {
      this.deleteMessageById(this.transcript().getMostRecentMessage()!.message.id);
    }

    const deletedMessage = this.deleteMessageById(messageId);
    assertNonNullish(deletedMessage, 'Deleted message should not be null when redoing');

    const forcedSpeakerId = deletedMessage.associatedCharacter?.id;
    if (!forcedSpeakerId) {
      throw new Error('Trying to redo a non-chat message?');
    }

    return this.speakAsNpc(forcedSpeakerId);
  }

  public static async editMessageById(id: string, newContent: string) {
    const { updatedTranscript } = this.transcript().editMessageById(id, newContent);
    this.setTranscript(updatedTranscript);
  }

  public static async addCharacterMessage(senderId: string, message: string) {
    const sender = this.getCharacterById(senderId);
    const { updatedTranscript, newRawMessage } = this.transcript().addCharacterChatMessage(message, sender);

    this.setTranscript(updatedTranscript);

    await Promise.all([
      this.trackOffscreenMentions(sender, newRawMessage.id, message),
      this.maybeGenerateAutoImageForMessage(newRawMessage),
    ]);
  }

  public static hasUserChatMessages() {
    const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
    return userCharacter && this.transcript().hasMessagesFromCharacter(userCharacter.id);
  }

  public static async buildSceneImageFullPrompt(primaryCharacterId: string) {
    return this.activeChatStore().doWithStateGenerationImage(async () => {
      const primaryCharacter = this.getCharacterById(primaryCharacterId);
      const generatedScenePrompt = await chatSceneImageChainGroup.renderAndExecute(
        await buildFocusedChatTemplateContext(primaryCharacter.id)
      );

      return buildFullPrompt(primaryCharacter, generatedScenePrompt);
    });
  }

  public static async generateImageFromPrompt(fullPrompt: string) {
    return this.activeChatStore().doWithStateGenerationImage(async () => {
      const saveTo = `scenario/${getRequiredActiveScenario().id}/chat_images/${newId()}.png`;
      const files = await generateChatImage({
        fullPrompt,
        saveTo,
      });

      const firstFile = files[0];
      assertNonNullish(firstFile, 'No file returned from image generation call');

      this.setTranscript(this.transcript().addImageMessage(firstFile).updatedTranscript);
      return firstFile;
    });
  }

  public static async endActiveChat(noEffect: boolean) {
    const scenario = getRequiredActiveScenario();

    try {
      if (!noEffect) {
        const characterUpdates: Array<Awaited<ReturnType<typeof generateCharacterEndOfChatUpdates>>> = [];

        for (const participant of getAllActiveChatSpeakers()) {
          if (participant.id !== this.getUserCharacter().id) {
            characterUpdates.push(
              await generateCharacterEndOfChatUpdates(participant, this.memoryRagHelper(), (statusInfo) =>
                this.setStateProcessingMemories(statusInfo)
              )
            );
          }
        }

        const conversationLog: StoredConversation = Database.createPersistedObject({
          participants: this.transcript().participants,
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
    } catch (err) {
    } finally {
      clearPersistedActiveChat(scenario.id);
      this.deactivate();
    }
  }

  public static async speakAsNpc(npcId: string) {
    const speaker = useScenarioCharacterStore.getState().getRequiredCharacterById(npcId);
    const completionRequestId = newId();

    try {
      const promptContext = await buildFocusedChatTemplateContext(speaker.id);
      const renderedPrompts = await chatSystemPromptChain.render(promptContext, {
        completionRequestId,
      });

      const aiPromptMessages = this.transcript().toAIPromptMessages(speaker.id);
      const prompts = [renderedPrompts[0]!].concat(aiPromptMessages);

      if (aiPromptMessages.length > 0) {
        prompts.push(renderedPrompts[1]!);
      }

      const userNudgePrompt = renderedPrompts[2];
      if (userNudgePrompt?.content) {
        prompts.push(userNudgePrompt);
      }

      const tokenStreamingEnabled = useSettingsStore.getState().tokenStreamingEnabled;

      if (!tokenStreamingEnabled) {
        const response = await chatCompletion(prompts, {
          promptTemplateGroup: 'gen_npc_response',
          completionRequestId,
          promptContext,
        });

        const parsedResponse = await chatSystemPromptChain.parse(response, promptContext, {
          completionRequestId,
        });

        await this.addCharacterMessage(speaker.id, parsedResponse);
        await this.pauseAfterNpcOnlyMessage();

        return this.transcript;
      }

      const draftMessage = this.startStreamingNpcDraftMessage(speaker);

      const response = await chatCompletion(prompts, {
        promptTemplateGroup: 'gen_npc_response',
        promptContext,
        completionRequestId,
        onTokens: (fullText: string) => {
          this.setTranscript(this.transcript().editLatestMessage(fullText).updatedTranscript);
        },
      });

      const parsedResponse = await chatSystemPromptChain.parse(response, promptContext, {
        completionRequestId,
      });

      // We delete and re-add in order to trigger certain effects like memory RAG
      this.deleteMessageById(draftMessage.id);
      await this.addCharacterMessage(speaker.id, parsedResponse);

      await this.pauseAfterNpcOnlyMessage();
    } catch (err) {
      const mostRecentMessage = this.transcript().getMostRecentMessage();
      if (mostRecentMessage && !mostRecentMessage.getContent()) {
        this.setTranscript(this.transcript().deleteMessageById(mostRecentMessage.getId()).updatedTranscript);
      }

      await showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'chat.npc.speak',
      });
    }

    return this.transcript;
  }

  public static getSpeakerSelectionMode(): SpeakerSelectionMode {
    return this.activeChatStore().userIsParticipant()
      ? useSettingsStore.getState().userChatSpeakerSelectionMode
      : useSettingsStore.getState().npcGroupChatSpeakerSelectionMode;
  }

  public static async selectNextSpeaker(opts?: {
    notSpeakerId?: string | undefined;
    forcedSpeakerId?: string | undefined;
  }): Promise<Character> {
    if (opts?.forcedSpeakerId) {
      return this.getCharacterById(opts.forcedSpeakerId);
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
      if (!this.transcript().hasAtLeastOneCharacterMessage()) {
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

      // If we're in manual mode, give it to the user (so they can choose a forcedSpeakerId)
      if (selectionMode === 'manual') {
        return this.getUserCharacter();
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
        const moderatorSelectedSpeakerId = await moderationNextSpeakerTemplatesGroup.renderAndExecute(
          await buildChatModeratorContext(speakerCandidates)
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
      }

      assert(
        false,
        'Reached end of selectNextSpeaker function unexpectedly. Unknown speaker selection strategy?'
      );
    } catch (err) {
      showNonRetriableErrorCardIfNeeded({
        error: err,
        operationType: 'select_next_speaker',
      });

      return participants[0]!;
    }
  }

  public static countChatMessages() {
    return this.transcript().countCharacterChatMessages();
  }

  private static setStateProcessingMemories(statusInfo: string) {
    this.activeChatStore().setStateProcessingMemories(statusInfo);
  }

  private static activeChatStore() {
    return useActiveChatStore.getState();
  }

  private static memoryRagHelper() {
    const helper = this.activeChatStore().memoryRagHelper;
    assertNonNullish(helper, 'MemoryRAGHelper is not initialized');
    return helper;
  }

  private static userCharacterId() {
    return getRequiredActiveScenario().userCharacterId;
  }

  private static setTranscript(transcript: ConversationTranscript) {
    this.activeChatStore().setTranscript(transcript);
  }

  private static transcript() {
    const { transcript } = this.activeChatStore();
    assertNonNullish(transcript, 'Transcript is not initialized');

    return transcript;
  }

  private static async pauseAfterNpcOnlyMessage() {
    if (this.activeChatStore().userIsParticipant()) {
      return;
    }

    const delaySeconds = useSettingsStore.getState().npcOnlyChatDelay;
    if (delaySeconds <= 0) {
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

  private static startStreamingNpcDraftMessage(sender: Character) {
    const { updatedTranscript, newRawMessage } = this.transcript().addCharacterChatMessage('', sender);
    this.setTranscript(updatedTranscript);

    return newRawMessage;
  }

  private static async maybeGenerateAutoImageForMessage(
    chatMessage: Extract<ChatMessage, { messageType: 'chat_message' }>
  ) {
    const settings = useSettingsStore.getState();

    if (Math.random() >= settings.autoImageRate) {
      return;
    }

    const autoImageNpcOnly = settings.autoImageNpcOnly;
    if (autoImageNpcOnly && this.activeChatStore().userIsParticipant()) {
      return;
    }

    try {
      const fullPrompt = await this.buildSceneImageFullPrompt(chatMessage.senderId);
      await this.generateImageFromPrompt(fullPrompt);
    } catch (error) {
      await showNonRetriableErrorCardIfNeeded({
        operationType: 'chat.auto_generate_image',
        error,
        messagePrefix: 'Auto image generation failed',
        hint: 'The backend server might not be running.',
      });
    }
  }

  private static async trackOffscreenMentions(
    mentionedByCharacter: Character,
    messageId: string,
    lineWithSpeakerName: string
  ) {
    const newlyMentionedIds = this.memoryRagHelper().collectMentionedOffscreenCharacterIds(
      messageId,
      lineWithSpeakerName
    );

    for (const characterId of newlyMentionedIds) {
      const mentionedCharacter = this.getCharacterById(characterId);
      assertNonNullish(mentionedCharacter, `Character with ID ${characterId} not found`);

      for (const participant of getActiveChatParticipants({ includeUser: false })) {
        const focusedCharacter = this.getCharacterById(participant.id);

        const reminder = await memoryRagPromptTemplatesGroup.render(
          await buildMemoryRagTemplateContext(focusedCharacter, mentionedCharacter, mentionedByCharacter)
        );

        this.setTranscript(
          this.transcript().addOffscreenRagMessage(participant.id, reminder[0]!.content, mentionedCharacter)
            .updatedTranscript
        );
      }
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
    return this.activeChatStore().initiatorId;
  }

  private static initiator() {
    return getActiveChatParticipants().find((p) => p.id === this.initiatorId());
  }
}
