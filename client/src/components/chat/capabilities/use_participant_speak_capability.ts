import { useCallback, useMemo } from 'react';
import type { TranscriptParticipant } from '../../../engine/types.js';
import { assertNonNullish } from '../../../errors/application_error.js';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store.js';
import type { ChatViewProps } from '../ChatView.js';

export function useParticipantSpeakCapability({
  participants,
  userCharacterId,
  userCanInputChat,
}: {
  participants: TranscriptParticipant[];
  userCharacterId: string;
  userCanInputChat: boolean;
}): {
  participantById: Record<string, TranscriptParticipant>;
  triggerParticipantSpeak: (participantId: string) => void;
  canLongPressAvatar: (senderId: string) => boolean;
  paneProps: Pick<ChatViewProps, 'getParticipantAction' | 'canLongPressAvatar' | 'onAvatarLongPress'>;
} {
  const submitChatSpeakAs = useScenarioLoopStateStore((state) => state.submitChatSpeakAs);

  const participantById = useMemo(
    () => Object.fromEntries(participants.map((participant) => [participant.id, participant] as const)),
    [participants]
  );

  const triggerParticipantSpeak = useCallback(
    (participantId: string) => {
      const participant = participantById[participantId];
      assertNonNullish(participant, `Participant with ID ${participantId} not found`);
      submitChatSpeakAs(participant.id);
    },
    [participantById, submitChatSpeakAs]
  );

  const canLongPressAvatar = useCallback(
    (senderId: string) =>
      Boolean(senderId && senderId !== userCharacterId && participantById[senderId] && userCanInputChat),
    [participantById, userCanInputChat, userCharacterId]
  );

  return {
    participantById,
    triggerParticipantSpeak,
    canLongPressAvatar,
    paneProps: {
      getParticipantAction: (participant) =>
        participant.id !== userCharacterId
          ? {
              label: 'Speak',
              disabled: !userCanInputChat,
              onClick: () => triggerParticipantSpeak(participant.id),
            }
          : undefined,
      canLongPressAvatar,
      onAvatarLongPress: triggerParticipantSpeak,
    },
  };
}
