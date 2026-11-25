import { useEffect, useMemo } from 'react';
import { assertNonNullish } from '../errors/application_error.js';
import { ChatCoordinator } from '../engine/chat/chat_coordinator.js';
import { useModalQueryParam } from '../hooks/useModalQueryParam.js';
import { useIsMobileLayout } from '../hooks/use_mobile_layout.js';
import {
  abortCurrentChatGeneration,
  useChatJobs,
  useIsChatFinalizing,
  useUserCanInputChat,
} from '../state/chat_state.js';
import { useScenarioCharacterStore, useUserCharacter } from '../state/scenario_character_store.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import {
  useActiveChatMedium,
  useActiveChatParticipants,
  useTurnMachineStore,
} from '../state/turn_machine_store.js';
import ImagePromptModal from './ImagePromptModal.js';
import ChatTopBarStatus from './chat/ChatTopBarStatus.js';
import ChatView from './chat/ChatView.js';
import { transcriptToChatViewMessages } from './chat/transcript_chat_messages.js';
import SceneImageControls from './chat/SceneImageControls.js';
import { useCharacterChatSettingsCapability } from './chat/capabilities/use_character_chat_settings_capability.js';
import { useChatMessageActionsCapability } from './chat/capabilities/use_chat_message_actions_capability.js';
import { useParticipantSpeakCapability } from './chat/capabilities/use_participant_speak_capability.js';
import { useSceneImageCapability } from './chat/capabilities/use_scene_image_capability.js';
import CharacterChatSettings from './chat/character_chat_settings.js';
import ChatSettings from './chat/chat_settings.js';

type ChatPaneProps = {
  onOpenScenarioMenu?: (() => void) | undefined;
};

