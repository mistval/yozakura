import locko from 'locko';
import { z } from 'zod';
import { stagePrepackagedArchive, commitImport, cancelImport } from './import_api.js';
import { importStagingDatabase, mainDatabase } from './database.js';
import { prepareStagingAndBuildCommitPayload } from '../components/import_export/importCommitPayloadBuilder.js';
import { detectConflicts } from '../components/import_export/importConflictResolver.js';
import { assertNonNullish } from '../errors/application_error.js';

export async function importDemoMaps(): Promise<void> {
  await locko.doWithLock('import_session', async () => {
    const stageResult = await stagePrepackagedArchive('demo');
    if (!stageResult.success) {
      throw new Error(`Failed to stage demo archive: ${stageResult.error}`);
    }

    try {
      const [stagedMaps, existingMaps] = await Promise.all([
        importStagingDatabase.loadMaps(),
        mainDatabase.loadMaps(),
      ]);
      const existingMapsById = Object.fromEntries(existingMaps.map((m) => [m.id, m]));

      const conflicts = detectConflicts(stagedMaps, [], existingMapsById, {});
      const conflictResolutions = Object.fromEntries(conflicts.map((c) => [c.id, c.action]));

      const payload = await prepareStagingAndBuildCommitPayload({
        sessionId: stageResult.sessionId,
        exportName: stageResult.manifest.exportName,
        selectedScenarioIds: [],
        selectedScenarioCharactersIds: [],
        selectedScenarioGroupsIds: [],
        selectedScenarioSchedulesIds: [],
        selectedScenarioMemoriesIds: [],
        selectedScenarioConversationsIds: [],
        selectedScenarioTurnIds: [],
        selectedMapIds: stagedMaps.map((m) => m.id),
        selectedGlobalCharacterIds: [],
        conflictResolutions,
      });

      const commitResult = await commitImport(payload);
      if (!commitResult.success) {
        throw new Error(`Failed to commit demo maps: ${commitResult.error}`);
      }
    } catch (err) {
      await cancelImport().catch(() => {});
      throw err;
    }
  });
}

export async function importDemoScenario(): Promise<{ newScenarioId: string }> {
  let newScenarioId: string | undefined;

  await locko.doWithLock('import_session', async () => {
    const stageResult = await stagePrepackagedArchive('demo');
    if (!stageResult.success) {
      throw new Error(`Failed to stage demo archive: ${stageResult.error}`);
    }

    try {
      const [stagedSummaries, stagedMaps, existingMaps] = await Promise.all([
        importStagingDatabase.loadScenarioSummaries(),
        importStagingDatabase.loadMaps(),
        mainDatabase.loadMaps(),
      ]);
      const demoScenario = stagedSummaries[0]?.scenario;
      assertNonNullish(demoScenario, 'No scenario found in demo archive');

      const existingMapsById = Object.fromEntries(existingMaps.map((m) => [m.id, m]));

      const conflicts = detectConflicts(stagedMaps, [], existingMapsById, {});
      const conflictResolutions = Object.fromEntries(conflicts.map((c) => [c.id, c.action]));

      const payload = await prepareStagingAndBuildCommitPayload({
        sessionId: stageResult.sessionId,
        exportName: stageResult.manifest.exportName,
        selectedScenarioIds: [demoScenario.id],
        selectedScenarioCharactersIds: [demoScenario.id],
        selectedScenarioGroupsIds: [demoScenario.id],
        selectedScenarioSchedulesIds: [demoScenario.id],
        selectedScenarioMemoriesIds: [demoScenario.id],
        selectedScenarioConversationsIds: [demoScenario.id],
        selectedScenarioTurnIds: [demoScenario.id],
        selectedMapIds: stagedMaps.map((m) => m.id),
        selectedGlobalCharacterIds: [],
        conflictResolutions,
      });

      const idRows = await importStagingDatabase.dbAll(
        'SELECT new_id FROM import_staging._id_map WHERE old_id = ?',
        [[demoScenario.id]],
        z.object({ new_id: z.string() })
      );
      newScenarioId = idRows[0]?.new_id;
      assertNonNullish(newScenarioId, 'Failed to resolve new scenario ID for demo scenario');

      const commitResult = await commitImport(payload);
      if (!commitResult.success) {
        throw new Error(`Failed to commit demo scenario: ${commitResult.error}`);
      }
    } catch (err) {
      await cancelImport().catch(() => {});
      throw err;
    }
  });

  assertNonNullish(newScenarioId, 'Failed to resolve new scenario ID for demo scenario');
  return { newScenarioId };
}

export async function importDemoGlobalCharacters(): Promise<void> {
  await locko.doWithLock('import_session', async () => {
    const stageResult = await stagePrepackagedArchive('demo');
    if (!stageResult.success) {
      throw new Error(`Failed to stage demo archive: ${stageResult.error}`);
    }

    try {
      const [stagedCharacters, existingCharacters] = await Promise.all([
        importStagingDatabase.loadGlobalCharacters(),
        mainDatabase.loadGlobalCharacters(),
      ]);
      const existingCharsById = Object.fromEntries(existingCharacters.map((c) => [c.id, c]));

      const conflicts = detectConflicts([], stagedCharacters, {}, existingCharsById);
      const conflictResolutions = Object.fromEntries(conflicts.map((c) => [c.id, c.action]));

      const payload = await prepareStagingAndBuildCommitPayload({
        sessionId: stageResult.sessionId,
        exportName: stageResult.manifest.exportName,
        selectedScenarioIds: [],
        selectedScenarioCharactersIds: [],
        selectedScenarioGroupsIds: [],
        selectedScenarioSchedulesIds: [],
        selectedScenarioMemoriesIds: [],
        selectedScenarioConversationsIds: [],
        selectedScenarioTurnIds: [],
        selectedMapIds: [],
        selectedGlobalCharacterIds: stagedCharacters.map((c) => c.id),
        conflictResolutions,
        stagedGlobalCharacters: stagedCharacters,
      });

      const commitResult = await commitImport(payload);
      if (!commitResult.success) {
        throw new Error(`Failed to commit demo characters: ${commitResult.error}`);
      }
    } catch (err) {
      await cancelImport().catch(() => {});
      throw err;
    }
  });
}
