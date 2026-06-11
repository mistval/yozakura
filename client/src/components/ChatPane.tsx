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
  useActiveChatStore,
  useChatUserLocation,
} from '../state/active_chat_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import ChatSettings from './chat/chat_settings.js';
import CharacterChatSettings from './chat/character_chat_settings.js';

const CHAT_PANE_WIDTH_CLASS_BY_SETTING: Record<ChatPaneWidth, string> = {
  narrow: 'w-full max-w-3xl mx-auto',
  medium: 'w-full max-w-4xl mx-auto',
  wide: 'w-full max-w-5xl mx-auto',
  extra_wide: 'w-full max-w-6xl mx-auto',
  unconstrained: 'w-[98vw] max-w-none relative left-1/2 ml-[-49vw]',
};

export default function ChatPane() {
  const userChatSpeakerSelectionMode = useSettingsStore((s) => s.userChatSpeakerSelectionMode);
  const chatPaneWidth = useSettingsStore((s) => s.chatPaneWidth);
  const groupChatMessageLimit = useSettingsStore((s) => s.groupChatMessageLimit);
  const richNpcMessageCount = useSettingsStore((s) => s.richNpcMessageCount);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const transcript = useActiveChatStore((state) => state.transcript);
  const chatMode = useActiveChatMedium();
  const participants = useActiveChatParticipants();
  const chatState = useActiveChatStore((state) => state.chatState);
  const processingMemoryStatusInfo = useActiveChatStore((state) => state.processingMemoryStatusInfo);
  const userCharacterId = useScenarioStore((state) => state.activeScenario?.userCharacterId);
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

  const generatingAutoImage = chatState === 'generating_image';
  const chatMemoryUpdateStatus =
    chatState === 'processing_memories' ? (processingMemoryStatusInfo ?? '') : '';
  const chatLoopBusy =
    chatState === 'npc_speaking' || chatState === 'processing_memories' || chatState === 'generating_image';
  const isAwaitingUserInput = chatState === 'awaiting_user_input';

  const participantById = useMemo(
    () => Object.fromEntries(participants.map((participant) => [participant.id, participant])),
    [participants]
  );

  assertNonNullish(participants[0]);
  assertNonNullish(userCharacterId);

  const includesUser = participants.some((participant) => participant.id === userCharacterId);
  const nonUserParticipants = participants.filter((participant) => participant.id !== userCharacterId);
  const isTwoParticipantChat = participants.length === 2;
  const isManualSpeakerSelection = includesUser && userChatSpeakerSelectionMode === 'manual';
  const showSkipButton = participants.length > 2 && !isManualSpeakerSelection;
  const showImageButton = includesUser;
  const busy = chatLoopBusy;
  const chatPaneWidthClass = CHAT_PANE_WIDTH_CLASS_BY_SETTING[chatPaneWidth];
  const canPerformMessageActions =
    participants.some((participant) => participant.id === userCharacterId) && !busy;

  const messageLimit = includesUser
    ? undefined
    : participants.length > 2
      ? groupChatMessageLimit
      : richNpcMessageCount * 2;

  const npcOnlyProgressLabel = includesUser
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

    const fullPrompt = await ChatCoordinator.buildSceneImageFullPrompt(imageCharacterId);

    if (editImagePromptsBeforeDispatch) {
      setImagePrompt(fullPrompt);
      setShowImagePrompt(true);
      return;
    }

    await ChatCoordinator.generateImageFromPrompt(fullPrompt);
  };

  const generateImageNow = async () => {
    await ChatCoordinator.generateImageFromPrompt(imagePrompt);
  };

  const deleteMessage = (id: string) => {
    ChatCoordinator.deleteMessageById(id);
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
  };

  const redoMessage = async (id: string) => {
    await ChatCoordinator.redoMessageById(id);
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
  };

  const saveEditingMessageEdit = async () => {
    const trimmed = editingMessageDraft.trim();
    if (!trimmed || !editingMessageId) {
      return;
    }

    await ChatCoordinator.editMessageById(editingMessageId, trimmed);
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
  };

  const requestEndChat = () => {
    submitChatRequestEnd();
  };

  const isNearTranscriptBottom = (container: HTMLDivElement) => {
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    return remaining <= 24;
  };

  const scrollTranscriptToBottom = () => {
    const container = transcriptContainerRef.current;
    if (!container || !autoScrollUnlockedRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  };

  const handleTranscriptScroll = () => {
    const container = transcriptContainerRef.current;
    if (!container) {
      return;
    }

    autoScrollUnlockedRef.current = isNearTranscriptBottom(container);
  };

  useEffect(() => {
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
          {includesUser && (
            <button type="button" onClick={() => setShowChatSettings(true)}>
              Chat Settings
            </button>
          )}
          {includesUser && (
            <button
              type="button"
              onClick={requestEndChat}
              disabled={busy || !isAwaitingUserInput}
              className="button-emphasized font-semibold"
            >
              End Chat
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="w-44 shrink-0 space-y-2 overflow-y-auto">
          {nonUserParticipants.map((participant) => (
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
              {isManualSpeakerSelection && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    triggerParticipantSpeak(participant.id);
                  }}
                  disabled={busy || !isAwaitingUserInput}
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
              {participants[0]!.id === userCharacterId
                ? 'Say something to start the conversation.'
                : 'Conversation in progress...'}
            </div>
          )}
          {transcript.getVisibleMessages(userCharacterId).map((entry) => (
            <div
              key={entry.getId()}
              className={`relative group ${includesUser && entry.isSentByCharacter(userCharacterId) ? 'text-right' : ''}`}
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
                    disabled={chatLoopBusy}
                  />
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditingMessageId(undefined)}
                      disabled={chatLoopBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEditingMessageEdit}
                      disabled={chatLoopBusy || !editingMessageDraft.trim()}
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

              {canPerformMessageActions && !chatLoopBusy && !editingMessageId && (
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs h-6 leading-none">
                  <button
                    type="button"
                    onClick={() => {
                      const id = entry.getId();
                      deleteMessage(id);
                    }}
                    disabled={!canPerformMessageActions || chatLoopBusy}
                    title="Delete message"
                    aria-label="Delete message"
                    className="px-1 h-5 w-5 flex items-center justify-center"
                  >
                    🗑
                  </button>

                  {entry.isCharacterChatMessage() &&
                    entry.asCharacterChatMessage().senderId !== userCharacterId && (
                      <button
                        type="button"
                        onClick={() => {
                          const id = entry.getId();
                          redoMessage(id);
                        }}
                        disabled={!canPerformMessageActions || chatLoopBusy}
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
                      disabled={!canPerformMessageActions || chatLoopBusy}
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

      {includesUser && (
        <div className="flex gap-2 mb-0">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && input.trim() && !busy && isAwaitingUserInput) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Type a message"
            rows={2}
            className="flex-1"
          />
          <button type="button" onClick={send} disabled={busy || !input.trim() || !isAwaitingUserInput}>
            Send
          </button>
          {showSkipButton && (
            <button type="button" onClick={submitChatSkipTurn} disabled={busy || !isAwaitingUserInput}>
              Skip
            </button>
          )}
          {showImageButton && (
            <button type="button" onClick={openImagePrompt} disabled={chatLoopBusy || !isAwaitingUserInput}>
              Gen Image
            </button>
          )}
        </div>
      )}

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
