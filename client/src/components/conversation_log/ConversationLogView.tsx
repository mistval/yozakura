import { useMemo } from 'react';
import { ConversationTranscript } from '../../engine/chat/transcript.js';
import type { ConversationStateUpdateNode, StoredConversation } from '../../engine/types.js';
import { useIsMobileLayout } from '../../hooks/use_mobile_layout.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import ChatView from '../chat/ChatView.js';
import { useViewRelationshipCapability } from '../chat/capabilities/use_view_relationship_capability.js';
import { SpoilerSection } from '../ui/SpoilerSection.js';

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
  const isMobileLayout = useIsMobileLayout();
  const charactersById = useScenarioCharacterStore((s) => s.scenarioCharactersById);

  const transcript = useMemo(
    () =>
      selectedEntry ? ConversationTranscript.deserialize(selectedEntry.serializedTranscript) : undefined,
    [selectedEntry]
  );

  const participants = selectedEntry?.serializedTranscript.participants ?? [];
  const participantById = useMemo(
    () => Object.fromEntries(participants.map((participant) => [participant.id, participant] as const)),
    [participants]
  );

  const viewRelationshipCapability = useViewRelationshipCapability({ participants });

  if (!selectedEntry || !transcript) {
    return undefined;
  }

  return (
    <ChatView
      transcript={transcript}
      perspectiveCharacterId={userId}
      participants={participants}
      resolveAvatarImagePath={(senderId) =>
        participantById[senderId]?.imagePath ?? charactersById[senderId]?.imagePath
      }
      headerPlacement="top"
      autoScroll={false}
      messageActionsEnabled={false}
      sidebarQueryParam="cl_participants"
      sidebarInlineClassName="w-44 shrink-0 min-h-0 flex flex-col gap-3"
      sidebarListDesktopClassName="space-y-2 overflow-y-auto min-h-0"
      sidebarCardImageClassName="w-full object-cover object-top border rounded-sm"
      hideMissingParticipantImage={true}
      messageListClassName={
        isMobileLayout
          ? 'space-y-3 flex-1 min-w-0'
          : 'border rounded-sm p-3 overflow-y-auto space-y-3 flex-1 min-h-0'
      }
      messageRowClassName={isMobileLayout ? 'flow-root text-left py-0.5' : 'flow-root text-left px-1 py-0.5'}
      renderHeader={({ isMobileLayout: mobile, participantsDrawerButton }) => (
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {mobile && participantsDrawerButton}
            {onBack && (
              <button type="button" onClick={onBack} aria-label="Back" title="Back">
                ←
              </button>
            )}
            <h2 className="text-lg font-semibold truncate">{selectedEntry.label || 'Conversation'}</h2>
          </div>
          <div className="text-sm text-muted shrink-0">Turn {selectedEntry.turnNumber || 0}</div>
        </div>
      )}
      renderSidebarFooter={({ closeParticipantsDrawer }) =>
        viewRelationshipCapability.canViewRelationship ? (
          <button
            type="button"
            className="w-full"
            onClick={() => {
              closeParticipantsDrawer();
              viewRelationshipCapability.viewRelationship();
            }}
          >
            View Relationship
          </button>
        ) : undefined
      }
      afterMessages={
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
      }
    />
  );
}
