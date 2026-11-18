import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSettingsStore } from '../state/settings_store.js';
import { assertNonNullish } from '../errors/application_error.js';
import ImagePromptModal from './ImagePromptModal.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';
import { ChatCoordinator } from '../engine/chat/chat_coordinator.js';
import {
  useActiveChatMedium,
  useActiveChatParticipants,
  useTurnMachineStore,
} from '../state/turn_machine_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import ChatSettings from './chat/chat_settings.js';
import CharacterChatSettings from './chat/character_chat_settings.js';
import { useScenarioCharacterStore, useUserCharacter } from '../state/scenario_character_store.js';
import ButtonOptions from './ui/ButtonOptions.js';
import { chatSceneImageTemplatesGroup } from '../engine/prompt_templates/chat/group.js';
import {
  abortCurrentChatGeneration,
  useChatJobs,
  useUserCanInputChat,
  useImageGenerationJobs,
  useIsChatFinalizing,
} from '../state/chat_state.js';
import ChatTopBarStatus from './chat/ChatTopBarStatus.js';
import TranscriptMessageContent from './chat/TranscriptMessageContent.js';
import ResponsiveDrawerSidebar, {
  ParticipantsDrawerButton,
  useMobileDrawer,
} from './ui/ResponsiveDrawerSidebar.js';

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_THRESHOLD_PX = 8;
const USER_SCROLL_INTERACTION_WINDOW_MS = 1500;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

type ChatPaneProps = {
  onOpenScenarioMenu?: (() => void) | undefined;
};

type LongPressOrigin = {
  x: number;
  y: number;
  timerId: number;
};

