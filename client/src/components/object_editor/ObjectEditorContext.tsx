import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  OBJECT_EDITOR_OWNED_KEYS,
  parseObjectEditorTarget,
  serializeObjectEditorTarget,
  type CharacterDraftAccessor,
  type ObjectEditorTarget,
} from '../../engine/object_editor/object_editor_delegates.js';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';
import { useUserCanInputChat } from '../../state/chat_state.js';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useCurrentTurnCharacterId, useTurnMachineStore } from '../../state/turn_machine_store.js';

export function useCanOpenObjectEditor(): boolean {
  const runningForScenario = useScenarioLoopStateStore((s) => s.runningForScenario);
  const autoMode = useScenarioLoopStateStore((s) => s.autoMode);
  const userCharacterId = useScenarioStore((s) => s.activeScenario?.userCharacterId);
  const chatState = useTurnMachineStore((s) => s.chatState);
  const currentTurnCharacterId = useCurrentTurnCharacterId();
  const userCanInputChat = useUserCanInputChat();

  if (!runningForScenario) {
    return true;
  }

  if (autoMode || !userCharacterId) {
    return false;
  }

  if (chatState === 'inactive') {
    return currentTurnCharacterId === userCharacterId;
  }

  return userCanInputChat;
}

type ObjectEditorContextType = {
  open: boolean;
  target: ObjectEditorTarget | undefined;
  hasOverlayAbove: boolean;
  canOpenObjectEditor: boolean;
  openObjectEditor: (target: ObjectEditorTarget) => void;
  openMapObjectEditor: (mapId: string) => void;
  openScenarioCharacterObjectEditor: (characterId: string) => void;
  openGlobalCharacterObjectEditor: (characterId: string) => void;
  openDraftCharacterObjectEditor: (accessor: CharacterDraftAccessor) => void;
  openRelationshipObjectEditor: (fromId: string, toId: string) => void;
  closeObjectEditor: () => void;
};

const ObjectEditorContext = createContext<ObjectEditorContextType | undefined>(undefined);

export function ObjectEditorProvider({ children }: { children: ReactNode }) {
  const { pushModal, closeModal, layerParams, hasOverlayAbove } = useModalQueryParam(
    'objecteditor',
    OBJECT_EDITOR_OWNED_KEYS
  );
  const [draftAccessor, setDraftAccessor] = useState<CharacterDraftAccessor | undefined>(undefined);
  const canOpenObjectEditor = useCanOpenObjectEditor();

  const target = useMemo(
    () => parseObjectEditorTarget(layerParams, draftAccessor),
    [layerParams, draftAccessor]
  );
  const open = Boolean(target);

  const openObjectEditor = useCallback(
    (nextTarget: ObjectEditorTarget) => {
      if (!canOpenObjectEditor) {
        return;
      }
      setDraftAccessor(nextTarget.kind === 'character_draft' ? nextTarget.accessor : undefined);
      pushModal(serializeObjectEditorTarget(nextTarget));
    },
    [canOpenObjectEditor, pushModal]
  );

  const openMapObjectEditor = useCallback(
    (mapId: string) => openObjectEditor({ kind: 'world_map', mapId }),
    [openObjectEditor]
  );

  const openScenarioCharacterObjectEditor = useCallback(
    (characterId: string) => openObjectEditor({ kind: 'scenario_character', characterId }),
    [openObjectEditor]
  );

  const openGlobalCharacterObjectEditor = useCallback(
    (characterId: string) => openObjectEditor({ kind: 'global_character', characterId }),
    [openObjectEditor]
  );

  const openDraftCharacterObjectEditor = useCallback(
    (accessor: CharacterDraftAccessor) => openObjectEditor({ kind: 'character_draft', accessor }),
    [openObjectEditor]
  );

  const openRelationshipObjectEditor = useCallback(
    (fromId: string, toId: string) => openObjectEditor({ kind: 'character_relationship', fromId, toId }),
    [openObjectEditor]
  );

  const closeObjectEditor = useCallback(() => {
    setDraftAccessor(undefined);
    closeModal();
  }, [closeModal]);

  const value = useMemo<ObjectEditorContextType>(
    () => ({
      open,
      target,
      hasOverlayAbove,
      canOpenObjectEditor,
      openObjectEditor,
      openMapObjectEditor,
      openScenarioCharacterObjectEditor,
      openGlobalCharacterObjectEditor,
      openDraftCharacterObjectEditor,
      openRelationshipObjectEditor,
      closeObjectEditor,
    }),
    [
      open,
      target,
      hasOverlayAbove,
      canOpenObjectEditor,
      openObjectEditor,
      openMapObjectEditor,
      openScenarioCharacterObjectEditor,
      openGlobalCharacterObjectEditor,
      openDraftCharacterObjectEditor,
      openRelationshipObjectEditor,
      closeObjectEditor,
    ]
  );

  return <ObjectEditorContext.Provider value={value}>{children}</ObjectEditorContext.Provider>;
}

export function useObjectEditor(): ObjectEditorContextType {
  const ctx = useContext(ObjectEditorContext);
  if (!ctx) {
    throw new Error('useObjectEditor must be used inside ObjectEditorProvider');
  }
  return ctx;
}
