import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { TranscriptParticipant } from '../../engine/types.js';
import CharacterAvatar from '../CharacterAvatar.js';
import ResponsiveDrawerSidebar, {
  ParticipantsDrawerButton,
  useMobileDrawer,
} from '../ui/ResponsiveDrawerSidebar.js';
import TranscriptMessageContent from './TranscriptMessageContent.js';

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_THRESHOLD_PX = 8;
const USER_SCROLL_INTERACTION_WINDOW_MS = 1500;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

type LongPressOrigin = {
  x: number;
  y: number;
  timerId: number;
};

export type ParticipantCardAction = {
  label: string;
  disabled?: boolean | undefined;
  onClick: () => void;
};

export type ChatViewHeaderContext = {
  isMobileLayout: boolean;
  openParticipantsDrawer: () => void;
  participantsDrawerButton: ReactNode;
};

export type ChatViewSidebarFooterContext = {
  closeParticipantsDrawer: () => void;
};

export type ChatViewMessageActionHelpers = {
  dismissActionBar: () => void;
  buttonClassName: string;
};

export type ChatViewMessage = {
  id: string;
  speakerName: string;
  content: string;
  senderId?: string | undefined;
  isCharacterMessage?: boolean | undefined;
  isImageMessage?: boolean | undefined;
  imageUrl?: string | undefined;
  customContent?: ReactNode | undefined;
  extraActions?: ((helpers: ChatViewMessageActionHelpers) => ReactNode) | undefined;
};

export type ChatViewProps = {
  messages: readonly ChatViewMessage[];
  isEmpty?: boolean | undefined;
  participants?: TranscriptParticipant[] | undefined;
  resolveAvatarImagePath?: ((senderId: string) => string | undefined) | undefined;

  headerPlacement?: 'column' | 'top' | undefined;
  className?: string | undefined;
  renderHeader?: ((context: ChatViewHeaderContext) => ReactNode) | undefined;
  sidebarQueryParam?: string | undefined;
  sidebarZIndex?: number | undefined;
  sidebarInlineClassName?: string | undefined;
  sidebarListDesktopClassName?: string | undefined;
  sidebarCardImageClassName?: string | undefined;
  hideMissingParticipantImage?: boolean | undefined;
  participantsDrawerAriaLabel?: string | undefined;
  participantsDrawerTitle?: string | undefined;
  renderSidebarFooter?: ((context: ChatViewSidebarFooterContext) => ReactNode) | undefined;
  messageListClassName?: string | undefined;
  messageRowClassName?: string | undefined;
  emptyState?: ReactNode | undefined;
  afterMessages?: ReactNode | undefined;
  autoScroll?: boolean | undefined;

  onParticipantClick?: ((participantId: string) => void) | undefined;
  getParticipantAction?:
    ((participant: TranscriptParticipant) => ParticipantCardAction | undefined) | undefined;
  onAvatarClick?: ((senderId: string) => void) | undefined;
  canLongPressAvatar?: ((senderId: string) => boolean) | undefined;
  onAvatarLongPress?: ((senderId: string) => void) | undefined;
  getAvatarTitle?: ((senderId: string, speakerName: string) => string) | undefined;

  messageActionsEnabled?: boolean | undefined;
  canLongPressMessage?: boolean | undefined;
  onDeleteMessage?: ((messageId: string) => void) | undefined;
  onEditMessage?: ((messageId: string, newContent: string) => void) | undefined;
  onRetryMessage?: ((messageId: string) => void) | undefined;
  canShowRetryMessage?: ((message: ChatViewMessage) => boolean) | undefined;
  retryMessageDisabled?: boolean | undefined;
  onGenerateImageForMessage?: ((messageId: string) => void) | undefined;
  generateImageDisabled?: boolean | undefined;
  extraMessageActions?:
    ((message: ChatViewMessage, helpers: ChatViewMessageActionHelpers) => ReactNode) | undefined;

  onSendMessage?: ((message: string) => void) | undefined;
  inputPlaceholder?: string | undefined;
  inputDisabled?: boolean | undefined;
  canSendMessage?: boolean | undefined;
  inputDraft?: string | undefined;
  onInputDraftChange?: ((nextValue: string) => void) | undefined;
  showStopButton?: boolean | undefined;
  onStopGeneration?: (() => void) | undefined;
  extraInputControls?: ReactNode | undefined;
};

function clearLongPressTimer(ref: React.RefObject<LongPressOrigin | undefined>) {
  if (!ref.current) {
    return;
  }
  window.clearTimeout(ref.current.timerId);
  ref.current = undefined;
}

