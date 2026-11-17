import { SpoilerSection } from '../ui/SpoilerSection.js';
import type { StoredConversation, ConversationStateUpdateNode } from '../../engine/types.js';
import { useSettingsStore, type ConversationLogWidth } from '../../state/settings_store.js';
import { ConversationTranscript } from '../../engine/chat/transcript.js';
import { useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import { useCharacterOverview } from '../character_overview/CharacterOverviewContext.js';
import { useConversationLog } from './ConversationLogContext.js';
import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';

const CHAT_PANE_WIDTH_OPTIONS: Array<{ value: ConversationLogWidth; label: string }> = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
  { value: 'extra_wide', label: 'Extra Wide' },
  { value: 'unconstrained', label: 'Limit Breaker' },
];

type ConversationLogViewProps = {
  userId: string;
  selectedEntry: StoredConversation | undefined;
  onBack?: () => void;
};

function formatInlineDeltaValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '(none)';
}

function StateUpdateNodeView({ node, pathKey }: { node: ConversationStateUpdateNode; pathKey: string }) {
  if (node.kind === 'spoiler') {
    return (
      <SpoilerSection key={pathKey} title={node.name ?? 'Update'}>
        {typeof node.text === 'string' && <div className="whitespace-pre-wrap mb-3">{node.text}</div>}
        {Array.isArray(node.children) && node.children.length > 0 && (
          <div className="space-y-2 text-sm">
            {node.children.map((child, index) => (
              <StateUpdateNodeView key={`${pathKey}-${index}`} node={child} pathKey={`${pathKey}-${index}`} />
            ))}
          </div>
        )}
      </SpoilerSection>
    );
  }

  if (node.kind === 'text') {
    return (
      <div key={pathKey} className="space-y-2">
        <div className="whitespace-pre-wrap">{node.text}</div>
        {Array.isArray(node.children) && node.children.length > 0 && (
          <div className="space-y-2 text-sm">
            {node.children.map((child, index) => (
              <StateUpdateNodeView key={`${pathKey}-${index}`} node={child} pathKey={`${pathKey}-${index}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div key={pathKey}>
      <strong>
        {node.inlineFromName} {'->'} {node.inlineToName}:
      </strong>{' '}
      {formatInlineDeltaValue(node.inlineFromValue)} {'->'} {formatInlineDeltaValue(node.inlineToValue)}
    </div>
  );
}

export default function ConversationLogView({ userId, selectedEntry, onBack }: ConversationLogViewProps) {
  const conversationLogWidth = useSettingsStore((s) => s.conversationLogWidth);
  const isMobileLayout = useSettingsStore((s) => s.chatPaneWidth === 'mobile');
  const { showCharacterOverview } = useCharacterOverview();
  const { closeConversationLog } = useConversationLog();
  const setSettings = useSettingsStore((s) => s.setSettings);
  const {
    open: participantsDrawerOpen,
    openModal: openParticipantsDrawer,
    closeModal: closeParticipantsDrawer,
  } = useModalQueryParam('cl_participants');

  useEffect(() => {
    if (!isMobileLayout && participantsDrawerOpen) {
      closeParticipantsDrawer();
    }
  }, [isMobileLayout, participantsDrawerOpen, closeParticipantsDrawer]);

  if (!selectedEntry) return undefined;

  const updateConversationLogWidth = (nextWidth: ConversationLogWidth) => {
    setSettings({ conversationLogWidth: nextWidth });
  };

  const transcript = useMemo(() => {
    return ConversationTranscript.deserialize(selectedEntry.serializedTranscript);
  }, [selectedEntry.serializedTranscript]);

  const sidebarContent = (
    <div className="space-y-3">
      <div
        className={
          isMobileLayout
            ? 'grid grid-cols-1 @[420px]:grid-cols-2 gap-2 items-start'
            : 'space-y-2 overflow-y-auto min-h-0'
        }
      >
        {selectedEntry.serializedTranscript.participants.map((participant) => {
          const name = `${participant.firstName} ${participant.lastName}`.trim() || 'Unknown';
          const imagePath = participant.imagePath;
          return (
            <div key={participant.id} className="border rounded-sm p-2 bg-surface-subtle">
              {imagePath && (
                <img
                  src={imagePath}
                  alt={name}
                  className="w-full object-cover object-top border rounded-sm"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="mt-1 text-sm font-medium text-center">{name}</div>
            </div>
          );
        })}
      </div>

      {selectedEntry.serializedTranscript.participants.length === 2 && (
        <button
          type="button"
          className="w-full"
          onClick={() => {
            closeParticipantsDrawer();
            closeConversationLog();
            showCharacterOverview({
              target: 'overview',
              selectedIds: selectedEntry.serializedTranscript.participants.map((p) => p.id),
              scrolldown: true,
            });
          }}
        >
          View Relationship
        </button>
      )}

      <label className="block space-y-1 text-sm">
        <div className="font-medium">Conversation Width</div>
        <select
          value={conversationLogWidth}
          onChange={(event) => updateConversationLogWidth(event.target.value as ConversationLogWidth)}
          className="w-full rounded-input bg-inset"
        >
          {CHAT_PANE_WIDTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <>
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isMobileLayout && (
            <button
              type="button"
              onClick={openParticipantsDrawer}
              aria-label="Open participants"
              title="Participants"
              className="p-1.5! flex items-center justify-center shrink-0"
            >
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
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </svg>
            </button>
          )}
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Back" title="Back">
              ←
            </button>
          )}
          <h2 className="text-lg font-semibold truncate">{selectedEntry.label || 'Conversation'}</h2>
        </div>
        <div className="text-sm text-muted shrink-0">Turn {selectedEntry.turnNumber || 0}</div>
      </div>
      <div className="flex gap-3 min-h-104">
        {!isMobileLayout && <div className="w-44 shrink-0 min-h-0 flex flex-col gap-3">{sidebarContent}</div>}
        <div className="border rounded-sm p-3 overflow-y-auto space-y-2 flex-1 min-h-0">
          {transcript.getVisibleMessages(userId).map((message) => {
            const isUserMessage = message.isSentByCharacter(userId);
            return (
              <div key={`${message.getId()}`} className={isUserMessage ? 'text-right' : ''}>
                {message.isImageMessage() ? (
                  <img src={message.imageUrl()} alt="Generated" className="rounded-sm border inline-block" />
                ) : (
                  <>
                    <strong>{message.getSpeakerName()}:</strong> <Markdown>{message.getContent()}</Markdown>
                  </>
                )}
              </div>
            );
          })}
          <div className="pt-2 space-y-2 text-sm">
            {selectedEntry.stateUpdates.length === 0 ? (
              <div className="text-sm text-muted">No state updates available.</div>
            ) : (
              selectedEntry.stateUpdates.map((node, index) => (
                <StateUpdateNodeView
                  key={`state-update-${index}`}
                  node={node}
                  pathKey={`state-update-${index}`}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {isMobileLayout && (
        <RoutedModalFrame
          queryParam="cl_participants"
          onClose={closeParticipantsDrawer}
          drawerSide="left"
          headerActions={<span className="px-2 py-1 text-sm font-semibold">Participants</span>}
        >
          <div className="@container">{sidebarContent}</div>
        </RoutedModalFrame>
      )}
    </>
  );
}
