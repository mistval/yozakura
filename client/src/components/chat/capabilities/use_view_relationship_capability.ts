import { useCallback } from 'react';
import type { TranscriptParticipant } from '../../../engine/types.js';
import { useCharacterOverview } from '../../character_overview/CharacterOverviewContext.js';
import { useConversationLog } from '../../conversation_log/ConversationLogContext.js';

export function useViewRelationshipCapability({ participants }: { participants: TranscriptParticipant[] }) {
  const { showCharacterOverview } = useCharacterOverview();
  const { closeConversationLog } = useConversationLog();

  const canViewRelationship = participants.length === 2;

  const viewRelationship = useCallback(() => {
    closeConversationLog();
    showCharacterOverview({
      target: 'overview',
      selectedIds: participants.map((participant) => participant.id),
      scrolldown: true,
    });
  }, [closeConversationLog, participants, showCharacterOverview]);

  return {
    canViewRelationship,
    viewRelationship,
  };
}
