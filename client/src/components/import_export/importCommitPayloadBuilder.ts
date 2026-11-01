import { importStagingDatabase, DatabaseClient } from '../../backend_bridge/database.js';
import * as Files from '../../backend_bridge/files.js';
import type { ImportCommitPayload } from '../../backend_bridge/import_api.js';
import { prepareImportStaging, buildImportCommitStatements } from '../../backend_bridge/import_queries.js';
import type { Character } from '../../engine/types.js';
import type { ConflictAction } from './importConflictResolver.js';

export type BuildCommitPayloadOptions = {
  sessionId: string;
  exportName: string;
  selectedScenarioIds: string[];
  selectedScenarioCharactersIds?: string[];
  selectedScenarioGroupsIds: string[];
  selectedScenarioSchedulesIds?: string[];
  selectedScenarioMemoriesIds: string[];
  selectedScenarioConversationsIds?: string[];
  selectedScenarioTurnIds?: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
  conflictResolutions: Record<string, ConflictAction>;
  stagedGlobalCharacters?: Character[];
  stagingDb?: DatabaseClient;
};

export async function prepareStagingAndBuildCommitPayload(
  options: BuildCommitPayloadOptions
): Promise<ImportCommitPayload> {
  const {
    sessionId,
    exportName,
    selectedScenarioIds,
    selectedScenarioCharactersIds = selectedScenarioIds,
    selectedScenarioGroupsIds,
    selectedScenarioSchedulesIds = selectedScenarioGroupsIds,
    selectedScenarioMemoriesIds,
    selectedScenarioConversationsIds = selectedScenarioIds,
    selectedScenarioTurnIds = selectedScenarioIds,
    selectedMapIds,
    selectedGlobalCharacterIds,
    conflictResolutions,
    stagedGlobalCharacters,
    stagingDb,
  } = options;

  const effectiveMemoriesScenIds = selectedScenarioMemoriesIds.filter((id) =>
    selectedScenarioCharactersIds.includes(id)
  );
  const effectiveTurnScenIds = selectedScenarioTurnIds.filter((id) =>
    selectedScenarioCharactersIds.includes(id)
  );
  const effectiveSchedulesScenIds = selectedScenarioSchedulesIds.filter((id) =>
    selectedScenarioGroupsIds.includes(id)
  );

  const db = stagingDb ?? importStagingDatabase;
  const globalCharacters = stagedGlobalCharacters ?? (await db.loadGlobalCharacters());

  const copiedMapIds = selectedMapIds.filter((id) => conflictResolutions[id] === 'copy');
  const copiedGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] === 'copy');

  // 1. Prepare staging database and remap IDs
  const copiedCharIdToNewId = await prepareImportStaging({
    db,
    exportName,
    selectedScenarioIds,
    selectedScenarioMemoriesIds,
    selectedScenarioGroupsIds,
    copiedMapIds,
    copiedGlobalCharIds,
  });

  // 2. Generate ordered sqlStatements
  const activeMapIds = selectedMapIds.filter((id) => conflictResolutions[id] !== 'skip');
  const activeGlobalCharIds = selectedGlobalCharacterIds.filter((id) => conflictResolutions[id] !== 'skip');

  const sqlStatements = buildImportCommitStatements({
    activeMapIds,
    activeGlobalCharIds,
    selectedScenarioIds,
    selectedScenarioCharactersIds,
    effectiveMemoriesScenIds,
    selectedScenarioGroupsIds,
    effectiveSchedulesScenIds,
    selectedScenarioConversationsIds,
    effectiveTurnScenIds,
  });

  // 3. Build imageCopies directly from selected entities
  const imageCopies: Array<{ zipPath: string; targetRelPath: string }> = [];

  // Global character cards
  for (const char of globalCharacters) {
    if (!selectedGlobalCharacterIds.includes(char.id)) continue;
    if (conflictResolutions[char.id] === 'skip') continue;

    const zipPath = Files.getCharacterZipImagePath(char);
    if (!zipPath) continue;

    let targetRelPath = zipPath;
    if (conflictResolutions[char.id] === 'copy') {
      const newId = copiedCharIdToNewId.get(char.id);
      if (newId) {
        targetRelPath = `character_cards/${newId}.png`;
      }
    }

    imageCopies.push({
      zipPath,
      targetRelPath,
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
    sessionId,
    sqlStatements,
    imageCopies,
    allowedImageDirectories: ['character_cards', 'scenario'],
  };
}
