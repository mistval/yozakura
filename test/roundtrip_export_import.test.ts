import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
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
import { validateStagedData } from '../client/src/components/import_export/importValidation.js';
import { prepareStagingAndBuildCommitPayload } from '../client/src/components/import_export/importCommitPayloadBuilder.js';
import { importStagingDatabase } from '../client/src/backend_bridge/database.js';
import type { WorldMap, Scenario, ScenarioSummary, Character } from '../client/src/engine/types.js';

describe('Integration: Full Round-Trip Pack, Unpack & ID Remapping', () => {
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

  it('exports a full scenario and imports it into a target server with all IDs remapped', async () => {
    // 1. Setup Source Server
    sourceServer = await createTestServer();
    sourceServer.setActive();
    const seeded = seedCompleteScenario(sourceServer.db, sourceServer.dataDir);

    const sourceMapRow = sourceServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as {
      data: string;
    };
    const sourceGlobalCharRow = sourceServer.db
      .prepare('SELECT data FROM character WHERE id = ?')
      .get(seeded.globalCharId) as { data: string };
    const sourceScenarioRow = sourceServer.db
      .prepare('SELECT data FROM scenario WHERE id = ?')
      .get(seeded.scenarioId) as { data: string };

    const sourceMap = JSON.parse(sourceMapRow.data) as WorldMap;
    const sourceGlobalChar = JSON.parse(sourceGlobalCharRow.data) as Character;
    const sourceScenario = JSON.parse(sourceScenarioRow.data) as Scenario;

    const sourceScenarioSummary: ScenarioSummary = {
      scenario: sourceScenario,
      mapName: sourceMap.name,
      userCharacterName: 'Alice Liddell',
      createdAt: sourceScenario.createdAt,
      updatedAt: sourceScenario.updatedAt,
    };

    // 2. Build full export payload
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
      exportName: 'RoundTripTest',
      selectedIds,
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
      templateGroupData: {},
    });

    const { zipBuffer } = await exportViaApi(exportPayload);
    expect(zipBuffer.length).toBeGreaterThan(0);

    // 3. Setup Target Server
    targetServer = await createTestServer();
    targetServer.setActive();

    // 4. Stage Archive
    const file = new File([new Uint8Array(zipBuffer)], 'RoundTripTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);

    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');
    expect(stageResult.manifest.exportName).toBe('RoundTripTest');

    // 5. Validate Staged Data
    const validation = await validateStagedData({
      selectedScenarioIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      selectedTemplateChainIds: [],
    });
    if (!validation.valid) {
      console.error('Validation errors:', validation.errors);
    }
    expect(validation.valid).toBe(true);

    // 6. Prepare staging & build commit payload
    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [seeded.scenarioId],
      selectedScenarioGroupsIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {},
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // 8. Assert Database State on Target Server
    // The scenario ID must be newly minted (18 hex chars) and not match source ID
    const targetScenarios = targetServer.db.prepare('SELECT id, data FROM scenario').all() as Array<{
      id: string;
      data: string;
    }>;
    expect(targetScenarios.length).toBe(1);
    const newScenarioId = targetScenarios[0]!.id;
    expect(newScenarioId).toMatch(/^[0-9a-f]{18}$/);
    expect(newScenarioId).not.toBe(seeded.scenarioId);

    const targetScenarioData = JSON.parse(targetScenarios[0]!.data) as Scenario;
    expect(targetScenarioData.mapId).toBe(seeded.mapId); // Unconflicted global map retains ID

    // Assert scenario characters have remapped IDs and point to newScenarioId
    const targetCharacters = targetServer.db
      .prepare('SELECT id, scenario_id, data FROM scenario_character')
      .all() as Array<{ id: string; scenario_id: string; data: string }>;
    expect(targetCharacters.length).toBe(2);
    for (const charRow of targetCharacters) {
      expect(charRow.scenario_id).toBe(newScenarioId);
      expect(charRow.id).toMatch(/^[0-9a-f]{18}$/);
      expect(charRow.id).not.toBe(seeded.scenarioChar1Id);
      expect(charRow.id).not.toBe(seeded.scenarioChar2Id);

      const charData = JSON.parse(charRow.data) as Character;
      expect(charData.scenarioId).toBe(newScenarioId);
      // Group IDs must be remapped to the new group ID
      expect(charData.groupIds.length).toBe(1);
      expect(charData.groupIds[0]).toMatch(/^[0-9a-f]{18}$/);
      expect(charData.groupIds[0]).not.toBe(seeded.groupId);
    }

    // Assert Character Group remapped
    const targetGroups = targetServer.db
      .prepare('SELECT id, scenario_id, data FROM scenario_character_group')
      .all() as Array<{ id: string; scenario_id: string; data: string }>;
    expect(targetGroups.length).toBe(1);
    expect(targetGroups[0]!.scenario_id).toBe(newScenarioId);
    expect(targetGroups[0]!.id).not.toBe(seeded.groupId);
    const targetGroupData = JSON.parse(targetGroups[0]!.data) as { characterIds: string[] };
    expect(targetGroupData.characterIds.length).toBe(2);
    expect(targetGroupData.characterIds).not.toContain(seeded.scenarioChar1Id);
    expect(targetGroupData.characterIds).not.toContain(seeded.scenarioChar2Id);

    // Assert Group Schedule remapped
    const targetSchedules = targetServer.db
      .prepare('SELECT id, scenario_id, group_id FROM scenario_character_group_schedule')
      .all() as Array<{ id: string; scenario_id: string; group_id: string }>;
    expect(targetSchedules.length).toBe(1);
    expect(targetSchedules[0]!.scenario_id).toBe(newScenarioId);
    expect(targetSchedules[0]!.group_id).toBe(targetGroups[0]!.id);

    // Assert Character Relationship remapped
    const targetRelationships = targetServer.db
      .prepare('SELECT id, from_id, to_id, data FROM character_relationship')
      .all() as Array<{ id: string; from_id: string; to_id: string; data: string }>;
    expect(targetRelationships.length).toBe(1);
    expect(targetRelationships[0]!.from_id).not.toBe(seeded.scenarioChar1Id);
    expect(targetRelationships[0]!.to_id).not.toBe(seeded.scenarioChar2Id);

    // Assert Conversation & Participants remapped
    const targetConversations = targetServer.db
      .prepare('SELECT id, scenario_id FROM conversation')
      .all() as Array<{ id: string; scenario_id: string }>;
    expect(targetConversations.length).toBe(1);
    expect(targetConversations[0]!.scenario_id).toBe(newScenarioId);
    expect(targetConversations[0]!.id).not.toBe(seeded.convId);

    const targetParticipants = targetServer.db
      .prepare('SELECT id, character_id, conversation_id FROM conversation_participant')
      .all() as Array<{ id: string; character_id: string; conversation_id: string }>;
    expect(targetParticipants.length).toBe(2);
    expect(targetParticipants[0]!.conversation_id).toBe(targetConversations[0]!.id);

    // Assert Turn State in key_value remapped
    const turnRow = targetServer.db
      .prepare(`SELECT key, data FROM key_value WHERE key = ?`)
      .get(`scenario_${newScenarioId}_turn`) as { key: string; data: string } | undefined;
    expect(turnRow).toBeDefined();
    const turnData = JSON.parse(turnRow!.data) as {
      scenarioId: string;
      activeParticipantIds: string[];
      currentSpeakerId: string;
    };
    expect(turnData.scenarioId).toBe(newScenarioId);
    expect(turnData.activeParticipantIds).not.toContain(seeded.scenarioChar1Id);
    expect(turnData.currentSpeakerId).not.toBe(seeded.scenarioChar1Id);

    // 9. Assert Copied Images in Target Filesystem
    const targetCard1Path = path.join(
      targetServer.dataDir,
      'scenario',
      newScenarioId,
      'character_cards',
      `${targetCharacters[0]!.id}.png`
    );
    const targetCard2Path = path.join(
      targetServer.dataDir,
      'scenario',
      newScenarioId,
      'character_cards',
      `${targetCharacters[1]!.id}.png`
    );
    const targetChatImgPath = path.join(
      targetServer.dataDir,
      'scenario',
      newScenarioId,
      'chat_images',
      'tea_cup.png'
    );
    const targetGlobalCardPath = path.join(
      targetServer.dataDir,
      'character_cards',
      `${seeded.globalCharId}.png`
    );

    expect(fs.existsSync(targetCard1Path)).toBe(true);
    expect(fs.existsSync(targetCard2Path)).toBe(true);
    expect(fs.existsSync(targetChatImgPath)).toBe(true);
    expect(fs.existsSync(targetGlobalCardPath)).toBe(true);

    expect(fs.readFileSync(targetChatImgPath, 'utf8')).toBe('FAKE_CHAT_PNG');
    expect(fs.readFileSync(targetGlobalCardPath, 'utf8')).toBe('FAKE_GLOBAL_PNG');
  });
});