function hasMovedPastThreshold(origin: LongPressOrigin, event: ReactPointerEvent) {
  return Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_MOVE_THRESHOLD_PX;
}

function isNearTranscriptBottom(container: HTMLDivElement) {
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  return remaining <= 24;
}

export default function ChatView({
  messages,
  isEmpty,
  participants,
  resolveAvatarImagePath,
  headerPlacement = 'column',
  className,
  renderHeader,
  sidebarQueryParam = 'chatparticipants',
  sidebarZIndex,
  sidebarInlineClassName = 'w-44 shrink-0 overflow-y-auto pr-1',
  sidebarListDesktopClassName = 'space-y-2',
  sidebarCardImageClassName = 'w-full h-auto border rounded-sm',
  hideMissingParticipantImage = false,
  participantsDrawerAriaLabel = 'Open participants',
  participantsDrawerTitle = 'Participants',
  renderSidebarFooter,
  messageListClassName,
  messageRowClassName,
  emptyState,
  afterMessages,
  autoScroll = true,
  onParticipantClick,
  getParticipantAction,
  onAvatarClick,
  canLongPressAvatar,
  onAvatarLongPress,
  getAvatarTitle,
  messageActionsEnabled = true,
  canLongPressMessage = false,
  onDeleteMessage,
  onEditMessage,
  onRetryMessage,
  canShowRetryMessage,
  retryMessageDisabled = false,
  onGenerateImageForMessage,
  generateImageDisabled = false,
  extraMessageActions,
  onSendMessage,
  inputPlaceholder = 'Enter a message',
  inputDisabled = false,
  canSendMessage = true,
  inputDraft,
  onInputDraftChange,
  showStopButton = false,
  onStopGeneration,
  extraInputControls,
}: ChatViewProps) {
  const {
    isMobileLayout,
    openDrawer: openParticipantsDrawer,
    closeDrawer: closeParticipantsDrawer,
  } = useMobileDrawer(sidebarQueryParam, Boolean(participants));

  const [uncontrolledNonEmpty, setUncontrolledNonEmpty] = useState(false);
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

  const participantById = useMemo(
    () =>
      Object.fromEntries((participants ?? []).map((participant) => [participant.id, participant] as const)),
    [participants]
  );

  const hasAnyMessageActions = Boolean(
    messageActionsEnabled &&
    (onDeleteMessage || onEditMessage || onRetryMessage || onGenerateImageForMessage || extraMessageActions)
  );

  useEffect(() => {
    return () => {
      clearLongPressTimer(messagePressRef);
      clearLongPressTimer(avatarPressRef);
    };
  }, []);

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
    if (!autoScroll) {
      return undefined;
    }

    const outer = transcriptContainerOuterRef.current;
    const inner = transcriptContainerInnerRef.current;
    if (!outer || !inner) {
      return undefined;
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
  }, [autoScroll]);

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

  const handleMessagePointerDown = (event: ReactPointerEvent<HTMLDivElement>, messageId: string) => {
    if (event.button !== 0 || !canLongPressMessage || !hasAnyMessageActions || editingMessageId) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, textarea, input')) {
      return;
    }

    clearLongPressTimer(messagePressRef);
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
      clearLongPressTimer(messagePressRef);
    }
  };

  const handleAvatarPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    senderId: string,
    longPressAllowed: boolean
  ) => {
    if (event.button !== 0) {
      return;
    }

    suppressAvatarClickRef.current = false;
    clearLongPressTimer(avatarPressRef);
    if (!longPressAllowed || !onAvatarLongPress) {
      return;
    }

    const timerId = window.setTimeout(() => {
      avatarPressRef.current = undefined;
      suppressAvatarClickRef.current = true;
      onAvatarLongPress(senderId);
    }, LONG_PRESS_MS);

    avatarPressRef.current = { x: event.clientX, y: event.clientY, timerId };
  };

  const handleAvatarPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (avatarPressRef.current && hasMovedPastThreshold(avatarPressRef.current, event)) {
      clearLongPressTimer(avatarPressRef);
    }
  };

  const isControlledInput = inputDraft !== undefined && onInputDraftChange !== undefined;
  const inputIsNonEmpty = isControlledInput ? Boolean(inputDraft.trim()) : uncontrolledNonEmpty;

  const consumeInputText = (): string => {
    if (isControlledInput) {
      const trimmed = inputDraft.trim();
      onInputDraftChange('');
      return trimmed;
    }

    if (!inputRef.current) {
      return '';
    }

    const trimmed = inputRef.current.value.trim();
    inputRef.current.value = '';
    setUncontrolledNonEmpty(false);
    return trimmed;
  };

  const handleSend = () => {
    if (!onSendMessage) {
      return;
    }

    const message = consumeInputText();
    if (!message) {
      return;
    }

    autoScrollUnlockedRef.current = true;
    onSendMessage(message);
  };

  const saveEditingMessageEdit = () => {
    const trimmed = editingMessageDraft.trim();
    if (!trimmed || !editingMessageId || !onEditMessage) {
      return;
    }

    const id = editingMessageId;
    setEditingMessageId(undefined);
    setEditingMessageDraft('');
    onEditMessage(id, trimmed);
  };

  const actionBarContainerClassName = isMobileLayout ? 'gap-2 text-2xl h-12 px-2' : 'gap-1 text-xs h-7 px-1';
  const actionBarButtonClassName = isMobileLayout
    ? 'px-1! py-0! h-10 w-10 flex items-center justify-center'
    : 'px-1! py-0! h-5 w-5 flex items-center justify-center';

  const participantsDrawerButton = (
    <ParticipantsDrawerButton
      onClick={openParticipantsDrawer}
      ariaLabel={participantsDrawerAriaLabel}
      title={participantsDrawerTitle}
    />
  );

  const headerElement = renderHeader?.({
    isMobileLayout,
    openParticipantsDrawer,
    participantsDrawerButton,
  });

  const sidebarCards = participants && (
    <div
      className={
        isMobileLayout
          ? 'grid grid-cols-1 @[420px]:grid-cols-2 gap-2 items-start'
          : sidebarListDesktopClassName
      }
    >
      {participants.map((participant) => {
        const displayName = `${participant.firstName} ${participant.lastName}`.trim() || 'Unknown';
        const action = getParticipantAction?.(participant);
        const shouldRenderImage = !hideMissingParticipantImage || Boolean(participant.imagePath);

        return (
          <div
            key={participant.id}
            className={`border rounded-sm p-2 bg-surface-subtle${onParticipantClick ? ' cursor-pointer' : ''}`}
            onClick={onParticipantClick ? () => onParticipantClick(participant.id) : undefined}
          >
            {shouldRenderImage && (
              <img
                src={participant.imagePath}
                alt={displayName}
                className={sidebarCardImageClassName}
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div className="mt-1 text-sm font-medium text-center">{displayName}</div>

            {action && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick();
                }}
                disabled={action.disabled}
                className="text-xs w-full mt-1"
              >
                {action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const sidebarFooter = renderSidebarFooter?.({ closeParticipantsDrawer });

  const sidebarElement = participants && (
    <ResponsiveDrawerSidebar
      isDrawer={isMobileLayout}
      queryParam={sidebarQueryParam}
      onClose={closeParticipantsDrawer}
      drawerSide="left"
      zIndex={sidebarZIndex}
      headerActions={<span className="px-2 py-1 text-sm font-semibold">Participants</span>}
      inlineClassName={sidebarInlineClassName}
    >
      {sidebarFooter ? (
        <div className="space-y-3">
          {sidebarCards}
          {sidebarFooter}
        </div>
      ) : (
        sidebarCards
      )}
    </ResponsiveDrawerSidebar>
  );

  const resolvedMessageListClassName =
    messageListClassName ??
    `border rounded-sm ${isMobileLayout ? 'p-1' : 'p-2'} overflow-y-auto space-y-2 flex-1 min-h-0`;

  const resolvedMessageRowClassName =
    messageRowClassName ??
    `relative group flow-root text-left rounded-sm ${isMobileLayout ? 'px-0.5' : 'px-1'} py-0.5`;

  const messageRows = messages.map((entry) => {
    const entryId = entry.id;
    const isActionBarActive = activeActionMessageId === entryId;
    const isCharacterMessage = Boolean(entry.isCharacterMessage);
    const senderId = entry.senderId;
    const avatarImagePath = senderId
      ? resolveAvatarImagePath
        ? resolveAvatarImagePath(senderId)
        : participantById[senderId]?.imagePath
      : undefined;
    const longPressAvatarAllowed = Boolean(senderId && canLongPressAvatar?.(senderId));
    const interactiveAvatar = Boolean(
      senderId && (onAvatarClick || (onAvatarLongPress && longPressAvatarAllowed))
    );

    const showDelete = Boolean(onDeleteMessage);
    const showGenerateImage = Boolean(onGenerateImageForMessage && isCharacterMessage);
    const showRetry = Boolean(onRetryMessage && canShowRetryMessage?.(entry));
    const showEdit = Boolean(onEditMessage && !entry.isImageMessage && entry.customContent === undefined);
    const perMessageActions = hasAnyMessageActions
      ? entry.extraActions?.({
          dismissActionBar: () => setActiveActionMessageId(undefined),
          buttonClassName: actionBarButtonClassName,
        })
      : undefined;
    const callbackActions = hasAnyMessageActions
      ? extraMessageActions?.(entry, {
          dismissActionBar: () => setActiveActionMessageId(undefined),
          buttonClassName: actionBarButtonClassName,
        })
      : undefined;
    const extraActions =
      perMessageActions || callbackActions ? (
        <>
          {perMessageActions}
          {callbackActions}
        </>
      ) : undefined;
    const rowHasActions =
      hasAnyMessageActions &&
      (showDelete || showGenerateImage || showRetry || showEdit || Boolean(extraActions));

    return (
      <div
        key={entryId}
        data-message-id={entryId}
        onPointerDown={rowHasActions ? (event) => handleMessagePointerDown(event, entryId) : undefined}
        onPointerMove={rowHasActions ? handleMessagePointerMove : undefined}
        onPointerUp={rowHasActions ? () => clearLongPressTimer(messagePressRef) : undefined}
        onPointerCancel={rowHasActions ? () => clearLongPressTimer(messagePressRef) : undefined}
        onContextMenu={
          rowHasActions
            ? (event) => {
                if (suppressMessageContextMenuRef.current) {
                  suppressMessageContextMenuRef.current = false;
                  event.preventDefault();
                }
              }
            : undefined
        }
        className={resolvedMessageRowClassName}
      >
        {editingMessageId === entryId && messageActionsEnabled && onEditMessage ? (
          <div className="flex items-start gap-2.5">
            {senderId && (
              <CharacterAvatar
                imagePath={avatarImagePath}
                name={entry.speakerName}
                className="h-10 w-10 border-border-strong bg-surface-subtle"
              />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <strong>{entry.speakerName}:</strong>
              </div>
              <textarea
                value={editingMessageDraft}
                onChange={(event) => setEditingMessageDraft(event.target.value)}
                className="w-full min-h-20 border rounded-sm p-2 bg-inset text-base leading-relaxed field-sizing-content"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setEditingMessageId(undefined)}>
                  Cancel
                </button>
                <button type="button" onClick={saveEditingMessageEdit} disabled={!editingMessageDraft.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : entry.customContent !== undefined ? (
          entry.customContent
        ) : (
          <TranscriptMessageContent
            isImageMessage={Boolean(entry.isImageMessage)}
            isCharacterMessage={isCharacterMessage && Boolean(senderId)}
            imageUrl={entry.imageUrl}
            speakerName={entry.speakerName}
            content={entry.content}
            avatarImagePath={avatarImagePath}
            renderAvatarWrapper={
              senderId && interactiveAvatar
                ? (avatar) => (
                    <button
                      type="button"
                      onPointerDown={(event) =>
                        handleAvatarPointerDown(event, senderId, longPressAvatarAllowed)
                      }
                      onPointerMove={handleAvatarPointerMove}
                      onPointerUp={() => clearLongPressTimer(avatarPressRef)}
                      onPointerCancel={() => clearLongPressTimer(avatarPressRef)}
                      onContextMenu={(event) => event.preventDefault()}
                      onClick={() => {
                        if (suppressAvatarClickRef.current) {
                          suppressAvatarClickRef.current = false;
                          return;
                        }
                        onAvatarClick?.(senderId);
                      }}
                      title={getAvatarTitle?.(senderId, entry.speakerName)}
                      aria-label={`${entry.speakerName} avatar`}
                      className="float-left mr-2.5 mb-0.5 p-0! border-0! rounded-full! bg-transparent! shrink-0 select-none touch-manipulation"
                    >
                      {avatar}
                    </button>
                  )
                : undefined
            }
          />
        )}

        {editingMessageId !== entryId && rowHasActions && (
          <div
            className={`absolute bottom-1 right-1 transition-opacity flex items-center ${actionBarContainerClassName} rounded-sm border border-border-default bg-emphasized/95 shadow-sm leading-none ${
              isActionBarActive
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
            }`}
          >
            {showDelete && onDeleteMessage && (
              <button
                type="button"
                onClick={() => {
                  setActiveActionMessageId(undefined);
                  setEditingMessageId(undefined);
                  setEditingMessageDraft('');
                  onDeleteMessage(entryId);
                }}
                title="Delete message"
                aria-label="Delete message"
                className={actionBarButtonClassName}
              >
                🗑
              </button>
            )}

            {showGenerateImage && onGenerateImageForMessage && (
              <button
                type="button"
                onClick={() => {
                  setActiveActionMessageId(undefined);
                  onGenerateImageForMessage(entryId);
                }}
                disabled={generateImageDisabled}
                title="Generate image"
                aria-label="Generate image"
                className={actionBarButtonClassName}
              >
                🖼️
              </button>
            )}

            {showRetry && onRetryMessage && (
              <button
                type="button"
                onClick={() => {
                  setActiveActionMessageId(undefined);
                  setEditingMessageId(undefined);
                  setEditingMessageDraft('');
                  onRetryMessage(entryId);
                }}
                disabled={retryMessageDisabled}
                title="Retry message"
                aria-label="Retry message"
                className={actionBarButtonClassName}
              >
                ↻
              </button>
            )}

            {showEdit && (
              <button
                type="button"
                onClick={() => {
                  lastUserScrollInteractionAtRef.current = -Infinity;
                  setActiveActionMessageId(undefined);
                  setEditingMessageId(entryId);
                  setEditingMessageDraft(entry.content);
                }}
                title="Edit message"
                aria-label="Edit message"
                className={actionBarButtonClassName}
              >
                ✎
              </button>
            )}

            {extraActions}
          </div>
        )}
      </div>
    );
  });

  const showEmptyState = (isEmpty ?? messages.length === 0) && emptyState;

  const messageListElement = (
    <div
      ref={autoScroll ? transcriptContainerOuterRef : undefined}
      onScroll={autoScroll ? handleTranscriptScroll : undefined}
      onWheel={autoScroll ? markUserScrollInteraction : undefined}
      onTouchMove={autoScroll ? markUserScrollInteraction : undefined}
      onPointerDown={
        autoScroll
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (event.clientX >= rect.left + event.currentTarget.clientWidth) {
                markUserScrollInteraction();
              }
            }
          : undefined
      }
      onKeyDown={
        autoScroll
          ? (event) => {
              if (SCROLL_KEYS.has(event.key)) {
                markUserScrollInteraction();
              }
            }
          : undefined
      }
      style={autoScroll ? { overflowAnchor: 'none' } : undefined}
      className={resolvedMessageListClassName}
    >
      {autoScroll ? (
        <div ref={transcriptContainerInnerRef} className="space-y-3">
          {showEmptyState}
          {messageRows}
          {afterMessages}
        </div>
      ) : (
        <>
          {showEmptyState}
          {messageRows}
          {afterMessages}
        </>
      )}
    </div>
  );

  const inputAreaElement = onSendMessage && (
    <div className="flex items-stretch gap-1.5 sm:gap-2 shrink-0">
      <textarea
        ref={isControlledInput ? undefined : inputRef}
        value={isControlledInput ? inputDraft : undefined}
        onChange={(event) => {
          if (isControlledInput) {
            onInputDraftChange(event.target.value);
          } else {
            setUncontrolledNonEmpty(Boolean(event.target.value.trim()));
          }
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            inputIsNonEmpty &&
            canSendMessage &&
            !inputDisabled
          ) {
            event.preventDefault();
            handleSend();
          }
        }}
        disabled={inputDisabled}
        placeholder={inputPlaceholder}
        rows={2}
        className="flex-1 min-w-0"
      />
      {showStopButton && onStopGeneration && (
        <button
          type="button"
          onClick={onStopGeneration}
          aria-label="Stop generation"
          className={isMobileLayout ? 'px-2! shrink-0' : 'shrink-0'}
        >
          ■
        </button>
      )}
      {canSendMessage && (
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSendMessage || inputDisabled || !inputIsNonEmpty}
          aria-label="Send"
          title="Send"
          className={isMobileLayout ? 'px-2.5! flex items-center justify-center shrink-0' : 'shrink-0'}
        >
          {isMobileLayout ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
      {extraInputControls}
    </div>
  );

  if (headerPlacement === 'top') {
    const resolvedBodyClassName = className ?? (isMobileLayout ? 'flex min-w-0' : 'flex gap-3 min-h-104');

    return (
      <>
        {headerElement}
        <div className={resolvedBodyClassName}>
          {sidebarElement}
          {messageListElement}
        </div>
      </>
    );
  }

  const resolvedOuterClassName =
    className ??
    `bg-emphasized h-full w-full flex min-h-0 ${
      isMobileLayout ? 'flex-col p-1 gap-1.5' : 'flex-row border-r border-border-default p-3 gap-3'
    }`;

  return (
    <div className={resolvedOuterClassName}>
      {sidebarElement}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-2">
        {headerElement}
        {messageListElement}
        {inputAreaElement}
      </div>
    </div>
  );
}
