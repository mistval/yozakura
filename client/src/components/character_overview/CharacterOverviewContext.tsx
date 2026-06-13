import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { ArrayParam, StringParam, useQueryParams } from 'use-query-params';
import { FlagParam } from '../../hooks/useModalQueryParam.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';

type CharacterOverviewTarget = 'overview' | 'character' | 'add-characters';

type ShowCharacterOverviewParams = {
  target?: CharacterOverviewTarget;
  characterId?: string;
  selectedIds?: string[];
  scrolldown?: boolean;
};

type CharacterOverviewContextType = {
  open: boolean;
  routeEditingCharacterId: string | undefined;
  validSelectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  closeCharacterOverview: () => void;
  showCharacterOverview: (params?: ShowCharacterOverviewParams) => void;
  backToCharacterOverview: () => void;
  openCharacterOverviewEditor: (characterId: string) => void;
  openCharacterOverviewAddCharacters: () => void;
};

const CharacterOverviewContext = createContext<CharacterOverviewContextType | undefined>(undefined);

export function CharacterOverviewProvider({ children }: { children: ReactNode }) {
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);

  const [params, setParams] = useQueryParams({
    characteroverview: FlagParam,
    co_character: StringParam,
    co_add: FlagParam,
    selected_ids: ArrayParam,
    scrolldown: StringParam,
  });

  const open = params.characteroverview ?? false;
  const rawCharacterId = params.co_character ?? undefined;
  const hasValidCharacterId = Boolean(rawCharacterId && rawCharacterId in charactersById);
  const routeEditingCharacterId = hasValidCharacterId ? rawCharacterId : undefined;

  const validSelectedIds = useMemo(() => {
    return (Array.isArray(params.selected_ids) ? params.selected_ids : []).filter(
      (id): id is string => typeof id === 'string' && id in charactersById
    );
  }, [params.selected_ids, charactersById]);

  const setSelectedIds = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, 2);
    setParams({ selected_ids: uniqueIds });
  };

  const showCharacterOverview = (incoming?: ShowCharacterOverviewParams) => {
    const target = incoming?.target || 'overview';
    const next: Record<string, unknown> = { characteroverview: true };

    if (target === 'character' && incoming?.characterId) {
      next.co_character = incoming.characterId;
    }
    if (target === 'add-characters') {
      next.co_add = true;
    }
    if (incoming?.selectedIds) {
      next.selected_ids = [...new Set(incoming.selectedIds)].filter(Boolean).slice(0, 2);
    }
    if (incoming?.scrolldown) {
      next.scrolldown = 'true';
    }

    setParams(next as Parameters<typeof setParams>[0]);
  };

  const closeCharacterOverview = () => {
    setParams({
      characteroverview: undefined as unknown as boolean,
      co_character: undefined,
      co_add: undefined as unknown as boolean,
      selected_ids: undefined,
      scrolldown: undefined,
    });
  };

  const backToCharacterOverview = () => {
    setParams({ co_character: undefined, co_add: undefined as unknown as boolean });
  };

  const openCharacterOverviewEditor = (characterId: string) => {
    setParams({ co_character: characterId, co_add: undefined as unknown as boolean });
  };

  const openCharacterOverviewAddCharacters = () => {
    setParams({ co_add: true, co_character: undefined });
  };

  const value = useMemo(
    () => ({
      open,
      routeEditingCharacterId,
      validSelectedIds,
      setSelectedIds,
      showCharacterOverview,
      closeCharacterOverview,
      backToCharacterOverview,
      openCharacterOverviewEditor,
      openCharacterOverviewAddCharacters,
    }),
    [open, routeEditingCharacterId, validSelectedIds]
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
