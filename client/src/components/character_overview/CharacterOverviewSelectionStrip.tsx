import { useCharacterOverview } from './CharacterOverviewContext.js';
import { getDirectedRelationship } from '../../engine/relationship.js';
import type { Character, CharacterRelationships, WorldMap } from '../../engine/types.js';
import { assertNonNullish } from '../../errors/application_error.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import CharacterCard from '../CharacterCard.js';

type CharacterOverviewSelectionStripProps = {
  characters: Character[];
  selectedIds: string[];
  activeMap: WorldMap;
  relationshipLogs: CharacterRelationships;
  onToggleSelect: (id: string) => void;
};

export default function CharacterOverviewSelectionStrip({
  characters,
  selectedIds,
  activeMap,
  relationshipLogs,
  onToggleSelect,
}: CharacterOverviewSelectionStripProps) {
  const { openCharacterOverviewAddCharacters } = useCharacterOverview();
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const userId = useScenarioStore((state) => state.activeScenario?.userCharacterId);

  return (
    <div className="flex gap-3 flex-wrap">
      {characters.flatMap((character) => {
        assertNonNullish(character);
        const isSelected = selectedIds.includes(character.id);
        const locationId = charactersById[character.id]?.locationId;
        const locationName =
          activeMap.locations.find((location) => location.id === locationId)?.name || 'Unknown location';
        const relToSelected =
          selectedIds.length === 1 &&
          selectedIds[0] &&
          character.id !== selectedIds[0] &&
          character.id !== userId
            ? getDirectedRelationship(relationshipLogs, character.id, selectedIds[0]).descriptor
            : undefined;

        return (
          <CharacterCard
            key={character.id}
            character={character}
            subtitle={locationName}
            subtitle2={relToSelected || ''}
            onClick={() => onToggleSelect(character.id)}
            selected={isSelected}
          />
        );
      })}
      <button
        type="button"
        onClick={openCharacterOverviewAddCharacters}
        className="rounded-sm border border-dashed border-border-strong bg-emphasized p-3 w-48 h-84.25 flex items-center justify-center text-4xl text-muted hover:text-secondary-strong hover:border-border-accent"
        aria-label="Add character"
      >
        +
      </button>
    </div>
  );
}
