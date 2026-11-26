import { useCallback, useMemo } from 'react';
import type { TranscriptParticipant } from '../../../engine/types.js';
import { assertNonNullish } from '../../../errors/application_error.js';
import { useScenarioLoopStateStore } from '../../../state/scenario_loop_state_store.js';
import type { ParticipantCardAction } from '../ChatView.js';

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
  getParticipantAction: (participant: TranscriptParticipant) => ParticipantCardAction | undefined;
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

  const getParticipantAction = useCallback(
    (participant: TranscriptParticipant): ParticipantCardAction | undefined =>
      participant.id !== userCharacterId
        ? {
            label: 'Speak',
            disabled: !userCanInputChat,
            onClick: () => triggerParticipantSpeak(participant.id),
          }
        : undefined,
    [triggerParticipantSpeak, userCanInputChat, userCharacterId]
  );

  return {
    participantById,
    triggerParticipantSpeak,
    canLongPressAvatar,
    getParticipantAction,
  };
}
