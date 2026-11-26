import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';

type CharacterOverviewTarget = 'overview' | 'character' | 'add-characters' | 'groups';

type ShowCharacterOverviewParams = {
  target?: CharacterOverviewTarget;
  characterId?: string;
  selectedIds?: string[];
  scrolldown?: boolean;
};

const CHARACTER_OVERVIEW_OWNED_KEYS = [
  'cotab',
  'co_character',
  'co_add',
  'selected_ids',
  'scrolldown',
  'cogroup',
] as const;

type CharacterOverviewContextType = {
  open: boolean;
  routeEditingCharacterId: string | undefined;
  validSelectedIds: string[];
  tabParam: string | undefined;
  scrollDownParam: string | undefined;
  selectedGroupId: string | undefined;
  setTabParam: (tab: string | undefined) => void;
  setScrollDownParam: (value: string | undefined) => void;
  setSelectedGroupId: (groupId: string | undefined) => void;
  setSelectedIds: (ids: string[]) => void;
  closeCharacterOverview: () => void;
  showCharacterOverview: (params?: ShowCharacterOverviewParams) => void;
  backToCharacterOverview: () => void;
  openCharacterOverviewEditor: (characterId: string) => void;
  openCharacterOverviewAddCharacters: () => void;
  openCharacterOverviewGroup: (groupId: string) => void;
};

const CharacterOverviewContext = createContext<CharacterOverviewContextType | undefined>(undefined);

export function CharacterOverviewProvider({ children }: { children: ReactNode }) {
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const { open, pushModal, closeModal, updateModalParams, layerParams } = useModalQueryParam(
    'characteroverview',
    CHARACTER_OVERVIEW_OWNED_KEYS
  );

  const rawCharacterId = layerParams.get('co_character') ?? undefined;
  const hasValidCharacterId = Boolean(rawCharacterId && rawCharacterId in charactersById);
  const routeEditingCharacterId = hasValidCharacterId ? rawCharacterId : undefined;
  const tabParam = layerParams.get('cotab') ?? undefined;
  const scrollDownParam = layerParams.get('scrolldown') ?? undefined;
  const selectedGroupId = layerParams.get('cogroup') ?? undefined;

  const validSelectedIds = useMemo(() => {
    return layerParams
      .getAll('selected_ids')
      .filter((id): id is string => typeof id === 'string' && id in charactersById);
  }, [layerParams, charactersById]);

  const setSelectedIds = useCallback(
    (ids: string[]) => {
      const uniqueIds = new Set(ids).values().filter(Boolean).take(2).toArray();
      updateModalParams({ selected_ids: uniqueIds });
    },
    [updateModalParams]
  );

  const setTabParam = useCallback(
    (tab: string | undefined) => updateModalParams({ cotab: tab }),
    [updateModalParams]
  );

  const setScrollDownParam = useCallback(
    (value: string | undefined) => updateModalParams({ scrolldown: value }),
    [updateModalParams]
  );

  const setSelectedGroupId = useCallback(
    (groupId: string | undefined) => updateModalParams({ cogroup: groupId }),
    [updateModalParams]
  );

  const showCharacterOverview = useCallback(
    (incoming?: ShowCharacterOverviewParams) => {
      const target = incoming?.target || 'overview';
      pushModal({
        cotab: target === 'groups' ? 'groups' : undefined,
        co_character: target === 'character' && incoming?.characterId ? incoming.characterId : undefined,
        co_add: target === 'add-characters' ? true : undefined,
        selected_ids: incoming?.selectedIds
          ? new Set(incoming.selectedIds).values().filter(Boolean).take(2).toArray()
          : undefined,
        scrolldown: incoming?.scrolldown ? 'true' : undefined,
      });
    },
    [pushModal]
  );

  const closeCharacterOverview = closeModal;

  const backToCharacterOverview = useCallback(() => {
    updateModalParams({ co_character: undefined, co_add: undefined });
  }, [updateModalParams]);

  const openCharacterOverviewEditor = useCallback(
    (characterId: string) => {
      updateModalParams({ co_character: characterId, co_add: undefined });
    },
    [updateModalParams]
  );

  const openCharacterOverviewAddCharacters = useCallback(() => {
    updateModalParams({ co_add: true, co_character: undefined });
  }, [updateModalParams]);

  const openCharacterOverviewGroup = useCallback(
    (groupId: string) => {
      updateModalParams({ cotab: 'groups', cogroup: groupId });
    },
    [updateModalParams]
  );

  const value = useMemo(
    () => ({
      open,
      routeEditingCharacterId,
      validSelectedIds,
      tabParam,
      scrollDownParam,
      selectedGroupId,
      setTabParam,
      setScrollDownParam,
      setSelectedGroupId,
      setSelectedIds,
      showCharacterOverview,
      closeCharacterOverview,
      backToCharacterOverview,
      openCharacterOverviewEditor,
      openCharacterOverviewAddCharacters,
      openCharacterOverviewGroup,
    }),
    [
      open,
      routeEditingCharacterId,
      validSelectedIds,
      tabParam,
      scrollDownParam,
      selectedGroupId,
      setTabParam,
      setScrollDownParam,
      setSelectedGroupId,
      setSelectedIds,
      showCharacterOverview,
      closeCharacterOverview,
      backToCharacterOverview,
      openCharacterOverviewEditor,
      openCharacterOverviewAddCharacters,
      openCharacterOverviewGroup,
    ]
  );

  return <CharacterOverviewContext.Provider value={value}>{children}</CharacterOverviewContext.Provider>;
}

export function useCharacterOverview() {
  const context = useContext(CharacterOverviewContext);
  if (!context) {
    throw new Error('useCharacterOverview must be used inside CharacterOverviewProvider');
  }
  return context;
}
