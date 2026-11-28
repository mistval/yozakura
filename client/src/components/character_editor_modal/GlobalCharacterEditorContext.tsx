import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';
import CharacterEditorModal from './CharacterEditorModal.js';

const GLOBAL_CHARACTER_EDITOR_OWNED_KEYS = ['ce_character'] as const;

type GlobalCharacterEditorContextType = {
  open: boolean;
  editingCharacterId: string | undefined;
  showCharacterEditor: (id?: string) => void;
  closeCharacterEditor: () => void;
};

const GlobalCharacterEditorContext = createContext<GlobalCharacterEditorContextType | undefined>(undefined);

export function GlobalCharacterEditorProvider({ children }: { children: ReactNode }) {
  const { open, pushModal, closeModal, layerParams } = useModalQueryParam(
    'charactereditor',
    GLOBAL_CHARACTER_EDITOR_OWNED_KEYS
  );

  const editingCharacterId = layerParams.get('ce_character') ?? undefined;

  const showCharacterEditor = useCallback(
    (id?: string) => {
      pushModal({ ce_character: id ?? undefined });
    },
    [pushModal]
  );

  const closeCharacterEditor = closeModal;

  const value = useMemo(
    () => ({ open, editingCharacterId, showCharacterEditor, closeCharacterEditor }),
    [open, editingCharacterId, showCharacterEditor, closeCharacterEditor]
  );

  return (
    <GlobalCharacterEditorContext.Provider value={value}>{children}</GlobalCharacterEditorContext.Provider>
  );
}

export function useGlobalCharacterEditor() {
  const ctx = useContext(GlobalCharacterEditorContext);
  if (!ctx) throw new Error('useGlobalCharacterEditor must be used inside GlobalCharacterEditorProvider');
  return ctx;
}

export function GlobalCharacterEditorModal() {
  const { open, editingCharacterId, closeCharacterEditor } = useGlobalCharacterEditor();
  return (
    <CharacterEditorModal
      queryParam="charactereditor"
      open={open}
      characterId={editingCharacterId}
      scenarioId={undefined}
      onClose={closeCharacterEditor}
    />
  );
}