export default function ChatPane({ onOpenScenarioMenu }: ChatPaneProps) {
  const {
    isMobileLayout,
    openDrawer: openCharacterTray,
    closeDrawer: closeCharacterTray,
  } = useMobileDrawer('chatparticipants');
  const selectedSceneImageTemplateChainId = useSettingsStore((s) => s.selectedSceneImageTemplateChainId);
  const generateImagesInParallelWithText = useSettingsStore((s) => s.generateImagesInParallelWithText);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const sceneImageChains = chatSceneImageTemplatesGroup.useChains();
  const transcript = useTurnMachineStore((state) => state.transcript);
  const chatMode = useActiveChatMedium();
  const participants = useActiveChatParticipants();
  const charactersById = useScenarioCharacterStore((s) => s.scenarioCharactersById);
  const userCharacter = useUserCharacter();
  const scenario = useScenarioStore((state) => state.activeScenario);

  const [inputIsNonEmpty, setInputIsNonEmpty] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [settingsCharacterId, setSettingsCharacterId] = useState<string | undefined>(undefined);
  const [editingMessageId, setEditingMessageId] = useState<string | undefined>(undefined);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [activeActionMessageId, setActiveActionMessageId] = useState<string | undefined>(undefined);

  const transcriptContainerOuterRef = useRef<HTMLDivElement | null>(null);
  const transcriptContainerInnerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollUnlockedRef = useRef(true);
  const lastUserScrollInteractionAtRef = useRef(-Infinity);
  const lastProgrammaticScrollTopRef = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const messagePressRef = useRef<LongPressOrigin | undefined>(undefined);
  const avatarPressRef = useRef<LongPressOrigin | undefined>(undefined);
  const suppressAvatarClickRef = useRef(false);
  const suppressMessageContextMenuRef = useRef(false);

  const submitChatMessage = useScenarioLoopStateStore((state) => state.submitChatMessage);
  const submitChatSkipTurn = useScenarioLoopStateStore((state) => state.submitChatSkipTurn);
  const submitChatSpeakAs = useScenarioLoopStateStore((state) => state.submitChatSpeakAs);
  const submitChatRequestEnd = useScenarioLoopStateStore((state) => state.submitChatRequestEnd);
  const submitChatDeleteMessage = useScenarioLoopStateStore((state) => state.submitChatDeleteMessage);
  const submitChatRedoMessage = useScenarioLoopStateStore((state) => state.submitChatRedoMessage);
  const submitChatEditMessage = useScenarioLoopStateStore((state) => state.submitChatEditMessage);
  const userRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.userRequestedPhaseTransition
  );
  const setUserRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.setUserRequestedPhaseTransition
  );
  const pendingImagePromptEdit = useScenarioLoopStateStore((state) => state.pendingImagePromptEdit);
  const setPendingImagePromptEdit = useScenarioLoopStateStore((state) => state.setPendingImagePromptEdit);

  const chatJobs = useChatJobs();
  const imageGenerationJobs = useImageGenerationJobs();
  const isFinalizingChat = useIsChatFinalizing();
  const userCanInputChat = useUserCanInputChat();
  const isAtMaxImageCapacity =
    useSettingsStore((s) => s.imageGenerationConcurrency) <= imageGenerationJobs.length;
  const canFinishChat = chatJobs.length === 0;
  const canGenerateImages =
    !isFinalizingChat && !isAtMaxImageCapacity && (generateImagesInParallelWithText || userCanInputChat);

  const isGenerating = chatJobs.length > 0;
  const hasRunningJobs = chatJobs.some((job) => job.state === 'running');

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

  const activeSceneImageChain = useMemo(() => {
    return (
      sceneImageChains.find((c) => c.templateChainId === selectedSceneImageTemplateChainId) ??
      sceneImageChains[0]
    );
  }, [sceneImageChains, selectedSceneImageTemplateChainId]);

  const primaryNpc = nonUserParticipants[0];
  assertNonNullish(primaryNpc);

  useEffect(() => {
    if (!activeActionMessageId) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-message-id="${activeActionMessageId}"]`)) {
        return;
      }
      setActiveActionMessageId(undefined);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveActionMessageId(undefined);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeActionMessageId]);

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
    const outer = transcriptContainerOuterRef.current;
    const inner = transcriptContainerInnerRef.current;
    if (!outer || !inner) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (autoScrollUnlockedRef.current && transcriptContainerOuterRef.current) {
        const container = transcriptContainerOuterRef.current;
        container.scrollTop = container.scrollHeight;
        lastProgrammaticScrollTopRef.current = container.scrollTop;
      }
    });

    observer.observe(inner);
    observer.observe(outer);

    return () => observer.disconnect();
  }, [Boolean(transcript && primaryNpc && scenario)]);

  if (!transcript || !primaryNpc || !scenario) {
    return undefined;
  }

  const resetInput = () => {
    if (!inputRef.current) {
      return;
    }

    const value = inputRef.current.value;
    inputRef.current.value = '';
    setInputIsNonEmpty(false);

    return value.trim();
  };

  const send = () => {
    assertNonNullish(inputRef.current, 'Somehow hit send without input ref');

    const message = resetInput();
    if (!message) {
      return;
    }

    autoScrollUnlockedRef.current = true;
    ChatCoordinator.addParticipant(userCharacter.id);
    submitChatMessage(message);
  };

  const triggerParticipantSpeak = (participantId: string) => {
    const participant = participantById[participantId];
    assertNonNullish(participant, `Participant with ID ${participantId} not found`);
    submitChatSpeakAs(participant.id);
  };

  const confirmImagePrompt = () => {
    if (!pendingImagePromptEdit) {
      return;
    }

    const { prompt, afterMessageId } = pendingImagePromptEdit;
    void ChatCoordinator.confirmSceneImagePrompt(prompt, afterMessageId);
  };

  const deleteMessage = (id: string) => {
    setActiveActionMessageId(undefined);
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
    submitChatDeleteMessage(id);
  };

  const redoMessage = (id: string) => {
    setActiveActionMessageId(undefined);
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

  const markUserScrollInteraction = () => {
    lastUserScrollInteractionAtRef.current = performance.now();
  };

  const handleTranscriptScroll = () => {
    const container = transcriptContainerOuterRef.current;
    if (!container) {
      return;
    }

    if (isNearTranscriptBottom(container)) {
      autoScrollUnlockedRef.current = true;
      return;
    }

    const lastProgrammatic = lastProgrammaticScrollTopRef.current;
    const movedFromProgrammatic =
      lastProgrammatic === undefined || Math.abs(container.scrollTop - lastProgrammatic) > 2;
    const recentUserScroll =
      performance.now() - lastUserScrollInteractionAtRef.current <= USER_SCROLL_INTERACTION_WINDOW_MS;

    if (recentUserScroll && movedFromProgrammatic) {
      autoScrollUnlockedRef.current = false;
    }
  };

  const clearLongPress = (ref: React.MutableRefObject<LongPressOrigin | undefined>) => {
    if (!ref.current) {
      return;
    }
    window.clearTimeout(ref.current.timerId);
    ref.current = undefined;
  };

  const hasMovedPastThreshold = (origin: LongPressOrigin, event: ReactPointerEvent) =>
    Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_MOVE_THRESHOLD_PX;

  const handleMessagePointerDown = (event: ReactPointerEvent<HTMLDivElement>, messageId: string) => {
    if (event.button !== 0 || !userCanInputChat || editingMessageId) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, textarea, input')) {
      return;
    }

    clearLongPress(messagePressRef);
    const isTouch = event.pointerType === 'touch';
    const timerId = window.setTimeout(() => {
      messagePressRef.current = undefined;
      if (isTouch) {
        suppressMessageContextMenuRef.current = true;
      }
      setActiveActionMessageId(messageId);
    }, LONG_PRESS_MS);

    messagePressRef.current = { x: event.clientX, y: event.clientY, timerId };
  };

  const handleMessagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (messagePressRef.current && hasMovedPastThreshold(messagePressRef.current, event)) {
      clearLongPress(messagePressRef);
    }
  };

  const handleAvatarPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    senderId: string,
    canLongPressSpeak: boolean
  ) => {
    if (event.button !== 0) {
      return;
    }

    suppressAvatarClickRef.current = false;
    clearLongPress(avatarPressRef);
    if (!canLongPressSpeak) {
      return;
    }

    const timerId = window.setTimeout(() => {
      avatarPressRef.current = undefined;
      suppressAvatarClickRef.current = true;
      triggerParticipantSpeak(senderId);
    }, LONG_PRESS_MS);

    avatarPressRef.current = { x: event.clientX, y: event.clientY, timerId };
  };

  const handleAvatarPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (avatarPressRef.current && hasMovedPastThreshold(avatarPressRef.current, event)) {
      clearLongPress(avatarPressRef);
    }
  };

  const getRunButtonTitle = () => {
    const userIsInitiator = participants[0]?.id === userCharacter.id;
    if (userIsInitiator && userCanInputChat && !transcript.hasCharacterMessages()) {
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
  const actionBarContainerClassName = isMobileLayout ? 'gap-2 text-2xl h-12 px-2' : 'gap-1 text-xs h-7 px-1';
  const actionBarButtonClassName = isMobileLayout
    ? 'px-1! py-0! h-10 w-10 flex items-center justify-center'
    : 'px-1! py-0! h-5 w-5 flex items-center justify-center';

  const participantCards = (
    <div className={isMobileLayout ? 'grid grid-cols-1 @[420px]:grid-cols-2 gap-2 items-start' : 'space-y-2'}>
      {participantsCardOrder.map((participant) => (
        <div
          key={participant.id}
          className="border rounded-sm p-2 bg-surface-subtle cursor-pointer"
          onClick={() => {
            setSettingsCharacterId(participant.id);
          }}
        >
          <img
            src={participant.imagePath}
            alt={`${participant.firstName} ${participant.lastName}`}
            className={
              isTwoParticipantChat || isMobileLayout
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
              disabled={!userCanInputChat}
              className="text-xs w-full mt-1"
            >
              Speak
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const actionControls = (
    <>
      {!isFinalizingChat && (
        <button
          type="button"
          onClick={() => setShowChatSettings(true)}
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
          onClick={requestEndChat}
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
    <div
      className={`bg-emphasized h-full w-full flex min-h-0 ${
        isMobileLayout ? 'flex-col p-1 gap-1.5' : 'flex-row border-r border-border-default p-3 gap-3'
      }`}
    >
      <ResponsiveDrawerSidebar
        isDrawer={isMobileLayout}
        queryParam="chatparticipants"
        onClose={closeCharacterTray}
        drawerSide="left"
        zIndex={40}
        headerActions={<span className="px-2 py-1 text-sm font-semibold">Participants</span>}
        inlineClassName="w-44 shrink-0 overflow-y-auto pr-1"
      >
        {participantCards}
      </ResponsiveDrawerSidebar>

      <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-2">
        {isMobileLayout ? (
          <div className="space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <ParticipantsDrawerButton
                onClick={openCharacterTray}
                ariaLabel="Open character tray"
                title="Chat participants"
              />

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
        )}

        <div
          ref={transcriptContainerOuterRef}
          onScroll={handleTranscriptScroll}
          onWheel={markUserScrollInteraction}
          onTouchMove={markUserScrollInteraction}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX >= rect.left + event.currentTarget.clientWidth) {
              markUserScrollInteraction();
            }
          }}
          onKeyDown={(event) => {
            if (SCROLL_KEYS.has(event.key)) {
              markUserScrollInteraction();
            }
          }}
          style={{ overflowAnchor: 'none' }}
          className={`border rounded-sm ${isMobileLayout ? 'p-1' : 'p-2'} overflow-y-auto space-y-2 flex-1 min-h-0`}
        >
          <div ref={transcriptContainerInnerRef} className="space-y-3">
            {transcript.countAllMessages() === 0 && (
              <div className="text-sm text-muted">
                {participants[0]!.id === userCharacter.id
                  ? 'Say something to start the conversation, or choose an NPC to speak.'
                  : isPaused
                    ? 'Click Speak on a character card to choose who talks next, or Start Chat to let them talk on their own.'
                    : 'Conversation in progress...'}
              </div>
            )}

            {transcript.getVisibleMessages(userCharacter.id).map((entry) => {
              const entryId = entry.getId();
              const isActionBarActive = activeActionMessageId === entryId;
              const isCharacterMessage = entry.isCharacterChatMessage();
              const senderId = isCharacterMessage ? entry.asCharacterChatMessage().senderId : undefined;
              const senderCharacter = senderId
                ? (participantById[senderId] ?? charactersById[senderId])
                : undefined;
              const canLongPressAvatarToSpeak = Boolean(
                senderId && senderId !== userCharacter.id && participantById[senderId] && userCanInputChat
              );

              return (
                <div
                  key={entryId}
                  data-message-id={entryId}
                  onPointerDown={(event) => handleMessagePointerDown(event, entryId)}
                  onPointerMove={handleMessagePointerMove}
                  onPointerUp={() => clearLongPress(messagePressRef)}
                  onPointerCancel={() => clearLongPress(messagePressRef)}
                  onContextMenu={(event) => {
                    if (suppressMessageContextMenuRef.current) {
                      suppressMessageContextMenuRef.current = false;
                      event.preventDefault();
                    }
                  }}
                  className={`relative group flow-root text-left rounded-sm ${isMobileLayout ? 'px-0.5' : 'px-1'} py-0.5`}
                >
                  {editingMessageId === entryId && isCharacterMessage ? (
                    <div className="space-y-2">
                      <div>
                        <strong>{entry.getSpeakerName()}:</strong>
                      </div>
                      <textarea
                        value={editingMessageDraft}
                        onChange={(event) => setEditingMessageDraft(event.target.value)}
                        rows={3}
                        className="w-full border rounded-sm p-2 bg-inset text-sm"
                        disabled={!userCanInputChat}
                      />
                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditingMessageId(undefined)}
                          disabled={!userCanInputChat}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveEditingMessageEdit}
                          disabled={!userCanInputChat || !editingMessageDraft.trim()}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <TranscriptMessageContent
                      isImageMessage={entry.isImageMessage()}
                      isCharacterMessage={isCharacterMessage && Boolean(senderId)}
                      imageUrl={entry.isImageMessage() ? entry.imageUrl() : undefined}
                      speakerName={entry.getSpeakerName()}
                      content={entry.getContent()}
                      avatarImagePath={senderCharacter?.imagePath}
                      renderAvatarWrapper={
                        senderId
                          ? (avatar) => (
                              <button
                                type="button"
                                onPointerDown={(event) =>
                                  handleAvatarPointerDown(event, senderId, canLongPressAvatarToSpeak)
                                }
                                onPointerMove={handleAvatarPointerMove}
                                onPointerUp={() => clearLongPress(avatarPressRef)}
                                onPointerCancel={() => clearLongPress(avatarPressRef)}
                                onContextMenu={(event) => event.preventDefault()}
                                onClick={() => {
                                  if (suppressAvatarClickRef.current) {
                                    suppressAvatarClickRef.current = false;
                                    return;
                                  }
                                  setSettingsCharacterId(senderId);
                                }}
                                title={
                                  canLongPressAvatarToSpeak
                                    ? `Tap for ${entry.getSpeakerName()} settings, hold to speak`
                                    : `${entry.getSpeakerName()} settings`
                                }
                                aria-label={`${entry.getSpeakerName()} avatar`}
                                className="float-left mr-2.5 mb-0.5 p-0! border-0! rounded-full! bg-transparent! shrink-0 select-none touch-manipulation"
                              >
                                {avatar}
                              </button>
                            )
                          : undefined
                      }
                    />
                  )}

                  {userCanInputChat && !editingMessageId && (
                    <div
                      className={`absolute bottom-1 right-1 transition-opacity flex items-center ${actionBarContainerClassName} rounded-sm border border-border-default bg-emphasized/95 shadow-sm leading-none ${
                        isActionBarActive
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => deleteMessage(entryId)}
                        title="Delete message"
                        aria-label="Delete message"
                        className={actionBarButtonClassName}
                      >
                        🗑
                      </button>

                      {isCharacterMessage && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveActionMessageId(undefined);
                            void ChatCoordinator.requestSceneImage(entryId);
                          }}
                          disabled={!canGenerateImages}
                          title="Generate image"
                          aria-label="Generate image"
                          className={actionBarButtonClassName}
                        >
                          🖼️
                        </button>
                      )}

                      {isCharacterMessage && senderId !== userCharacter.id && (
                        <button
                          type="button"
                          onClick={() => redoMessage(entryId)}
                          title="Retry message"
                          aria-label="Retry message"
                          className={actionBarButtonClassName}
                        >
                          ↻
                        </button>
                      )}

                      {!entry.isImageMessage() && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveActionMessageId(undefined);
                            setEditingMessageId(entryId);
                            setEditingMessageDraft(entry.getContent());
                          }}
                          title="Edit message"
                          aria-label="Edit message"
                          className={actionBarButtonClassName}
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-stretch gap-1.5 sm:gap-2 shrink-0">
          <textarea
            onChange={(event) => setInputIsNonEmpty(Boolean(event.target.value.trim()))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && inputIsNonEmpty && userCanInputChat) {
                event.preventDefault();
                send();
              }
            }}
            ref={inputRef}
            disabled={!includesUser && !userCanInputChat}
            placeholder={
              includesUser ? 'Enter a message' : 'Entering a message will add the user to the chat.'
            }
            rows={2}
            className="flex-1 min-w-0"
          />
          {isGenerating && (
            <button
              type="button"
              onClick={abortCurrentChatGeneration}
              aria-label="Stop generation"
              className={isMobileLayout ? 'px-2! shrink-0' : 'shrink-0'}
            >
              ■
            </button>
          )}
          {userCanInputChat && (
            <button
              type="button"
              onClick={send}
              disabled={!userCanInputChat || !inputIsNonEmpty}
              aria-label="Send"
              title="Send"
              className={isMobileLayout ? 'px-2.5! flex items-center justify-center shrink-0' : 'shrink-0'}
            >
              {isMobileLayout ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
              ) : (
                'Send'
              )}
            </button>
          )}
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
          <ButtonOptions
            showDropdown={sceneImageChains.length > 1}
            disabled={!canGenerateImages}
            placement="top-end"
            ariaLabel="Select image template"
            className="shrink-0"
            button={
              <button
                type="button"
                onClick={() =>
                  void ChatCoordinator.requestSceneImage(transcript.getMostRecentChatMessage()?.id)
                }
                disabled={!canGenerateImages}
                title={
                  activeSceneImageChain
                    ? `Generate image (${activeSceneImageChain.settingsBridge.get().title})`
                    : 'Generate image'
                }
                aria-label="Generate image"
                className="px-2!"
              >
                🖼️
              </button>
            }
          >
            <div className="w-56 space-y-2 select-none">
              <div className="pb-1.5 border-b border-border-default">
                <span className="text-xs font-semibold text-secondary-strong">Image Template</span>
              </div>
              <div className="space-y-1.5 pt-0.5">
                {sceneImageChains.map((chain) => {
                  const chainData = chain.settingsBridge.get();
                  const isSelected =
                    chain.templateChainId ===
                    (activeSceneImageChain?.templateChainId ?? chain.templateChainId);
                  return (
                    <label
                      key={chain.templateChainId}
                      title={chainData.description || undefined}
                      className="flex gap-2 cursor-pointer text-xs text-primary hover:text-secondary-strong"
                    >
                      <input
                        type="radio"
                        name="selected-scene-image-template"
                        checked={isSelected}
                        onChange={() => {
                          setSettings({ selectedSceneImageTemplateChainId: chain.templateChainId });
                        }}
                        className="cursor-pointer"
                      />
                      <span className="truncate">{chainData.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </ButtonOptions>
        </div>
      </div>

      <ImagePromptModal
        open={Boolean(pendingImagePromptEdit)}
        prompt={pendingImagePromptEdit?.prompt ?? ''}
        onChange={(prompt) =>
          setPendingImagePromptEdit(
            pendingImagePromptEdit ? { ...pendingImagePromptEdit, prompt } : undefined
          )
        }
        onCancel={() => setPendingImagePromptEdit(undefined)}
        onConfirm={confirmImagePrompt}
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
