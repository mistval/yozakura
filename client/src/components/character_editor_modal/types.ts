import type { YozakuraCardPayload, SillyTavernCardPayload } from '../../engine/character_card_metadata';

export type CharacterEditorModalProps = {
  open: boolean;
  characterId?: string | undefined;
  scenarioId?: string | undefined;
  queryParam?: string | undefined;
  onClose: () => void;
};

export type PendingCardImport =
  | {
      kind: 'yozakura';
      file: File;
      payload: YozakuraCardPayload;
    }
  | {
      kind: 'sillytavern';
      file: File;
      payload: SillyTavernCardPayload;
    };
