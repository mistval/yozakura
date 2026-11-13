import locko from 'locko';
import { z } from 'zod';
import { stagePrepackagedArchive, commitImport, cancelImport, type StagedManifest } from './import_api.js';
import { importStagingDatabase, mainDatabase } from './database.js';
import { prepareStagingAndBuildCommitPayload } from './import_commit_payload_builder.js';
import { detectConflicts } from './import_conflict_resolver.js';
import { assertNonNullish } from '../errors/application_error.js';

async function withStagedDemoArchive<T>(
  fn: (stageResult: { manifest: StagedManifest }) => Promise<T>
): Promise<T> {
  return locko.doWithLock('import_session', async () => {
    const stageResult = await stagePrepackagedArchive('demo');
    if (!stageResult.success) {
      throw new Error(`Failed to stage demo archive: ${stageResult.error}`);
    }

    try {
      return await fn(stageResult);
    } catch (err) {
      await cancelImport().catch(() => {});
      throw err;
    }
  });
}

export async function importDemoMaps(): Promise<void> {
  await withStagedDemoArchive(async (stageResult) => {
    const [stagedMaps, existingMaps] = await Promise.all([
      importStagingDatabase.loadMaps(),
      mainDatabase.loadMaps(),
    ]);
    const existingMapsById = Object.fromEntries(existingMaps.map((m) => [m.id, m]));

    const conflicts = detectConflicts(stagedMaps, [], existingMapsById, {});
    const conflictResolutions = Object.fromEntries(conflicts.map((c) => [c.id, c.action]));

    const payload = await prepareStagingAndBuildCommitPayload({
      exportName: stageResult.manifest.exportName,
      selectedMapIds: stagedMaps.map((m) => m.id),
      conflictResolutions,
    });

    const commitResult = await commitImport(payload);
    if (!commitResult.success) {
      throw new Error(`Failed to commit demo maps: ${commitResult.error}`);
    }
  });
}

export async function importDemoScenario(): Promise<{ newScenarioId: string }> {
  return withStagedDemoArchive(async (stageResult) => {
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
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [demoScenario.id],
      selectedMapIds: stagedMaps.map((m) => m.id),
      conflictResolutions,
    });

    const idRows = await importStagingDatabase.dbAll(
      'SELECT new_id FROM import_staging._id_map WHERE old_id = ?',
      [[demoScenario.id]],
      z.object({ new_id: z.string() })
    );
    const newScenarioId = idRows[0]?.new_id;
    assertNonNullish(newScenarioId, 'Failed to resolve new scenario ID for demo scenario');

    const commitResult = await commitImport(payload);
    if (!commitResult.success) {
      throw new Error(`Failed to commit demo scenario: ${commitResult.error}`);
    }

    return { newScenarioId };
  });
}

export async function importDemoGlobalCharacters(): Promise<void> {
  await withStagedDemoArchive(async (stageResult) => {
    const [stagedCharacters, existingCharacters] = await Promise.all([
      importStagingDatabase.loadGlobalCharacters(),
      mainDatabase.loadGlobalCharacters(),
    ]);
    const existingCharsById = Object.fromEntries(existingCharacters.map((c) => [c.id, c]));

    const conflicts = detectConflicts([], stagedCharacters, {}, existingCharsById);
    const conflictResolutions = Object.fromEntries(conflicts.map((c) => [c.id, c.action]));

    const payload = await prepareStagingAndBuildCommitPayload({
      exportName: stageResult.manifest.exportName,
      selectedGlobalCharacterIds: stagedCharacters.map((c) => c.id),
      conflictResolutions,
      stagedGlobalCharacters: stagedCharacters,
    });

    const commitResult = await commitImport(payload);
    if (!commitResult.success) {
      throw new Error(`Failed to commit demo characters: ${commitResult.error}`);
    }
  });
}
