import fs from 'fs';
import path from 'path';
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

  async function exportFullScenarioZip(sourceServer: TestServer) {
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

    const selectedIds = new Set<string>([
      TreeEntityIds.scenario(seeded.scenarioId),
      TreeEntityIds.scenarioCharacters(seeded.scenarioId),
      TreeEntityIds.scenarioGroups(seeded.scenarioId),
      TreeEntityIds.scenarioSchedules(seeded.scenarioId),
      TreeEntityIds.scenarioMemories(seeded.scenarioId),
      TreeEntityIds.scenarioConversations(seeded.scenarioId),
      TreeEntityIds.scenarioTurn(seeded.scenarioId),
      TreeEntityIds.map(seeded.mapId),
      TreeEntityIds.character(seeded.globalCharId),
    ]);

    const exportPayload = buildExportPayload({
      exportName: 'CompleteExportTest',
      selectedIds,
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
      templateGroupData: {},
    });

    const { zipBuffer } = await exportViaApi(exportPayload);
    return { seeded, zipBuffer };
  }

  it('omits conversations and chat images when Conversations checkbox is omitted', async () => {
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const { seeded, zipBuffer } = await exportFullScenarioZip(sourceServer);

    targetServer = await createTestServer();
    targetServer.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'CompleteExportTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioCharactersIds: [seeded.scenarioId],
      selectedScenarioGroupsIds: [seeded.scenarioId],
      selectedScenarioSchedulesIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [seeded.scenarioId],
      selectedScenarioConversationsIds: [], // conversations omitted
      selectedScenarioTurnIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    const convCount = targetServer.db.prepare('SELECT count(*) as count FROM conversation').get() as {
      count: number;
    };
    const partCount = targetServer.db
      .prepare('SELECT count(*) as count FROM conversation_participant')
      .get() as { count: number };
    expect(convCount.count).toBe(0);
    expect(partCount.count).toBe(0);

    const targetScen = targetServer.db.prepare('SELECT id FROM scenario').get() as { id: string };
    const chatImageFilePath = path.join(
      targetServer.dataDir,
      'scenario',
      targetScen.id,
      'chat_images',
      'tea_cup.png'
    );
    expect(fs.existsSync(chatImageFilePath)).toBe(false);

    // Character cards should be imported
    const targetChar = targetServer.db.prepare('SELECT id FROM scenario_character LIMIT 1').get() as {
      id: string;
    };
    const charCardPath = path.join(
      targetServer.dataDir,
      'scenario',
      targetScen.id,
      'character_cards',
      `${targetChar.id}.png`
    );
    expect(fs.existsSync(charCardPath)).toBe(true);
  });

  it('omits schedules when Schedules checkbox is omitted but Groups is included', async () => {
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const { seeded, zipBuffer } = await exportFullScenarioZip(sourceServer);

    targetServer = await createTestServer();
    targetServer.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'CompleteExportTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioCharactersIds: [seeded.scenarioId],
      selectedScenarioGroupsIds: [seeded.scenarioId], // Groups included
      selectedScenarioSchedulesIds: [], // Schedules omitted
      selectedScenarioMemoriesIds: [seeded.scenarioId],
      selectedScenarioConversationsIds: [seeded.scenarioId],
      selectedScenarioTurnIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    const groupCount = targetServer.db
      .prepare('SELECT count(*) as count FROM scenario_character_group')
      .get() as { count: number };
    const schedCount = targetServer.db
      .prepare('SELECT count(*) as count FROM scenario_character_group_schedule')
      .get() as { count: number };
    expect(groupCount.count).toBe(1);
    expect(schedCount.count).toBe(0);
  });

  it('omits characters, relationships, cards, and turn state when Characters is omitted', async () => {
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const { seeded, zipBuffer } = await exportFullScenarioZip(sourceServer);

    targetServer = await createTestServer();
    targetServer.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'CompleteExportTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioCharactersIds: [], // Characters omitted
      selectedScenarioGroupsIds: [seeded.scenarioId],
      selectedScenarioSchedulesIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [seeded.scenarioId],
      selectedScenarioConversationsIds: [seeded.scenarioId],
      selectedScenarioTurnIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    const charCount = targetServer.db.prepare('SELECT count(*) as count FROM scenario_character').get() as {
      count: number;
    };
    const relCount = targetServer.db
      .prepare('SELECT count(*) as count FROM character_relationship')
      .get() as { count: number };
    const turnCount = targetServer.db
      .prepare("SELECT count(*) as count FROM key_value WHERE key LIKE 'scenario_%_turn'")
      .get() as { count: number };
    expect(charCount.count).toBe(0);
    expect(relCount.count).toBe(0);
    expect(turnCount.count).toBe(0);

    const targetScenRow = targetServer.db.prepare('SELECT id, data FROM scenario').get() as {
      id: string;
      data: string;
    };
    const targetScen = JSON.parse(targetScenRow.data) as Scenario;
    expect(targetScen.userCharacterId).toBe('');

    const charCardPath = path.join(
      targetServer.dataDir,
      'scenario',
      targetScenRow.id,
      'character_cards',
      `${seeded.scenarioChar1Id}.png`
    );
    expect(fs.existsSync(charCardPath)).toBe(false);

    // Chat image should still be imported since conversations were selected
    const chatImageFilePath = path.join(
      targetServer.dataDir,
      'scenario',
      targetScenRow.id,
      'chat_images',
      'tea_cup.png'
    );
    expect(fs.existsSync(chatImageFilePath)).toBe(true);
  });

  it('omits turn state when Turn checkbox is omitted', async () => {
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const { seeded, zipBuffer } = await exportFullScenarioZip(sourceServer);

    targetServer = await createTestServer();
    targetServer.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'CompleteExportTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioCharactersIds: [seeded.scenarioId],
      selectedScenarioGroupsIds: [seeded.scenarioId],
      selectedScenarioSchedulesIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [seeded.scenarioId],
      selectedScenarioConversationsIds: [seeded.scenarioId],
      selectedScenarioTurnIds: [], // Turn omitted
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    const turnCount = targetServer.db
      .prepare("SELECT count(*) as count FROM key_value WHERE key LIKE 'scenario_%_turn'")
      .get() as { count: number };
    expect(turnCount.count).toBe(0);

    const charCount = targetServer.db.prepare('SELECT count(*) as count FROM scenario_character').get() as {
      count: number;
    };
    expect(charCount.count).toBe(2);

    const convCount = targetServer.db.prepare('SELECT count(*) as count FROM conversation').get() as {
      count: number;
    };
    expect(convCount.count).toBe(1);
  });
});
