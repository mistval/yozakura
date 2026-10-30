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
import { prepareStagingAndBuildCommitPayload } from '../client/src/components/import_export/importCommitPayloadBuilder.js';
import type { WorldMap, Scenario, ScenarioSummary, Character } from '../client/src/engine/types.js';

describe('Integration: Global Conflict Resolution (Skip, Overwrite, Make a Copy)', () => {
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
      const s = sourceServer;
      sourceServer = undefined as any;
      await s.close();
    }
    if (targetServer) {
      const t = targetServer;
      targetServer = undefined as any;
      await t.close();
    }
  });

  async function setupSourceAndExport() {
    if (sourceServer) {
      await sourceServer.close();
    }
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

    const selectedIds = new Set<string>([
      TreeEntityIds.scenario(seeded.scenarioId),
      TreeEntityIds.scenarioCharacters(seeded.scenarioId),
      TreeEntityIds.map(seeded.mapId),
      TreeEntityIds.character(seeded.globalCharId),
    ]);

    const exportPayload = buildExportPayload({
      exportName: 'ConflictTest',
      selectedIds,
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
      templateGroupData: {},
    });

    const { zipBuffer } = await exportViaApi(exportPayload);
    return { seeded, zipBuffer, sourceMap, sourceGlobalChar };
  }

  it('Skip leaves existing target entities and images untouched', async () => {
    const { seeded, zipBuffer } = await setupSourceAndExport();

    targetServer = await createTestServer();
    targetServer.setActive();

    // Pre-seed target server with conflicting map and global character
    const existingMap = {
      id: seeded.mapId,
      name: 'Existing Target Map',
      description: 'Pre-existing map description',
      locations: [],
      zones: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    targetServer.db
      .prepare('INSERT INTO map (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(seeded.mapId, JSON.stringify(existingMap), existingMap.createdAt, existingMap.updatedAt);

    const existingGlobalChar = {
      id: seeded.globalCharId,
      globalCharacterId: seeded.globalCharId,
      scenarioId: '',
      firstName: 'Existing',
      lastName: 'TargetChar',
      internalDescription: 'Existing description',
      externalDescription: '',
      baseAppearanceTags: '',
      imagePath: `/api/files/character_cards/${seeded.globalCharId}.png`,
      wardrobes: [],
      globalMemories: '',
      locationId: '',
      exampleDialogue: '',
      rollingConversationSummaries: [],
      nextConversationWithCharacterId: '',
      groupIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    targetServer.db
      .prepare('INSERT INTO character (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(
        seeded.globalCharId,
        JSON.stringify(existingGlobalChar),
        existingGlobalChar.createdAt,
        existingGlobalChar.updatedAt
      );

    const targetCardDir = path.join(targetServer.dataDir, 'character_cards');
    fs.mkdirSync(targetCardDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetCardDir, `${seeded.globalCharId}.png`),
      Buffer.from('ORIGINAL_TARGET_IMAGE')
    );

    // Stage and commit with 'skip'
    const file = new File([new Uint8Array(zipBuffer)], 'ConflictTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [],
      selectedScenarioGroupsIds: [],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {
        [seeded.mapId]: 'skip',
        [seeded.globalCharId]: 'skip',
      },
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // Target map and character must be UNCHANGED
    const targetMapRow = targetServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as {
      data: string;
    };
    expect(JSON.parse(targetMapRow.data).name).toBe('Existing Target Map');

    const targetCharRow = targetServer.db
      .prepare('SELECT data FROM character WHERE id = ?')
      .get(seeded.globalCharId) as { data: string };
    expect(JSON.parse(targetCharRow.data).firstName).toBe('Existing');

    // Image file must remain original
    const cardContent = fs.readFileSync(path.join(targetCardDir, `${seeded.globalCharId}.png`), 'utf8');
    expect(cardContent).toBe('ORIGINAL_TARGET_IMAGE');
  });

  it('Overwrite replaces existing target entities and overwrites image files', async () => {
    const { seeded, zipBuffer } = await setupSourceAndExport();

    targetServer = await createTestServer();
    targetServer.setActive();

    // Pre-seed target server with conflicting entities
    const existingMap = {
      id: seeded.mapId,
      name: 'Old Map Name',
      description: 'Old description',
      locations: [],
      zones: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    targetServer.db
      .prepare('INSERT INTO map (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(seeded.mapId, JSON.stringify(existingMap), existingMap.createdAt, existingMap.updatedAt);

    const existingGlobalChar = {
      id: seeded.globalCharId,
      globalCharacterId: seeded.globalCharId,
      scenarioId: '',
      firstName: 'OldName',
      lastName: 'OldLast',
      internalDescription: 'Old desc',
      externalDescription: '',
      baseAppearanceTags: '',
      imagePath: `/api/files/character_cards/${seeded.globalCharId}.png`,
      wardrobes: [],
      globalMemories: '',
      locationId: '',
      exampleDialogue: '',
      rollingConversationSummaries: [],
      nextConversationWithCharacterId: '',
      groupIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    targetServer.db
      .prepare('INSERT INTO character (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(
        seeded.globalCharId,
        JSON.stringify(existingGlobalChar),
        existingGlobalChar.createdAt,
        existingGlobalChar.updatedAt
      );

    const targetCardDir = path.join(targetServer.dataDir, 'character_cards');
    fs.mkdirSync(targetCardDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetCardDir, `${seeded.globalCharId}.png`),
      Buffer.from('ORIGINAL_TARGET_IMAGE')
    );

    // Stage and commit with 'overwrite'
    const file = new File([new Uint8Array(zipBuffer)], 'ConflictTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [],
      selectedScenarioGroupsIds: [],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {
        [seeded.mapId]: 'overwrite',
        [seeded.globalCharId]: 'overwrite',
      },
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // Target map and character must be OVERWRITTEN
    const targetMapRow = targetServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as {
      data: string;
    };
    expect(JSON.parse(targetMapRow.data).name).toBe('Capital City');

    const targetCharRow = targetServer.db
      .prepare('SELECT data FROM character WHERE id = ?')
      .get(seeded.globalCharId) as { data: string };
    expect(JSON.parse(targetCharRow.data).firstName).toBe('Alice');

    // Image file must be OVERWRITTEN with incoming archive image
    const cardContent = fs.readFileSync(path.join(targetCardDir, `${seeded.globalCharId}.png`), 'utf8');
    expect(cardContent).toBe('FAKE_GLOBAL_PNG');
  });

  it('Make a Copy creates a duplicate entity with new ID and rewrites scenario references', async () => {
    const { seeded, zipBuffer } = await setupSourceAndExport();

    targetServer = await createTestServer();
    targetServer.setActive();

    // Pre-seed target server with conflicting map
    const existingMap = {
      id: seeded.mapId,
      name: 'Existing Map',
      description: 'Original description',
      locations: [],
      zones: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    targetServer.db
      .prepare('INSERT INTO map (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(seeded.mapId, JSON.stringify(existingMap), existingMap.createdAt, existingMap.updatedAt);

    // Stage and commit with 'copy' for map
    const file = new File([new Uint8Array(zipBuffer)], 'ConflictTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [seeded.scenarioId],
      selectedScenarioMemoriesIds: [],
      selectedScenarioGroupsIds: [],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {
        [seeded.mapId]: 'copy',
        [seeded.globalCharId]: 'overwrite',
      },
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // Both original map and copied map must exist
    const maps = targetServer.db.prepare('SELECT id, data FROM map').all() as Array<{
      id: string;
      data: string;
    }>;
    expect(maps.length).toBe(2);

    const original = maps.find((m) => m.id === seeded.mapId);
    const copied = maps.find((m) => m.id !== seeded.mapId);

    expect(original).toBeDefined();
    expect(copied).toBeDefined();
    expect(copied!.id).toMatch(/^[0-9a-f]{18}$/);
    expect(JSON.parse(copied!.data).name).toContain('(Imported From ConflictTest)');

    // The imported scenario must have its mapId remapped to the copied map ID!
    const targetScenarios = targetServer.db.prepare('SELECT data FROM scenario').all() as Array<{
      data: string;
    }>;
    expect(targetScenarios.length).toBe(1);
    const scenData = JSON.parse(targetScenarios[0]!.data) as Scenario;
    expect(scenData.mapId).toBe(copied!.id);
  });

  it('Make a Copy on a global character creates a duplicate character with new ID and portrait without overwriting existing portrait', async () => {
    const { seeded, zipBuffer } = await setupSourceAndExport();

    targetServer = await createTestServer();
    targetServer.setActive();

    // Pre-seed target server with conflicting global character and image
    const existingChar = {
      id: seeded.globalCharId,
      globalCharacterId: seeded.globalCharId,
      scenarioId: '',
      firstName: 'Existing Alice',
      lastName: 'Original',
      internalDescription: 'Existing character',
      externalDescription: '',
      baseAppearanceTags: '',
      imagePath: `/api/files/character_cards/${seeded.globalCharId}.png`,
      wardrobes: [],
      globalMemories: '',
      locationId: '',
      exampleDialogue: '',
      rollingConversationSummaries: [],
      nextConversationWithCharacterId: '',
      groupIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    targetServer.db
      .prepare('INSERT INTO character (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(seeded.globalCharId, JSON.stringify(existingChar), existingChar.createdAt, existingChar.updatedAt);

    const targetCardDir = path.join(targetServer.dataDir, 'character_cards');
    fs.mkdirSync(targetCardDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetCardDir, `${seeded.globalCharId}.png`),
      Buffer.from('ORIGINAL_EXISTING_PORTRAIT')
    );

    // Stage and commit with 'copy' for global character
    const file = new File([new Uint8Array(zipBuffer)], 'ConflictTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    const commitPayload = await prepareStagingAndBuildCommitPayload({
      sessionId: stageResult.sessionId,
      exportName: stageResult.manifest.exportName,
      selectedScenarioIds: [],
      selectedScenarioMemoriesIds: [],
      selectedScenarioGroupsIds: [],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [seeded.globalCharId],
      conflictResolutions: {
        [seeded.globalCharId]: 'copy',
      },
      stagedImages: stageResult.images,
    });

    const commitResult = await commitImport(commitPayload);
    expect(commitResult.success).toBe(true);

    // Both original character and copied character must exist
    const chars = targetServer.db.prepare('SELECT id, data FROM character').all() as Array<{
      id: string;
      data: string;
    }>;
    expect(chars.length).toBe(2);

    const original = chars.find((c) => c.id === seeded.globalCharId);
    const copied = chars.find((c) => c.id !== seeded.globalCharId);

    expect(original).toBeDefined();
    expect(copied).toBeDefined();
    expect(copied!.id).toMatch(/^[0-9a-f]{18}$/);

    const copiedData = JSON.parse(copied!.data) as Character;
    expect(copiedData.firstName).toContain('(Imported From ConflictTest)');
    expect(copiedData.imagePath).toBe(`/api/files/character_cards/${copied!.id}.png`);

    // Verify disk files: original file is NOT overwritten
    const originalContent = fs.readFileSync(path.join(targetCardDir, `${seeded.globalCharId}.png`), 'utf8');
    expect(originalContent).toBe('ORIGINAL_EXISTING_PORTRAIT');

    // New file exists with imported data
    const newCardPath = path.join(targetCardDir, `${copied!.id}.png`);
    expect(fs.existsSync(newCardPath)).toBe(true);
    const newContent = fs.readFileSync(newCardPath, 'utf8');
    expect(newContent).toBe('FAKE_GLOBAL_PNG');
  });
});
