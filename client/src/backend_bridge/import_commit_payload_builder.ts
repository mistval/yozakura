import { importStagingDatabase, DatabaseClient } from './database.js';
import * as Files from './files.js';
import type { ImportCommitPayload } from './import_api.js';
import { prepareImportStaging, buildImportCommitStatements } from './import_queries.js';
import type { Character } from '../engine/types.js';
import type { ConflictAction } from './import_conflict_resolver.js';

export type BuildCommitPayloadOptions = {
  exportName: string;
  selectedScenarioIds?: string[];
  selectedScenarioCharactersIds?: string[];
  selectedScenarioGroupsIds?: string[];
  selectedScenarioSchedulesIds?: string[];
  selectedScenarioMemoriesIds?: string[];
  selectedScenarioConversationsIds?: string[];
  selectedMapIds?: string[];
  selectedGlobalCharacterIds?: string[];
  conflictResolutions?: Record<string, ConflictAction>;
  stagedGlobalCharacters?: Character[];
  stagingDb?: DatabaseClient;
};

export async function prepareStagingAndBuildCommitPayload(
  options: BuildCommitPayloadOptions
): Promise<ImportCommitPayload> {
  const {
    exportName,
    selectedScenarioIds = [],
    selectedScenarioCharactersIds = selectedScenarioIds,
    selectedScenarioGroupsIds = selectedScenarioIds,
    selectedScenarioSchedulesIds = selectedScenarioGroupsIds,
    selectedScenarioMemoriesIds = selectedScenarioIds,
    selectedScenarioConversationsIds = selectedScenarioIds,
    selectedMapIds = [],
    selectedGlobalCharacterIds = [],
    conflictResolutions = {},
    stagedGlobalCharacters,
    stagingDb,
  } = options;

  const effectiveMemoriesScenIds = selectedScenarioMemoriesIds.filter((id) =>
    selectedScenarioCharactersIds.includes(id)
  );
  const effectiveSchedulesScenIds = selectedScenarioSchedulesIds.filter((id) =>
    selectedScenarioGroupsIds.includes(id)
  );

  const db = stagingDb ?? importStagingDatabase;
  const globalCharacters = stagedGlobalCharacters ?? (await db.loadGlobalCharacters());

  const copiedMapIds = selectedMapIds.filter((id) => conflictResolutions[id] === 'copy');
  const activeMapIds = selectedMapIds.filter((id) => conflictResolutions[id] !== 'skip');
  const activeGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] !== 'skip');
  const copiedGlobalCharIds = activeGlobalCharIds.filter((id) => conflictResolutions[id] === 'copy');

  // 1. Prepare staging database and remap IDs
  const copiedCharIdToNewId = await prepareImportStaging({
    db,
    exportName,
    selectedScenarioIds,
    selectedScenarioMemoriesIds,
    selectedScenarioGroupsIds,
    copiedMapIds,
    activeGlobalCharIds,
    copiedGlobalCharIds,
  });

  // 2. Generate ordered sqlStatements
  const sqlStatements = buildImportCommitStatements({
    activeMapIds,
    activeGlobalCharIds,
    selectedScenarioIds,
    selectedScenarioCharactersIds,
    effectiveMemoriesScenIds,
    selectedScenarioGroupsIds,
    effectiveSchedulesScenIds,
    selectedScenarioConversationsIds,
  });

  // 3. Build imageCopies directly from selected entities
  const imageCopies: Array<{ zipPath: string; targetRelPath: string }> = [];

  // Global character cards (always normalize target filename to <targetCharId>.png)
  for (const char of globalCharacters) {
    if (!selectedGlobalCharacterIds.includes(char.id)) continue;
    if (conflictResolutions[char.id] === 'skip') continue;

    const zipPath = Files.getCharacterZipImagePath(char);
    if (!zipPath) continue;

    const targetCharId = conflictResolutions[char.id] === 'copy' ? copiedCharIdToNewId.get(char.id) : char.id;
    if (!targetCharId) {
      throw new Error(`Failed to allocate copy ID for global character "${char.id}"`);
    }

    imageCopies.push({
      zipPath,
      targetRelPath: `character_cards/${targetCharId}.png`,
    });
  }

  // Scenario character cards and chat images
  for (const scenId of selectedScenarioCharactersIds) {
    imageCopies.push({
      zipPath: `scenario/${scenId}/character_cards`,
      targetRelPath: `scenario/${scenId}/character_cards`,
    });
  }

  for (const scenId of selectedScenarioConversationsIds) {
    imageCopies.push({
      zipPath: `scenario/${scenId}/chat_images`,
      targetRelPath: `scenario/${scenId}/chat_images`,
    });
  }

  return {
    sqlStatements,
    imageCopies,
    allowedImageDirectories: ['character_cards', 'scenario'],
    allowedFileExtensions: ['.png'],
  };
}
