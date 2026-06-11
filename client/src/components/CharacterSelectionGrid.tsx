import _ from 'lodash';
import { useEffect, useMemo, useRef, useState } from 'react';
import CharacterCard from './CharacterCard.js';
import type { Character } from '../engine/types.js';
import { buildCharacterNameIndex } from '../engine/tokenization.js';
import { assert } from '../errors/application_error.js';

type CharacterSelectionGridProps = {
  characters: Character[];
  userCharacterId: string;
  lockedCharacterIds?: string[];
  selectedCharacterIds: string[];
  allowChangeUserCharacter?: boolean;

  onUserCharacterIdChange?: (characterId: string) => void;
  onSelectedCharacterIdsChange: (nextIds: string[]) => void;
};

export default function CharacterSelectionGrid({
  characters,
  userCharacterId,
  lockedCharacterIds = [],
  selectedCharacterIds,
  allowChangeUserCharacter = false,
  onSelectedCharacterIdsChange,
  onUserCharacterIdChange,
}: CharacterSelectionGridProps) {
  const [randomLimit, setRandomLimit] = useState<number>(20);
  const [randomPopoverOpen, setRandomPopoverOpen] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const allCharacterIdsArr = useMemo(() => {
    return characters.map((c) => c.id);
  }, [characters]);

  const lockedCharacterIdsSet = useMemo(() => {
    return new Set(lockedCharacterIds);
  }, [lockedCharacterIds]);

  const characterForId = useMemo(() => {
    return _.keyBy(characters, 'id');
  }, [characters]);

  const selectedCharactersArr = useMemo(() => {
    return selectedCharacterIds.map((id) => characterForId[id]).filter((c): c is Character => Boolean(c));
  }, [characterForId, selectedCharacterIds]);

  const selectedCharacterIdsSet = useMemo(() => {
    const set = new Set(selectedCharacterIds);
    assert(set.size === selectedCharacterIds.length, 'Duplicate selected character IDs');
    return set;
  }, [selectedCharacterIds]);

  const duplicateName = useMemo(() => {
    const nameIndex = buildCharacterNameIndex(selectedCharactersArr);
    for (const [name, ids] of nameIndex.entries()) {
      if (ids.length > 1) {
        return name;
      }
    }
    return undefined;
  }, [selectedCharactersArr]);

  const toggleSelected = (character: Character) => {
    if (character.id === userCharacterId || lockedCharacterIdsSet.has(character.id)) {
      return;
    }

    if (selectedCharacterIdsSet.has(character.id)) {
      return onSelectedCharacterIdsChange(selectedCharacterIds.filter((id) => id !== character.id));
    } else {
      return onSelectedCharacterIdsChange(selectedCharacterIds.concat(character.id));
    }
  };

  const selectRandom = () => {
    const unDeselectable = [...new Set(lockedCharacterIds.concat(userCharacterId))];
    const baseSelected = selectedCharacterIds.length >= randomLimit ? unDeselectable : selectedCharacterIds;
    const baseSelectedSet = new Set(baseSelected);
    const numToSelect = randomLimit - baseSelected.length;
    if (numToSelect < 0) {
      onSelectedCharacterIdsChange(unDeselectable);
      return;
    }

    const availableToSelect = allCharacterIdsArr.filter(
      (c) => !baseSelectedSet.has(c) && !lockedCharacterIdsSet.has(c)
    );

    const newlySelected = _.sampleSize(availableToSelect, numToSelect);
    const newSelected = baseSelected.concat(newlySelected);

    onSelectedCharacterIdsChange(newSelected);
  };

  useEffect(() => {
    if (!randomPopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setRandomPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [randomPopoverOpen]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 relative">
        <div className="text-sm">Selected: {selectedCharacterIds.length}</div>
        <div className="relative inline-block">
          <button type="button" onClick={selectRandom} className="flex justify-start pr-10 w-32">
            Random
          </button>
          <button
            type="button"
            className="absolute right-0 top-0 h-full px-2"
            onClick={(e) => {
              e.stopPropagation();
              setRandomPopoverOpen((prev) => !prev);
            }}
          >
            ▾
          </button>
          {randomPopoverOpen && (
            <div ref={popoverRef} className="absolute mt-1 p-2 bg-emphasized border rounded-sm shadow-sm ">
              <label className="text-sm flex items-center gap-1">
                Limit:
                <input
                  type="number"
                  min={1}
                  value={randomLimit}
                  onChange={(e) => setRandomLimit(Math.max(Number(e.currentTarget.value) || 0))}
                  className="w-16 border rounded-sm px-1"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {characters.map((character) => {
          const isUser = userCharacterId === character.id;
          return (
            <CharacterCard
              key={character.id}
              character={character}
              selected={selectedCharacterIdsSet.has(character.id)}
              onClick={() => toggleSelected(character)}
            >
              {allowChangeUserCharacter && (
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <span className="text-sm">User Character</span>
                  <input
                    id={`user-${character.id}`}
                    type="radio"
                    name="userCharacter"
                    checked={isUser}
                    onChange={() => {
                      if (!selectedCharacterIdsSet.has(character.id)) {
                        toggleSelected(character);
                      }
                      onUserCharacterIdChange?.(character.id);
                    }}
                    className="h-4 w-4"
                  />
                </label>
              )}
            </CharacterCard>
          );
        })}
      </div>

      {duplicateName && (
        <div className="text-sm text-warning-text-strong bg-warning-bg border border-warning-border-soft rounded-sm p-2 mt-1">
          ⚠️ You have multiple characters with the name "{duplicateName}". This is not recommended as it will
          cause ambiguity and misattribution. All character first and last names should be unique.
        </div>
      )}
    </div>
  );
}
