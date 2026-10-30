import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestServer,
  seedCompleteScenario,
  setupFetchShim,
  restoreFetch,
  exportViaApi,
  type TestServer,
} from './harness.js';
import {
  buildExportPayload,
  TreeEntityIds,
} from '../client/src/components/import_export/exportPayloadBuilder.js';
import { stageImportArchive, commitImport } from '../client/src/backend_bridge/import_api.js';
import { prepareStagingAndBuildCommitPayload } from '../client/src/components/import_export/importCommitPayloadBuilder.js';
import type { WorldMap, Scenario, ScenarioSummary, Character } from '../client/src/engine/types.js';

describe('Integration: Partial Selection & json_patch Stripping', () => {
  let sourceServer: TestServer;
  let targetServer: TestServer;

  beforeAll(() => {
    setupFetchShim();
  });

  afterAll(() => {
    restoreFetch();
  });

  afterEach(async () => {
    if (sourceServer) {
      await sourceServer.close();
    }
    if (targetServer) {
      await targetServer.close();
    }
  });

  it('strips memories when Memories checkbox is omitted', async () => {
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const seeded = seedCompleteScenario(sourceServer.db, sourceServer.dataDir);

    const sourceMap = JSON.parse(
      (sourceServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as { data: string })
        .data
    ) as WorldMap;
    const sourceGlobalChar = JSON.parse(
      (
        sourceServer.db.prepare('SELECT data FROM character WHERE id = ?').get(seeded.globalCharId) as {
          data: string;
        }
      ).data
    ) as Character;
    const sourceScenario = JSON.parse(
      (
        sourceServer.db.prepare('SELECT data FROM scenario WHERE id = ?').get(seeded.scenarioId) as {
          data: string;
        }
      ).data
    ) as Scenario;

    const sourceScenarioSummary: ScenarioSummary = {
      scenario: sourceScenario,
      mapName: sourceMap.name,
      userCharacterName: 'Alice Liddell',
      createdAt: sourceScenario.createdAt,
      updatedAt: sourceScenario.updatedAt,
    };

    // Export without TreeEntityIds.scenarioMemories
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario(seeded.scenarioId),
      TreeEntityIds.scenarioCharacters(seeded.scenarioId),
      TreeEntityIds.scenarioGroups(seeded.scenarioId),
      TreeEntityIds.scenarioSchedules(seeded.scenarioId),
      TreeEntityIds.map(seeded.mapId),
      TreeEntityIds.character(seeded.globalCharId),
    ]);

    const exportPayload = buildExportPayload({
      exportName: 'StripMemoriesTest',
      selectedIds,
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
      templateGroupData: {},
    });

    const { zipBuffer } = await exportViaApi(exportPayload);

    // Target Server
    targetServer = await createTestServer();
    targetServer.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'StripMemoriesTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [], // Memories omitted
      selectedScenarioGroupsIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // Assert: character_relationship has 0 rows
    const rels = targetServer.db.prepare('SELECT * FROM character_relationship').all();
    expect(rels.length).toBe(0);

    // Assert: scenario characters have memories stripped
    const targetChars = targetServer.db.prepare('SELECT data FROM scenario_character').all() as Array<{
      data: string;
    }>;
    expect(targetChars.length).toBe(2);
    for (const charRow of targetChars) {
      const char = JSON.parse(charRow.data) as Character;
      expect(char.globalMemories).toBe('');
      expect(char.rollingConversationSummaries).toEqual([]);
      expect(char.nextConversationWithCharacterId).toBe('');
      // But groups are preserved
      expect(char.groupIds.length).toBe(1);
    }
  });

  it('strips character groups when Groups checkbox is omitted', async () => {
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const seeded = seedCompleteScenario(sourceServer.db, sourceServer.dataDir);

    const sourceMap = JSON.parse(
      (sourceServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as { data: string })
        .data
    ) as WorldMap;
    const sourceGlobalChar = JSON.parse(
      (
        sourceServer.db.prepare('SELECT data FROM character WHERE id = ?').get(seeded.globalCharId) as {
          data: string;
        }
      ).data
    ) as Character;
    const sourceScenario = JSON.parse(
      (
        sourceServer.db.prepare('SELECT data FROM scenario WHERE id = ?').get(seeded.scenarioId) as {
          data: string;
        }
      ).data
    ) as Scenario;

    const sourceScenarioSummary: ScenarioSummary = {
      scenario: sourceScenario,
      mapName: sourceMap.name,
      userCharacterName: 'Alice Liddell',
      createdAt: sourceScenario.createdAt,
      updatedAt: sourceScenario.updatedAt,
    };

    // Export without Groups & Schedules
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario(seeded.scenarioId),
      TreeEntityIds.scenarioCharacters(seeded.scenarioId),
      TreeEntityIds.scenarioMemories(seeded.scenarioId),
      TreeEntityIds.map(seeded.mapId),
      TreeEntityIds.character(seeded.globalCharId),
    ]);

    const exportPayload = buildExportPayload({
      exportName: 'StripGroupsTest',
      selectedIds,
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
      templateGroupData: {},
    });

    const { zipBuffer } = await exportViaApi(exportPayload);

    // Target Server
    targetServer = await createTestServer();
    targetServer.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'StripGroupsTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [seeded.scenarioId],
      selectedScenarioGroupsIds: [], // Groups omitted
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // Assert: groups & schedules have 0 rows
    const groups = targetServer.db.prepare('SELECT * FROM scenario_character_group').all();
    const schedules = targetServer.db.prepare('SELECT * FROM scenario_character_group_schedule').all();
    expect(groups.length).toBe(0);
    expect(schedules.length).toBe(0);

    // Assert: scenario characters have groupIds stripped
    const targetChars = targetServer.db.prepare('SELECT data FROM scenario_character').all() as Array<{
      data: string;
    }>;
    expect(targetChars.length).toBe(2);
    for (const charRow of targetChars) {
      const char = JSON.parse(charRow.data) as Character;
      expect(char.groupIds).toEqual([]);
      // But memories are preserved
      expect(char.globalMemories.length).toBeGreaterThan(0);
    }
  });
});
