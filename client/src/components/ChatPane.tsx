import Markdown from 'react-markdown';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '../state/settings_store.js';
import type { ChatPaneWidth } from '../state/settings_store.js';
import { assertNonNullish } from '../errors/application_error.js';
import ImagePromptModal from './ImagePromptModal.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';
import { ChatCoordinator } from '../engine/chat/chat_coordinator.js';
import {
  useActiveChatMedium,
  useActiveChatParticipants,
  useTurnMachineStore,
  useChatUserLocation,
} from '../state/active_chat_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import ChatSettings from './chat/chat_settings.js';
import CharacterChatSettings from './chat/character_chat_settings.js';
import { useUserCharacter } from '../state/scenario_character_store.js';

const CHAT_PANE_WIDTH_CLASS_BY_SETTING: Record<ChatPaneWidth, string> = {
  narrow: 'w-full max-w-3xl mx-auto',
  medium: 'w-full max-w-4xl mx-auto',
  wide: 'w-full max-w-5xl mx-auto',
  extra_wide: 'w-full max-w-6xl mx-auto',
  unconstrained: 'w-[98vw] max-w-none relative left-1/2 ml-[-49vw]',
};

export default function ChatPane() {
  const chatPaneWidth = useSettingsStore((s) => s.chatPaneWidth);
  const groupChatMessageLimit = useSettingsStore((s) => s.groupChatMessageLimit);
  const richNpcMessageCount = useSettingsStore((s) => s.richNpcMessageCount);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const transcript = useTurnMachineStore((state) => state.transcript);
  const chatMode = useActiveChatMedium();
  const participants = useActiveChatParticipants();
  const chatState = useTurnMachineStore((state) => state.chatState);
  const processingMemoryStatusInfo = useTurnMachineStore((state) => state.processingMemoryStatusInfo);
  const userCharacter = useUserCharacter();
  const scenario = useScenarioStore((state) => state.activeScenario);
  const userLocation = useChatUserLocation();

  const [input, setInput] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [settingsCharacterId, setSettingsCharacterId] = useState<string | undefined>(undefined);
  const [editingMessageId, setEditingMessageId] = useState<string | undefined>(undefined);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');

  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollUnlockedRef = useRef(true);

  const submitChatMessage = useScenarioLoopStateStore((state) => state.submitChatMessage);
  const submitChatSkipTurn = useScenarioLoopStateStore((state) => state.submitChatSkipTurn);
  const submitChatSpeakAs = useScenarioLoopStateStore((state) => state.submitChatSpeakAs);
  const submitChatRequestEnd = useScenarioLoopStateStore((state) => state.submitChatRequestEnd);
  const submitChatDeleteMessage = useScenarioLoopStateStore((state) => state.submitChatDeleteMessage);
  const submitChatRedoMessage = useScenarioLoopStateStore((state) => state.submitChatRedoMessage);
  const submitChatEditMessage = useScenarioLoopStateStore((state) => state.submitChatEditMessage);
  const submitChatGenerateImage = useScenarioLoopStateStore((state) => state.submitChatGenerateImage);
  const userRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.userRequestedPhaseTransition
  );
  const setUserRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.setUserRequestedPhaseTransition
  );

  const generatingAutoImage = chatState === 'generating_image';
  const processingMemories = chatState === 'processing_memories';
  const chatMemoryUpdateStatus = processingMemories ? (processingMemoryStatusInfo ?? '') : '';
  const isAwaitingUserInput = chatState === 'awaiting_user_input';

  const participantById = useMemo(
    () => Object.fromEntries(participants.map((participant) => [participant.id, participant])),
    [participants]
  );

  assertNonNullish(participants[0]);
  assertNonNullish(userCharacter);

  const includesUser = useMemo(
    () => participants.some((participant) => participant.id === userCharacter.id),
    [participantById, userCharacter]
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
  }, [userCharacter, nonUserParticipants]);

  const isTwoParticipantChat = participants.length === 2;
  const isPaused = userRequestedPhaseTransition === 'paused';
  const showSkipButton = participants.length > 2;
  const chatPaneWidthClass = CHAT_PANE_WIDTH_CLASS_BY_SETTING[chatPaneWidth];

  const messageLimit = includesUser
    ? undefined
    : participants.length > 2
      ? groupChatMessageLimit
      : richNpcMessageCount * 2;

  const npcOnlyProgressLabel =
    includesUser || isPaused
      ? ''
      : `NPC-only chat in progress (${transcript?.countCharacterChatMessages()}/${messageLimit || 10} messages).`;

  const primaryNpc = nonUserParticipants[0];
  assertNonNullish(primaryNpc);

  if (!transcript || !primaryNpc) {
    return undefined;
  }

  const send = () => {
    const message = input.trim();
    if (!message) {
      return;
    }

    ChatCoordinator.addParticipant(userCharacter.id);
    setInput('');
    submitChatMessage(message);
  };

  const triggerParticipantSpeak = (participantId: string) => {
    const participant = participantById[participantId];
    assertNonNullish(participant, `Participant with ID ${participantId} not found`);
    submitChatSpeakAs(participant.id);
  };

  const openImagePrompt = async () => {
    const imageCharacterId = transcript.getMostRecentSpeakerId() ?? primaryNpc.id;

    const fullPrompt = await ChatCoordinator.buildSceneImageFullPrompt(imageCharacterId, {
      isUserInteraction: true,
    });

    if (editImagePromptsBeforeDispatch) {
      setImagePrompt(fullPrompt);
      setShowImagePrompt(true);
      return;
    }

    submitChatGenerateImage(fullPrompt);
  };

  const generateImageNow = () => {
    setShowImagePrompt(false);
    submitChatGenerateImage(imagePrompt);
  };

  const deleteMessage = (id: string) => {
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
    submitChatDeleteMessage(id);
  };

  const redoMessage = (id: string) => {
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
    submitChatRedoMessage(id);
  };

  const saveEditingMessageEdit = () => {
    const trimmed = editingMessageDraft.trim();
    if (!trimmed || !editingMessageId) {
      return;
    }

    const id = editingMessageId;
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
    submitChatEditMessage(id, trimmed);
  };

  const requestEndChat = () => {
    submitChatRequestEnd();
  };

  const togglePause = () => {
    if (isPaused) {
      setUserRequestedPhaseTransition('none');
      submitChatSkipTurn();
    } else {
      setUserRequestedPhaseTransition('paused');
    }
  };

  const isNearTranscriptBottom = (container: HTMLDivElement) => {
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    return remaining <= 24;
  };

  const scrollTranscriptToBottom = () => {
    setTimeout(() => {
      const container = transcriptContainerRef.current;
      if (!container || !autoScrollUnlockedRef.current) {
        return;
      }

      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }, 25);
  };

  const handleTranscriptScroll = () => {
    const container = transcriptContainerRef.current;
    if (!container) {
      return;
    }

    autoScrollUnlockedRef.current = isNearTranscriptBottom(container);
  };

  const getRunButtonTitle = () => {
    const userIsInitiator = participants[0]?.id === userCharacter.id;
    if (userIsInitiator && isAwaitingUserInput && !transcript.hasCharacterMessages()) {
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
    if (transcript.countCharacterChatMessages() > 1) {
      return 'Finish Chat';
    }

    return 'Cancel Chat';
  };

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

  useEffect(() => {
    scrollTranscriptToBottom();
  }, [transcript]);

  if (!scenario || !userLocation) {
    return undefined;
  }

  const runButtonTitle = getRunButtonTitle();

  return (
    <div
      className={`border rounded-sm bg-emphasized p-3 space-y-3 h-full max-h-[calc(100vh-9rem)] flex flex-col ${chatPaneWidthClass}`}
    >
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">
          {participants.length === 2
            ? chatMode === 'remote'
              ? 'Remote Chat'
              : 'Chat'
            : chatMode === 'remote'
              ? 'Remote Group Chat'
              : 'Group Chat'}
        </h3>
        <div className="flex items-center gap-3">
          {!chatMemoryUpdateStatus && !generatingAutoImage && npcOnlyProgressLabel && (
            <div className="text-sm text-secondary">{npcOnlyProgressLabel}</div>
          )}
          {chatMemoryUpdateStatus && <div className="text-sm text-secondary">{chatMemoryUpdateStatus}</div>}
          {generatingAutoImage && <div className="text-sm text-secondary">Generating image...</div>}
          {!processingMemories && (
            <button type="button" onClick={() => setShowChatSettings(true)}>
              Chat Settings
            </button>
          )}
          {runButtonTitle && (
            <button
              type="button"
              className="border-warning-border bg-warning-bg text-warning-text-strong hover:bg-warning-border-soft"
              onClick={togglePause}
            >
              {runButtonTitle}
            </button>
          )}
          <button
            type="button"
            onClick={requestEndChat}
            disabled={!isAwaitingUserInput}
            className="button-emphasized font-semibold"
          >
            {getEndChatButtonTitle()}
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="w-44 shrink-0 space-y-2 overflow-y-auto">
          {participantsCardOrder.map((participant) => (
            <div
              key={participant.id}
              className={`border rounded-sm p-2 bg-surface-subtle cursor-pointer`}
              onClick={() => {
                setSettingsCharacterId(participant.id);
              }}
            >
              <img
                src={participant.imagePath}
                alt={`${participant.firstName} ${participant.lastName}`}
                className={
                  isTwoParticipantChat
                    ? 'w-full h-auto border rounded-sm'
                    : 'w-full h-36 object-cover object-top border rounded-sm'
                }
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <div className="mt-1 text-sm font-medium text-center">
                {participant.firstName} {participant.lastName}
              </div>

              {participant.id !== userCharacter.id && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    triggerParticipantSpeak(participant.id);
                  }}
                  disabled={!isAwaitingUserInput}
                  className="text-xs w-full mt-1"
                >
                  Speak
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          ref={transcriptContainerRef}
          onScroll={handleTranscriptScroll}
          className="border rounded-sm p-2 overflow-y-auto space-y-2 flex-1 min-h-0"
        >
          {transcript.countAllMessages() === 0 && (
            <div className="text-sm text-muted">
              {participants[0]!.id === userCharacter.id
                ? 'Say something to start the conversation, or choose an NPC to speak.'
                : isPaused
                  ? 'Click Speak on a character card to choose who talks next, or Start Chat to let them talk on their own.'
                  : 'Conversation in progress...'}
            </div>
          )}
          {transcript.getVisibleMessages(userCharacter.id).map((entry) => (
            <div
              key={entry.getId()}
              className={`relative group ${entry.isSentByCharacter(userCharacter.id) ? 'text-right' : ''}`}
            >
              {entry.isImageMessage() ? (
                <img
                  src={entry.imageUrl()}
                  alt="Generated"
                  className="rounded-sm border inline-block"
                  onLoad={scrollTranscriptToBottom}
                />
              ) : editingMessageId === entry.getId() && entry.isCharacterChatMessage() ? (
                <div className="space-y-2">
                  <div>
                    <strong>{entry.getSpeakerName()}:</strong>
                  </div>
                  <textarea
                    value={editingMessageDraft}
                    onChange={(event) => setEditingMessageDraft(event.target.value)}
                    rows={3}
                    className="w-full border rounded-sm p-2 bg-inset text-sm"
                    disabled={!isAwaitingUserInput}
                  />
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditingMessageId(undefined)}
                      disabled={!isAwaitingUserInput}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEditingMessageEdit}
                      disabled={!isAwaitingUserInput || !editingMessageDraft.trim()}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>{entry.getSpeakerName()}</strong> <Markdown>{entry.getContent()}</Markdown>
                </>
              )}

              {isAwaitingUserInput && !editingMessageId && (
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs h-6 leading-none">
                  <button
                    type="button"
                    onClick={() => {
                      const id = entry.getId();
                      deleteMessage(id);
                    }}
                    disabled={!isAwaitingUserInput}
                    title="Delete message"
                    aria-label="Delete message"
                    className="px-1 h-5 w-5 flex items-center justify-center"
                  >
                    🗑
                  </button>

                  {entry.isCharacterChatMessage() &&
                    entry.asCharacterChatMessage().senderId !== userCharacter.id && (
                      <button
                        type="button"
                        onClick={() => {
                          const id = entry.getId();
                          redoMessage(id);
                        }}
                        disabled={!isAwaitingUserInput}
                        title="Retry message"
                        aria-label="Retry message"
                        className="px-1 h-5 w-5 flex items-center justify-center"
                      >
                        ↻
                      </button>
                    )}

                  {!entry.isImageMessage() && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = entry.getId();
                        setEditingMessageId(id);
                        setEditingMessageDraft(entry.getContent());
                      }}
                      disabled={!isAwaitingUserInput}
                      title="Edit message"
                      aria-label="Edit message"
                      className="px-1 h-5 w-5 flex items-center justify-center"
                    >
                      ✎
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-0">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && input.trim() && isAwaitingUserInput) {
              event.preventDefault();
              send();
            }
          }}
          disabled={!includesUser && !isAwaitingUserInput}
          placeholder={includesUser ? 'Enter a message' : 'Entering a message will add the user to the chat.'}
          rows={2}
          className="flex-1"
        />
        <button
          type="button"
          onClick={send}
          disabled={!isAwaitingUserInput || !input.trim() || !isAwaitingUserInput}
        >
          Send
        </button>
        {showSkipButton && (
          <button
            type="button"
            onClick={() => {
              setUserRequestedPhaseTransition('none');
              submitChatSkipTurn();
            }}
            disabled={!isAwaitingUserInput}
          >
            Skip
          </button>
        )}
        <button type="button" onClick={openImagePrompt} disabled={!isAwaitingUserInput}>
          Gen Image
        </button>
      </div>

      <ImagePromptModal
        open={showImagePrompt}
        prompt={imagePrompt}
        onChange={setImagePrompt}
        onCancel={() => setShowImagePrompt(false)}
        onConfirm={generateImageNow}
      />

      <ChatSettings open={showChatSettings} onClose={() => setShowChatSettings(false)} />

      <CharacterChatSettings
        open={Boolean(settingsCharacterId)}
        onClose={() => setSettingsCharacterId(undefined)}
        settingsCharacterId={settingsCharacterId}
      />
    </div>
  );
}
