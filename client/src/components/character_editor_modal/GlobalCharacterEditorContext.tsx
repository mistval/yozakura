import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useQueryParams } from '../../util/queryParams.js';
import CharacterEditorModal from './CharacterEditorModal.js';

type GlobalCharacterEditorContextType = {
  open: boolean;
  editingCharacterId: string | undefined;
  showCharacterEditor: (id?: string) => void;
  closeCharacterEditor: () => void;
};

const GlobalCharacterEditorContext = createContext<GlobalCharacterEditorContextType | undefined>(undefined);

export function GlobalCharacterEditorProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useQueryParams();

  const open = params.has('charactereditor') && params.get('charactereditor') !== 'false';
  const editingCharacterId = params.get('ce_character') ?? undefined;

  const showCharacterEditor = (id?: string) => {
    setParams({ charactereditor: true, ce_character: id ?? undefined });
  };

  const closeCharacterEditor = () => {
    setParams({ charactereditor: undefined, ce_character: undefined });
  };

  const value = useMemo(
    () => ({ open, editingCharacterId, showCharacterEditor, closeCharacterEditor }),
    [open, editingCharacterId, params]
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
