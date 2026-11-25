import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  CharacterDraftAccessor,
  ObjectEditorTarget,
} from '../../engine/object_editor/object_editor_delegates.js';
import { useQueryParams } from '../../util/queryParams.js';

type ObjectEditorContextType = {
  open: boolean;
  target: ObjectEditorTarget | undefined;
  openMapObjectEditor: (mapId: string) => void;
  openScenarioCharacterObjectEditor: (characterId: string) => void;
  openGlobalCharacterObjectEditor: (characterId: string) => void;
  openDraftCharacterObjectEditor: (accessor: CharacterDraftAccessor) => void;
  openRelationshipObjectEditor: (fromId: string, toId: string) => void;
  closeObjectEditor: () => void;
};

const ObjectEditorContext = createContext<ObjectEditorContextType | undefined>(undefined);

function parseObjectEditorTarget(
  params: URLSearchParams,
  draftAccessor: CharacterDraftAccessor | undefined
): ObjectEditorTarget | undefined {
  const isOpen = params.has('objecteditor') && params.get('objecteditor') !== 'false';
  if (!isOpen) {
    return undefined;
  }

  const type = params.get('oe_type');
  if (type === 'world_map') {
    const mapId = params.get('oe_id');
    return mapId ? { kind: 'world_map', mapId } : undefined;
  }
  if (type === 'scenario_character') {
    const characterId = params.get('oe_id');
    return characterId ? { kind: 'scenario_character', characterId } : undefined;
  }
  if (type === 'global_character') {
    const characterId = params.get('oe_id');
    return characterId ? { kind: 'global_character', characterId } : undefined;
  }
  if (type === 'character_draft') {
    return draftAccessor ? { kind: 'character_draft', accessor: draftAccessor } : undefined;
  }
  if (type === 'character_relationship') {
    const fromId = params.get('oe_from');
    const toId = params.get('oe_to');
    return fromId && toId ? { kind: 'character_relationship', fromId, toId } : undefined;
  }

  return undefined;
}

export function ObjectEditorProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useQueryParams();
  const [draftAccessor, setDraftAccessor] = useState<CharacterDraftAccessor | undefined>(undefined);

  const target = useMemo(() => parseObjectEditorTarget(params, draftAccessor), [params, draftAccessor]);
  const open = Boolean(target);

  const openMapObjectEditor = useCallback(
    (mapId: string) => {
      setDraftAccessor(undefined);
      setParams({
        objecteditor: true,
        oe_type: 'world_map',
        oe_id: mapId,
        oe_from: undefined,
        oe_to: undefined,
      });
    },
    [setParams]
  );

  const openScenarioCharacterObjectEditor = useCallback(
    (characterId: string) => {
      setDraftAccessor(undefined);
      setParams({
        objecteditor: true,
        oe_type: 'scenario_character',
        oe_id: characterId,
        oe_from: undefined,
        oe_to: undefined,
      });
    },
    [setParams]
  );

  const openGlobalCharacterObjectEditor = useCallback(
    (characterId: string) => {
      setDraftAccessor(undefined);
      setParams({
        objecteditor: true,
        oe_type: 'global_character',
        oe_id: characterId,
        oe_from: undefined,
        oe_to: undefined,
      });
    },
    [setParams]
  );

  const openDraftCharacterObjectEditor = useCallback(
    (accessor: CharacterDraftAccessor) => {
      setDraftAccessor(accessor);
      setParams({
        objecteditor: true,
        oe_type: 'character_draft',
        oe_id: undefined,
        oe_from: undefined,
        oe_to: undefined,
      });
    },
    [setParams]
  );

  const openRelationshipObjectEditor = useCallback(
    (fromId: string, toId: string) => {
      setDraftAccessor(undefined);
      setParams({
        objecteditor: true,
        oe_type: 'character_relationship',
        oe_id: undefined,
        oe_from: fromId,
        oe_to: toId,
      });
    },
    [setParams]
  );

  const closeObjectEditor = useCallback(() => {
    setDraftAccessor(undefined);
    setParams({
      objecteditor: undefined,
      oe_type: undefined,
      oe_id: undefined,
      oe_from: undefined,
      oe_to: undefined,
    });
  }, [setParams]);

  const value = useMemo<ObjectEditorContextType>(
    () => ({
      open,
      target,
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