export default function ChatPane({ onOpenScenarioMenu }: ChatPaneProps) {
  const isMobileLayout = useIsMobileLayout();
  const transcript = useTurnMachineStore((state) => state.transcript);
  const inChatTurnFor = useTurnMachineStore((state) => state.inChatTurnForCharacterId);
  const chatMode = useActiveChatMedium();
  const participants = useActiveChatParticipants();
  const charactersById = useScenarioCharacterStore((s) => s.scenarioCharactersById);
  const userCharacter = useUserCharacter();
  const scenario = useScenarioStore((state) => state.activeScenario);
  assertNonNullish(scenario, 'No scenario');
  assertNonNullish(participants[0]);
  assertNonNullish(userCharacter);

  const { openModal: openChatSettings } = useModalQueryParam('chatsettings');

  const submitChatMessage = useScenarioLoopStateStore((state) => state.submitChatMessage);
  const submitChatSkipTurn = useScenarioLoopStateStore((state) => state.submitChatSkipTurn);
  const submitChatRequestEnd = useScenarioLoopStateStore((state) => state.submitChatRequestEnd);
  const userRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.userRequestedPhaseTransition
  );
  const setUserRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.setUserRequestedPhaseTransition
  );

  const chatJobs = useChatJobs();
  const isFinalizingChat = useIsChatFinalizing();
  const userCanInputChat = useUserCanInputChat();

  const characterSettingsCapability = useCharacterChatSettingsCapability();
  const speakCapability = useParticipantSpeakCapability({
    participants,
    userCharacterId: userCharacter.id,
    userCanInputChat,
  });
  const messageActionsCapability = useChatMessageActionsCapability({
    userCharacterId: userCharacter.id,
    userCanInputChat,
    isFinalizingChat,
  });
  const sceneImageCapability = useSceneImageCapability({ isFinalizingChat });

  const canFinishChat = chatJobs.length === 0 && inChatTurnFor === scenario.userCharacterId;
  const isGenerating = chatJobs.length > 0;
  const hasRunningJobs = chatJobs.some((job) => job.state === 'running');
  const includesUser = useMemo(
    () => participants.some((participant) => participant.id === userCharacter.id),
    [speakCapability.participantById, userCharacter]
  );
  const nonUserParticipants = useMemo(
    () => participants.filter((participant) => participant.id !== userCharacter.id),
    [participants, userCharacter]
  );
  const participantsCardOrder = useMemo(() => {
    if (!includesUser) {
      return nonUserParticipants;
    }

    return nonUserParticipants.concat(userCharacter);
  }, [includesUser, userCharacter, nonUserParticipants]);

  const isTwoParticipantChat = participants.length === 2;
  const isPaused = userRequestedPhaseTransition === 'paused';
  const showSkipButton = participants.length > 2;
  const primaryNpc = nonUserParticipants[0];
  assertNonNullish(primaryNpc);

  useEffect(() => {
    if (window.yozakura) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (transcript?.countAllMessages() === 0) {
        return undefined;
      }

      event.preventDefault();
      event.returnValue =
        "There's a chat in progress, if you close the tab now, the chat state will be lost.";
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [transcript?.countAllMessages() === 0]);

  const chatMessages = useMemo(
    () => (transcript ? transcriptToChatViewMessages(transcript, userCharacter.id) : []),
    [transcript, userCharacter.id]
  );

  if (!transcript || !primaryNpc) {
    return undefined;
  }

  const sendMessage = (message: string) => {
    ChatCoordinator.addParticipant(userCharacter.id);
    submitChatMessage(message);
  };

  const togglePause = () => {
    if (isPaused) {
      setUserRequestedPhaseTransition('none');
      submitChatSkipTurn();
    } else {
      setUserRequestedPhaseTransition('paused');
    }
  };

  const getRunButtonTitle = () => {
    const userIsMainParticipant = participants[0]?.id === userCharacter.id;
    if (userIsMainParticipant && userCanInputChat && !transcript.hasCharacterMessages()) {
      return undefined;
    }

    if (isFinalizingChat) {
      return undefined;
    }

    if (!transcript.hasCharacterMessages()) {
      return '▶ Start Chat';
    }

    if (isPaused) {
      return '▶ Resume';
    }

    return '⏸ Pause';
  };

  const getEndChatButtonTitle = () => {
    if (isFinalizingChat) {
      return undefined;
    }

    if (transcript.countCharacterChatMessages() > 1) {
      return 'Finish Chat';
    }

    return 'Cancel Chat';
  };

  const chatTitle =
    participants.length === 2
      ? chatMode === 'remote'
        ? 'Remote Chat'
        : 'Chat'
      : chatMode === 'remote'
        ? 'Remote Group Chat'
        : 'Group Chat';

  const runButtonTitle = getRunButtonTitle();
  const endChatButtonTitle = getEndChatButtonTitle();

  const actionControls = (
    <>
      {!isFinalizingChat && (
        <button
          type="button"
          onClick={openChatSettings}
          className={isMobileLayout ? 'flex-1 text-xs px-2! py-1.5!' : 'text-sm'}
        >
          Chat Settings
        </button>
      )}

      {runButtonTitle && (
        <button
          type="button"
          className={`border-warning-border bg-warning-bg text-warning-text-strong hover:bg-warning-border-soft ${
            isMobileLayout ? 'flex-1 text-xs px-2! py-1.5!' : 'text-sm'
          }`}
          onClick={togglePause}
        >
          {runButtonTitle}
        </button>
      )}

      {endChatButtonTitle && (
        <button
          type="button"
          onClick={() => submitChatRequestEnd()}
          disabled={!canFinishChat}
          className={`button-emphasized font-semibold ${
            isMobileLayout ? 'flex-1 text-xs px-2! py-1.5!' : 'text-sm'
          }`}
        >
          {endChatButtonTitle}
        </button>
      )}
    </>
  );

  return (
    <>
      <ChatView
        messages={chatMessages}
        isEmpty={transcript.countAllMessages() === 0}
        participants={participantsCardOrder}
        resolveAvatarImagePath={(senderId) =>
          speakCapability.participantById[senderId]?.imagePath ?? charactersById[senderId]?.imagePath
        }
        sidebarQueryParam="chatparticipants"
        sidebarZIndex={40}
        sidebarCardImageClassName={
          isTwoParticipantChat || isMobileLayout
            ? 'w-full h-auto border rounded-sm'
            : 'w-full h-36 object-cover object-top border rounded-sm'
        }
        participantsDrawerAriaLabel="Open character tray"
        participantsDrawerTitle="Chat participants"
        renderHeader={({ isMobileLayout: mobile, participantsDrawerButton }) =>
          mobile ? (
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                {participantsDrawerButton}

                <div className="flex-1 min-w-0 flex justify-center text-center">
                  {hasRunningJobs ? (
                    <ChatTopBarStatus />
                  ) : (
                    <h3 className="font-semibold text-sm truncate">{chatTitle}</h3>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onOpenScenarioMenu}
                  aria-label="Open menu"
                  title="Menu"
                  className="p-1.5! flex items-center justify-center shrink-0"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">{actionControls}</div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between items-center gap-2 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="font-semibold shrink-0">{chatTitle}</h3>
                <ChatTopBarStatus />
              </div>
              <div className="flex items-center gap-2 flex-wrap">{actionControls}</div>
            </div>
          )
        }
        emptyState={
          <div className="text-sm text-muted">
            {participants[0]!.id === userCharacter.id
              ? 'Say something to start the conversation, or choose an NPC to speak.'
              : isPaused
                ? 'Click Speak on a character card to choose who talks next, or Start Chat to let them talk on their own.'
                : 'Conversation in progress...'}
          </div>
        }
        getAvatarTitle={(senderId, speakerName) =>
          speakCapability.canLongPressAvatar(senderId)
            ? `Tap for ${speakerName} settings, hold to speak`
            : `${speakerName} settings`
        }
        {...characterSettingsCapability.paneProps}
        {...speakCapability.paneProps}
        {...messageActionsCapability.paneProps}
        {...sceneImageCapability.paneProps}
        onSendMessage={sendMessage}
        inputPlaceholder={
          includesUser ? 'Enter a message' : 'Entering a message will add the user to the chat.'
        }
        inputDisabled={!includesUser && !userCanInputChat}
        canSendMessage={userCanInputChat}
        showStopButton={isGenerating}
        onStopGeneration={abortCurrentChatGeneration}
        extraInputControls={
          <>
            {showSkipButton && (
              <button
                type="button"
                onClick={() => {
                  setUserRequestedPhaseTransition('none');
                  submitChatSkipTurn();
                }}
                disabled={!userCanInputChat}
                className={isMobileLayout ? 'px-2! text-xs shrink-0' : 'shrink-0'}
              >
                Skip
              </button>
            )}
            <SceneImageControls
              {...sceneImageCapability.controlsProps}
              onRequestLatestImage={() =>
                sceneImageCapability.requestSceneImage(transcript.getMostRecentChatMessage()?.id)
              }
            />
          </>
        }
      />

      <ImagePromptModal {...sceneImageCapability.modalProps} />

      <ChatSettings />

      <CharacterChatSettings />
    </>
  );
}
