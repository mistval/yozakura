import { SpoilerSection } from '../ui/SpoilerSection.js';
import type { StoredConversation, ConversationStateUpdateNode } from '../../engine/types.js';
import { ConversationTranscript } from '../../engine/chat/transcript.js';
import { useMemo } from 'react';
import { useCharacterOverview } from '../character_overview/CharacterOverviewContext.js';
import { useConversationLog } from './ConversationLogContext.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import TranscriptMessageContent from '../chat/TranscriptMessageContent.js';
import ResponsiveDrawerSidebar, {
  ParticipantsDrawerButton,
  useMobileDrawer,
} from '../ui/ResponsiveDrawerSidebar.js';

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
  const { showCharacterOverview } = useCharacterOverview();
  const { closeConversationLog } = useConversationLog();
  const charactersById = useScenarioCharacterStore((s) => s.scenarioCharactersById);
  const {
    isMobileLayout,
    openDrawer: openParticipantsDrawer,
    closeDrawer: closeParticipantsDrawer,
  } = useMobileDrawer('cl_participants');

  if (!selectedEntry) return undefined;

  const transcript = useMemo(() => {
    return ConversationTranscript.deserialize(selectedEntry.serializedTranscript);
  }, [selectedEntry.serializedTranscript]);

  const participantById = useMemo(
    () =>
      Object.fromEntries(
        selectedEntry.serializedTranscript.participants.map((participant) => [participant.id, participant])
      ),
    [selectedEntry.serializedTranscript.participants]
  );

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
    </div>
  );

  return (
    <>
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isMobileLayout && <ParticipantsDrawerButton onClick={openParticipantsDrawer} />}
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Back" title="Back">
              ←
            </button>
          )}
          <h2 className="text-lg font-semibold truncate">{selectedEntry.label || 'Conversation'}</h2>
        </div>
        <div className="text-sm text-muted shrink-0">Turn {selectedEntry.turnNumber || 0}</div>
      </div>
      <div className={isMobileLayout ? 'flex min-w-0' : 'flex gap-3 min-h-104'}>
        <ResponsiveDrawerSidebar
          isDrawer={isMobileLayout}
          queryParam="cl_participants"
          onClose={closeParticipantsDrawer}
          drawerSide="left"
          headerActions={<span className="px-2 py-1 text-sm font-semibold">Participants</span>}
          inlineClassName="w-44 shrink-0 min-h-0 flex flex-col gap-3"
        >
          {sidebarContent}
        </ResponsiveDrawerSidebar>
        <div
          className={
            isMobileLayout
              ? 'space-y-3 flex-1 min-w-0'
              : 'border rounded-sm p-3 overflow-y-auto space-y-3 flex-1 min-h-0'
          }
        >
          {transcript.getVisibleMessages(userId).map((message) => {
            const isCharacterMessage = message.isCharacterChatMessage();
            const senderId = isCharacterMessage ? message.asCharacterChatMessage().senderId : undefined;
            const avatarImagePath = senderId
              ? (participantById[senderId]?.imagePath ?? charactersById[senderId]?.imagePath)
              : undefined;

            return (
              <div
                key={message.getId()}
                className={isMobileLayout ? 'flow-root text-left py-0.5' : 'flow-root text-left px-1 py-0.5'}
              >
                <TranscriptMessageContent
                  isImageMessage={message.isImageMessage()}
                  isCharacterMessage={isCharacterMessage && Boolean(senderId)}
                  imageUrl={message.isImageMessage() ? message.imageUrl() : undefined}
                  speakerName={message.getSpeakerName()}
                  content={message.getContent()}
                  avatarImagePath={avatarImagePath}
                />
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
