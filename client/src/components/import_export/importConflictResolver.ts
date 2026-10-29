import type { WorldMap, Character } from '../../engine/types.js';

export type ConflictAction = 'skip' | 'overwrite' | 'copy';

export type EntityConflict = {
  id: string;
  name: string;
  kind: 'map' | 'character';
  action: ConflictAction;
};

export function detectConflicts(
  selectedMaps: WorldMap[],
  selectedGlobalCharacters: Character[],
  existingMapsById: Record<string, WorldMap>,
  existingGlobalCharactersById: Record<string, Character>
): EntityConflict[] {
  const conflicts: EntityConflict[] = [];

  for (const map of selectedMaps) {
    if (existingMapsById[map.id]) {
      conflicts.push({
        id: map.id,
        name: map.name || 'Untitled Map',
        kind: 'map',
        action: 'skip',
      });
    }
  }

  for (const char of selectedGlobalCharacters) {
    if (existingGlobalCharactersById[char.id]) {
      conflicts.push({
        id: char.id,
        name: `${char.firstName} ${char.lastName}`.trim() || 'Untitled Character',
        kind: 'character',
        action: 'skip',
      });
    }
  }

  return conflicts;
}

