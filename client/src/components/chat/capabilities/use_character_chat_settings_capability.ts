import { useCallback } from 'react';
import { useQueryParam } from '../../../util/queryParams.js';

export function useCharacterChatSettingsCapability(): {
  openCharacterChatSettings: (characterId: string) => void;
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
  };
}
