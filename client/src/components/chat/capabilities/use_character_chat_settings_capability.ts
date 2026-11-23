import { useCallback } from 'react';
import { useQueryParam } from '../../../util/queryParams.js';
import type { ChatViewProps } from '../ChatView.js';

export function useCharacterChatSettingsCapability(): {
  openCharacterChatSettings: (characterId: string) => void;
  paneProps: Pick<ChatViewProps, 'onParticipantClick' | 'onAvatarClick'>;
} {
  const [, setCharacterChatSettingsId] = useQueryParam('characterchatsettings');

  const openCharacterChatSettings = useCallback(
    (characterId: string) => {
      setCharacterChatSettingsId(characterId);
    },
    [setCharacterChatSettingsId]
  );

  return {
    openCharacterChatSettings,
    paneProps: {
      onParticipantClick: openCharacterChatSettings,
      onAvatarClick: openCharacterChatSettings,
    },
  };
}
