import { SpoilerSection } from '../ui/SpoilerSection.js';
import type { StoredConversation, ConversationStateUpdateNode } from '../../engine/types.js';
import { useSettingsStore, type ChatPaneWidth } from '../../state/settings_store.js';
import { ConversationTranscript } from '../../engine/chat/transcript.js';
import { useMemo } from 'react';
import Markdown from 'react-markdown';
import { useCharacterOverview } from '../character_overview/CharacterOverviewContext.js';
import { useConversationLog } from './ConversationLogContext.js';

const CHAT_PANE_WIDTH_OPTIONS: Array<{ value: ChatPaneWidth; label: string }> = [
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
  const { showCharacterOverview } = useCharacterOverview();
  const { closeConversationLog } = useConversationLog();
  const setSettings = useSettingsStore((s) => s.setSettings);

  if (!selectedEntry) return undefined;

  const updateConversationLogWidth = (nextWidth: ChatPaneWidth) => {
    setSettings({ conversationLogWidth: nextWidth });
  };

  const transcript = useMemo(() => {
    return ConversationTranscript.deserialize(selectedEntry.serializedTranscript);
  }, [selectedEntry.serializedTranscript]);

  const referencesUser = useMemo(() => {
    return transcript.hasMemoryRaggedCharacter(userId);
  }, [transcript, userId]);

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Back" title="Back">
              ←
            </button>
          )}
          <h2 className="text-lg font-semibold">{selectedEntry.label || 'Conversation'}</h2>
        </div>
        <div className="text-sm text-muted">Turn {selectedEntry.turnNumber || 0}</div>
      </div>
      <div className="flex gap-3 min-h-104">
        <div className="w-44 shrink-0 min-h-0 flex flex-col gap-3">
          <div className="space-y-2 overflow-y-auto min-h-0">
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
              onClick={() => {
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
              onChange={(event) => updateConversationLogWidth(event.target.value as ChatPaneWidth)}
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
    </>
  );
}
