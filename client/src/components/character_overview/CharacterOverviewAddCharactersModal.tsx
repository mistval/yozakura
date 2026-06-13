import { useMemo, useState } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import { useCharacterOverview } from './CharacterOverviewContext.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import CharacterSelectionGrid from '../CharacterSelectionGrid.js';
import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import { assertNonNullish } from '../../errors/application_error.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';

export default function CharacterOverviewAddCharactersModal() {
  const { backToCharacterOverview } = useCharacterOverview();
  const scenario = useScenarioStore((state) => state.activeScenario);
  const activeMap = useScenarioStore((state) => state.activeScenarioMap);
  const scenarioCharactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const globalCharacters = useGlobalCharactersStore((s) => s.globalCharacters);
  const globalCharactersAreLoaded = useGlobalCharactersStore((s) => s.globalCharactersAreLoaded);

  const [addCharacterSelectedGlobalIds, setAddCharacterSelectedGlobalIds] = useState<string[]>([]);
  const [addCharacterSaving, setAddCharacterSaving, addCharacterSavingRef] = useStateRef(false);

  const currentScenarioCharacterGlobalIds = useMemo(() => {
    return Object.values(scenarioCharactersById).map((c) => c.globalCharacterId);
  }, [scenarioCharactersById]);

  const currentScenarioCharacterGlobalIdsSet = useMemo(() => {
    return new Set(currentScenarioCharacterGlobalIds);
  }, [currentScenarioCharacterGlobalIds]);

  const gridSelectedCharacterGlobalIds = useMemo(() => {
    return currentScenarioCharacterGlobalIds.concat(addCharacterSelectedGlobalIds);
  }, [currentScenarioCharacterGlobalIds, addCharacterSelectedGlobalIds]);

  const sortedCharacters = useMemo(() => {
    return globalCharacters.concat().sort((a, b) => {
      if (currentScenarioCharacterGlobalIdsSet.has(a.id) && !currentScenarioCharacterGlobalIdsSet.has(b.id)) {
        return 1;
      }

      if (currentScenarioCharacterGlobalIdsSet.has(b.id) && !currentScenarioCharacterGlobalIdsSet.has(a.id)) {
        return -1;
      }

      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [globalCharacters, currentScenarioCharacterGlobalIds]);

  const confirmAddCharacters = async () => {
    assertNonNullish(scenario);
    assertNonNullish(activeMap, 'Active map is required to add characters to scenario');

    const selectedCharacterSet = new Set(addCharacterSelectedGlobalIds);
    const addCharacters = globalCharacters.filter((c) => selectedCharacterSet.has(c.id));

    setAddCharacterSelectedGlobalIds([]);

    await Promise.all(
      addCharacters.map((character) =>
        useScenarioCharacterStore.getState().addGlobalCharacterToActiveScenario(character, {
          scenarioId: scenario.id,
          map: activeMap,
        })
      )
    );

    backToCharacterOverview();
  };

  return (
    <RoutedModalFrame queryParam="co_add" onClose={backToCharacterOverview} maxWidthClassName="max-w-6xl">
      <h2 className="text-xl font-semibold">Add Characters</h2>
      {!globalCharactersAreLoaded ? (
        <div className="text-sm text-muted">Loading characters...</div>
      ) : (
        <CharacterSelectionGrid
          userCharacterId={''}
          characters={sortedCharacters}
          selectedCharacterIds={gridSelectedCharacterGlobalIds}
          onSelectedCharacterIdsChange={(newSelection) => {
            setAddCharacterSelectedGlobalIds(
              newSelection.filter((cid) => !currentScenarioCharacterGlobalIdsSet.has(cid))
            );
          }}
          lockedCharacterIds={currentScenarioCharacterGlobalIds}
          allowChangeUserCharacter={false}
        />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={backToCharacterOverview} disabled={addCharacterSaving}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              if (!globalCharactersAreLoaded || addCharacterSavingRef.current) {
                return;
              }

              setAddCharacterSaving(true);
              try {
                await confirmAddCharacters();
              } finally {
                setAddCharacterSaving(false);
              }
            })();
          }}
          disabled={!scenario || !globalCharactersAreLoaded || addCharacterSaving}
        >
          {addCharacterSaving ? 'Adding...' : 'Add Selected'}
        </button>
      </div>
    </RoutedModalFrame>
  );
}
