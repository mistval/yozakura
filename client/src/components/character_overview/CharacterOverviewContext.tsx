import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useQueryParams } from '../../util/queryParams.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';

type CharacterOverviewTarget = 'overview' | 'character' | 'add-characters' | 'groups';

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
  const [params, setParams] = useQueryParams();

  const open = params.has('characteroverview') && params.get('characteroverview') !== 'false';
  const rawCharacterId = params.get('co_character') ?? undefined;
  const hasValidCharacterId = Boolean(rawCharacterId && rawCharacterId in charactersById);
  const routeEditingCharacterId = hasValidCharacterId ? rawCharacterId : undefined;

  const validSelectedIds = useMemo(() => {
    return params
      .getAll('selected_ids')
      .filter((id): id is string => typeof id === 'string' && id in charactersById);
  }, [params, charactersById]);

  const setSelectedIds = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, 2);
    setParams({ selected_ids: uniqueIds });
  };

  const showCharacterOverview = (incoming?: ShowCharacterOverviewParams) => {
    const target = incoming?.target || 'overview';
    const next: Record<string, unknown> = {
      characteroverview: true,
      cotab: target === 'groups' ? 'groups' : undefined,
      co_character: target === 'character' && incoming?.characterId ? incoming.characterId : undefined,
      co_add: target === 'add-characters' ? true : undefined,
      selected_ids: incoming?.selectedIds
        ? [...new Set(incoming.selectedIds)].filter(Boolean).slice(0, 2)
        : undefined,
      scrolldown: incoming?.scrolldown ? 'true' : undefined,
    };

    setParams(next as Parameters<typeof setParams>[0]);
  };

  const closeCharacterOverview = () => {
    setParams({
      characteroverview: undefined,
      co_character: undefined,
      co_add: undefined,
      selected_ids: undefined,
      scrolldown: undefined,
    });
  };

  const backToCharacterOverview = () => {
    setParams({ co_character: undefined, co_add: undefined });
  };

  const openCharacterOverviewEditor = (characterId: string) => {
    setParams({ co_character: characterId, co_add: undefined });
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
    [open, routeEditingCharacterId, validSelectedIds, params]
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
