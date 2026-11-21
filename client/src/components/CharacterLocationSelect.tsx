import { useMemo } from 'react';
import { useIsEntityInDeferredSync } from '../state/ephemeral_state_helper.js';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { useActiveScenarioMap } from '../state/scenario_store.js';
import { getRequiredRandomChoice } from '../util/array.js';

interface CharacterLocationSelectProps {
  characterId: string;
  id?: string | undefined;
  className?: string | undefined;
}

/** Shared scenario location selector for moving a character to a specific or random map location. */
export default function CharacterLocationSelect({
  characterId,
  id,
  className = '',
}: CharacterLocationSelectProps) {
  const activeMap = useActiveScenarioMap();
  const currentLocationId = useScenarioCharacterStore(
    (state) => state.scenarioCharactersById[characterId]?.locationId || ''
  );
  const saveScenarioCharacterFields = useScenarioCharacterStore((state) => state.saveScenarioCharacterFields);
  const isCharacterSyncing = useIsEntityInDeferredSync(characterId);

  const sortedLocations = useMemo(() => {
    if (!activeMap) {
      return [];
    }

    return [...activeMap.locations].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeMap?.locations]);

  if (!activeMap || sortedLocations.length === 0) {
    return undefined;
  }

  return (
    <select
      id={id}
      value={currentLocationId}
      disabled={isCharacterSyncing}
      onChange={(event) => {
        const locationId =
          event.target.value === 'random'
            ? getRequiredRandomChoice(sortedLocations.filter((location) => location.id !== currentLocationId))
                .id
            : event.target.value;

        saveScenarioCharacterFields(characterId, {
          locationId: locationId.trim(),
        });
      }}
      className={`border rounded-sm px-2 py-1 bg-inset ${className}`.trim()}
    >
      {sortedLocations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
        </option>
      ))}
      {sortedLocations.length > 1 && (
        <option key="random" value="random">
          Random Location
        </option>
      )}
    </select>
  );
}
