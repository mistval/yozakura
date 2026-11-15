import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createZipBuffer } from '../server/src/routes/export.js';
import {
  createTestServer,
  seedCompleteScenario,
  setupFetchShim,
  restoreFetch,
  exportViaApi,
  type TestServer,
} from './harness.js';
import { buildExportPayload, TreeEntityIds } from '../client/src/backend_bridge/export_payload_builder.js';
import { stageImportArchive, cancelImport, commitImport } from '../client/src/backend_bridge/import_api.js';
import { validateStagedData } from '../client/src/backend_bridge/import_validation.js';
import { prepareStagingAndBuildCommitPayload } from '../client/src/backend_bridge/import_commit_payload_builder.js';
import { MAX_DB_ROW_LINE_CHARS } from '../server/src/routes/import.js';
import type { WorldMap, Scenario, ScenarioSummary, Character } from '../client/src/engine/types.js';

describe('Integration: Security, Resilience & Staging Lifecycle', () => {
  let server: TestServer;

  beforeAll(() => {
    setupFetchShim();
  });

  afterAll(() => {
    restoreFetch();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it('rejects export filenames that do not end with .yozakura_export.zip', async () => {
    server = await createTestServer();
    server.setActive();

    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exportName: 'BadExtension',
        filename: 'BadExtension.zip',
        overwrite: true,
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain('.yozakura_export.zip');
  });

  it('enforces 409 overwrite confirmation when export file already exists', async () => {
    server = await createTestServer();
    server.setActive();

    // 1. First export
    const payload = {
      exportName: 'OverwriteTest',
      filename: 'OverwriteTest.yozakura_export.zip',
      overwrite: false,
      queries: [],
      imageDescriptors: [],
    };

    const firstRes = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(firstRes.status).toBe(200);

    // 2. Second export without overwrite -> returns 409
    const conflictRes = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(conflictRes.status).toBe(409);
    const conflictBody = (await conflictRes.json()) as { alreadyExists?: boolean };
    expect(conflictBody.alreadyExists).toBe(true);

    // 3. Third export with overwrite: true -> succeeds with 200
    const overwriteRes = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, overwrite: true }),
    });
    expect(overwriteRes.status).toBe(200);
  });

  it('rejects path-traversal attempts in export filename', async () => {
    server = await createTestServer();
    server.setActive();

    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exportName: 'Traversal',
        filename: '../../../malicious.yozakura_export.zip',
        overwrite: true,
      }),
    });

    expect(response.status).toBe(400);
  });

  it('gracefully handles staging invalid / corrupted zip data', async () => {
    server = await createTestServer();
    server.setActive();

    const corruptedFile = new File(['NOT_A_VALID_ZIP_ARCHIVE_DATA'], 'corrupted.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(corruptedFile);
    expect(stageResult.success).toBe(false);
    if (!stageResult.success) {
      expect(stageResult.error).toBeDefined();
    }
  });

  it('cleanly detaches and cleans up staging directory on cancelImport', async () => {
    server = await createTestServer();
    server.setActive();
    const seeded = seedCompleteScenario(server.db, server.dataDir);

    const sourceMap = JSON.parse(
      (server.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as { data: string }).data
    ) as WorldMap;
    const sourceGlobalChar = JSON.parse(
      (
        server.db.prepare('SELECT data FROM character WHERE id = ?').get(seeded.globalCharId) as {
          data: string;
        }
      ).data
    ) as Character;
    const sourceScenario = JSON.parse(
      (server.db.prepare('SELECT data FROM scenario WHERE id = ?').get(seeded.scenarioId) as { data: string })
        .data
    ) as Scenario;

    const sourceScenarioSummary: ScenarioSummary = {
      scenario: sourceScenario,
      mapId: sourceScenario.mapId,
      mapName: sourceMap.name,
      userCharacterName: 'Alice Liddell',
      createdAt: sourceScenario.createdAt,
      updatedAt: sourceScenario.updatedAt,
      hasCharacters: true,
      hasCharacterGroups: true,
      hasCharacterGroupSchedules: true,
      hasRelationships: true,
      hasConversationLogs: true,
      hasCurrentConversation: true,
    };

    const exportPayload = buildExportPayload({
      exportName: 'CancelTest',
      selectedIds: new Set([TreeEntityIds.scenario(seeded.scenarioId)]),
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
    });

    const { zipBuffer } = await exportViaApi(exportPayload);

    // Stage
    const file = new File([new Uint8Array(zipBuffer)], 'CancelTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);

    const stagingDir = path.join(server.dataDir, 'temp', 'import_staging');
    expect(fs.existsSync(stagingDir)).toBe(true);

    // Cancel import
    await cancelImport();

    // Staging directory must be wiped
    expect(fs.existsSync(stagingDir)).toBe(false);

    // Re-staging immediately should succeed without detached database collisions
    const secondStage = await stageImportArchive(file);
    expect(secondStage.success).toBe(true);
  });

  it('stages successfully when db_rows.jsonl has out-of-order foreign key rows (child before parent)', async () => {
    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'OutOfOrderExport', dbUserVersion: 7 };
    const now = new Date().toISOString();

    // Child row (scenario_character) before parent row (scenario)
    const dbRowsLines = [
      JSON.stringify({
        table: 'scenario_character',
        row: {
          id: '0123456789abcdef30',
          scenario_id: '0123456789abcdef01',
          data: JSON.stringify({
            id: '0123456789abcdef30',
            firstName: 'Child',
            lastName: 'First',
            scenarioId: '0123456789abcdef01',
          }),
          created_at: now,
          updated_at: now,
        },
      }),
      JSON.stringify({
        table: 'scenario',
        row: {
          id: '0123456789abcdef01',
          data: JSON.stringify({
            id: '0123456789abcdef01',
            name: 'Parent Scenario',
            userCharacterId: '0123456789abcdef30',
          }),
          created_at: now,
          updated_at: now,
        },
      }),
    ].join('\n');

    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'db_rows.jsonl', content: dbRowsLines },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'OutOfOrder.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);

    // Verify both rows were populated into staging
    const charRow = server.db
      .prepare("SELECT id FROM import_staging.scenario_character WHERE id = '0123456789abcdef30'")
      .get() as { id: string } | undefined;
    const scenRow = server.db
      .prepare("SELECT id FROM import_staging.scenario WHERE id = '0123456789abcdef01'")
      .get() as { id: string } | undefined;

    expect(charRow).toBeDefined();
    expect(scenRow).toBeDefined();
  });

  it('safely ignores unknown tables and malicious properties in db_rows.jsonl without throwing SQL errors', async () => {
    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'MaliciousExport', dbUserVersion: 7 };
    const now = new Date().toISOString();

    const dbRowsLines = [
      // SQL injection table name
      JSON.stringify({
        table: 'scenario"; DROP TABLE sqlite_schema; --',
        row: { id: 'bad_table' },
      }),
      // Nonexistent table
      JSON.stringify({
        table: 'nonexistent_table',
        row: { id: 'unknown' },
      }),
      // Valid table with legitimate and illegitimate/malicious property keys
      JSON.stringify({
        table: 'scenario',
        row: {
          id: '0123456789abcdef99',
          data: JSON.stringify({ id: '0123456789abcdef99', name: 'Safe Scenario' }),
          'bad_column"; DROP TABLE scenario; --': 'exploit',
          created_at: now,
          updated_at: now,
        },
      }),
    ].join('\n');

    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'db_rows.jsonl', content: dbRowsLines },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'Malicious.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);

    const safeScen = server.db
      .prepare("SELECT id FROM import_staging.scenario WHERE id = '0123456789abcdef99'")
      .get() as { id: string } | undefined;
    expect(safeScen).toBeDefined();
  });

  it('runs forward migrations against unpackedDir and renames disk assets', async () => {
    server = await createTestServer();
    server.setActive();

    // dbUserVersion: 6 has 32-char hex IDs before migration 7 normalizes them
    const oldCharId = '93449930c6a045acbd8c538e3dc96206';
    const normalizedCharId = '8725fc2bda99a82672';
    const nonIdHexToken = 'abcdef0123456789abcdef0123456789';
    const oldWardrobeId = '11112222333344445555666677778888';
    const userEnteredJson = JSON.stringify({ id: nonIdHexToken, note: 'User custom json payload' });
    const now = new Date().toISOString();

    const manifest = { exportName: 'OlderArchive', dbUserVersion: 6 };
    const dbRowsLines = [
      JSON.stringify({
        table: 'character',
        row: {
          id: oldCharId,
          data: JSON.stringify({
            id: oldCharId,
            firstName: 'Old',
            lastName: 'Format',
            internalDescription: userEnteredJson,
            wardrobes: [
              {
                id: oldWardrobeId,
                text: 'casual',
                enabled: true,
                tags: [],
                autoRevert: false,
              },
            ],
            imagePath: `/api/files/character_cards/${oldCharId}.png`,
          }),
          created_at: now,
          updated_at: now,
        },
      }),
    ].join('\n');

    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'db_rows.jsonl', content: dbRowsLines },
      { name: `character_cards/${oldCharId}.png`, content: Buffer.from('FAKE_CARD_DATA') },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'OlderArchive.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);

    // Staging DB row should be migrated to normalized ID
    const migratedChar = server.db.prepare('SELECT id, data FROM import_staging.character').get() as
      { id: string; data: string } | undefined;
    expect(migratedChar).toBeDefined();
    expect(migratedChar?.id).toBe(normalizedCharId);

    // Non-ID 32-hex tokens in user-entered JSON text fields must NOT be mutated
    const parsedData = JSON.parse(migratedChar!.data);
    expect(parsedData.internalDescription).toBe(userEnteredJson);

    // Wardrobe ID must be normalized to 18 hex chars
    expect(parsedData.wardrobes[0].id).toMatch(/^[0-9a-f]{18}$/);
    expect(parsedData.wardrobes[0].id).not.toBe(oldWardrobeId);

    // Disk asset in unpackedDir should have been renamed from oldCharId.png to normalizedCharId.png
    const stagingDir = path.join(server.dataDir, 'temp', 'import_staging');
    const oldCardPath = path.join(stagingDir, 'unpacked', 'character_cards', `${oldCharId}.png`);
    const newCardPath = path.join(stagingDir, 'unpacked', 'character_cards', `${normalizedCharId}.png`);

    expect(fs.existsSync(oldCardPath)).toBe(false);
    expect(fs.existsSync(newCardPath)).toBe(true);
  });

  it('fails staging when db_rows.jsonl has a malformed or corrupted line', async () => {
    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'CorruptedLineExport', dbUserVersion: 7 };
    const dbRowsLines = [
      JSON.stringify({ table: 'map', row: { id: '0123456789abcdef01', name: 'Valid', data: '{}' } }),
      'THIS IS NOT VALID JSON {{{',
    ].join('\n');

    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'db_rows.jsonl', content: dbRowsLines },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'CorruptLine.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(false);
    if (!stageResult.success) {
      expect(stageResult.error).toContain('Corrupt export archive');
    }
  });

  it('rejects commit when image destination is outside allowedImageDirectories', async () => {
    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'ImageSecurityExport', dbUserVersion: 7 };
    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'character_cards/pic.png', content: Buffer.from('IMAGE_BYTES') },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'ImageSecurity.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    // Attempt to commit copying to forbidden directory (e.g., 'backups/malicious.png' or 'evil_folder')
    const commitResult = await commitImport({
      sqlStatements: [],
      imageCopies: [
        {
          zipPath: 'character_cards/pic.png',
          targetRelPath: 'backups/malicious.png',
        },
      ],
      allowedImageDirectories: ['character_cards', 'scenario'],
    });

    expect(commitResult.success).toBe(false);
    if (!commitResult.success) {
      expect(commitResult.error).toContain('Forbidden image copy destination');
    }
  });

  it('rejects commit for bare allowed directory targets, disallowed file extensions, and subdirectories', async () => {
    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'ExtensionSecurityExport', dbUserVersion: 7 };
    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'character_cards/pic.png', content: Buffer.from('IMAGE_BYTES') },
      { name: 'character_cards/payload.txt', content: Buffer.from('NOT_A_PNG') },
      { name: 'scenario/scen_bad_ext/character_cards/evil.exe', content: Buffer.from('BAD_EXE') },
      { name: 'scenario/scen_nested/character_cards/good.png', content: Buffer.from('PNG') },
      { name: 'scenario/scen_nested/character_cards/subdir/extra.png', content: Buffer.from('PNG') },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'ExtensionSecurity.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    // 1. Reject bare allowed directory as targetRelPath (must be a subpath inside allowed dir)
    const bareDirResult = await commitImport({
      sqlStatements: [],
      imageCopies: [{ zipPath: 'character_cards/pic.png', targetRelPath: 'character_cards' }],
      allowedImageDirectories: ['character_cards', 'scenario'],
      allowedFileExtensions: ['.png'],
    });
    expect(bareDirResult.success).toBe(false);
    if (!bareDirResult.success) {
      expect(bareDirResult.error).toContain('Forbidden image copy destination');
    }

    // 2. Reject single-file copy with disallowed extension
    const singleFileBadExt = await commitImport({
      sqlStatements: [],
      imageCopies: [{ zipPath: 'character_cards/payload.txt', targetRelPath: 'character_cards/payload.txt' }],
      allowedImageDirectories: ['character_cards', 'scenario'],
      allowedFileExtensions: ['.png'],
    });
    expect(singleFileBadExt.success).toBe(false);
    if (!singleFileBadExt.success) {
      expect(singleFileBadExt.error).toContain('Forbidden file extension in image copy');
    }

    // 3. Reject directory copy containing a disallowed file extension
    const dirBadExt = await commitImport({
      sqlStatements: [],
      imageCopies: [
        {
          zipPath: 'scenario/scen_bad_ext/character_cards',
          targetRelPath: 'scenario/scen_bad_ext/character_cards',
        },
      ],
      allowedImageDirectories: ['character_cards', 'scenario'],
      allowedFileExtensions: ['.png'],
    });
    expect(dirBadExt.success).toBe(false);
    if (!dirBadExt.success) {
      expect(dirBadExt.error).toContain('Forbidden file extension in image copy');
    }

    // 4. Reject directory copy containing nested subdirectories
    const dirSubdir = await commitImport({
      sqlStatements: [],
      imageCopies: [
        {
          zipPath: 'scenario/scen_nested/character_cards',
          targetRelPath: 'scenario/scen_nested/character_cards',
        },
      ],
      allowedImageDirectories: ['character_cards', 'scenario'],
      allowedFileExtensions: ['.png'],
    });
    expect(dirSubdir.success).toBe(false);
    if (!dirSubdir.success) {
      expect(dirSubdir.error).toContain('not a regular file');
    }
  });

  it('rejects staging when a db_rows.jsonl line exceeds MAX_DB_ROW_LINE_CHARS', async () => {
    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'OversizedLineExport', dbUserVersion: 7 };
    const oversizedLine = JSON.stringify({
      table: 'map',
      row: {
        id: '0123456789abcdef01',
        name: 'Oversized',
        data: 'x'.repeat(MAX_DB_ROW_LINE_CHARS + 1),
      },
    });

    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'db_rows.jsonl', content: oversizedLine },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'OversizedLine.yozakura_export.zip', {
      type: 'application/zip',
    });

    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(false);
    if (!stageResult.success) {
      expect(stageResult.error).toContain('exceeds maximum allowed size');
    }
  });

  it('rejects tampered character imagePath in validateStagedData', async () => {
    const sourceServer = await createTestServer();
    let zipBuffer: Buffer;
    let seeded: ReturnType<typeof seedCompleteScenario>;

    try {
      sourceServer.setActive();
      seeded = seedCompleteScenario(sourceServer.db, sourceServer.dataDir);

      const sourceMap = JSON.parse(
        (sourceServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as { data: string })
          .data
      ) as WorldMap;
      const sourceScenario = JSON.parse(
        (
          sourceServer.db.prepare('SELECT data FROM scenario WHERE id = ?').get(seeded.scenarioId) as {
            data: string;
          }
        ).data
      ) as Scenario;
      const sourceGlobalChar = JSON.parse(
        (
          sourceServer.db.prepare('SELECT data FROM character WHERE id = ?').get(seeded.globalCharId) as {
            data: string;
          }
        ).data
      ) as Character;

      const sourceScenarioSummary: ScenarioSummary = {
        scenario: sourceScenario,
        mapId: sourceScenario.mapId,
        mapName: sourceMap.name,
        userCharacterName: 'Alice Liddell',
        hasCharacters: true,
        hasCharacterGroups: true,
        hasCharacterGroupSchedules: true,
        hasRelationships: true,
        hasConversationLogs: true,
        hasCurrentConversation: true,
        createdAt: sourceScenario.createdAt,
        updatedAt: sourceScenario.updatedAt,
      };

      const exportPayload = buildExportPayload({
        exportName: 'ValidationSecurityExport',
        selectedIds: new Set([
          TreeEntityIds.scenario(seeded.scenarioId),
          TreeEntityIds.scenarioCharacters(seeded.scenarioId),
          TreeEntityIds.scenarioGroups(seeded.scenarioId),
          TreeEntityIds.scenarioSchedules(seeded.scenarioId),
          TreeEntityIds.scenarioMemories(seeded.scenarioId),
          TreeEntityIds.scenarioConversations(seeded.scenarioId),
          TreeEntityIds.map(seeded.mapId),
          TreeEntityIds.character(seeded.globalCharId),
        ]),
        scenarios: [sourceScenarioSummary],
        maps: [sourceMap],
        globalCharacters: [sourceGlobalChar],
      });

      ({ zipBuffer } = await exportViaApi(exportPayload));
    } finally {
      await sourceServer.close();
    }

    server = await createTestServer();
    server.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'ValidationSecurity.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error('Stage failed');

    // Baseline check passes
    const validResult = await validateStagedData({
      selectedScenarioIds: [seeded.scenarioId],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [seeded.globalCharId],
    });
    expect(validResult.valid).toBe(true);

    // 1. Global character allows valid filenames inside /api/files/character_cards/ even if filename != id
    //    (commit normalizes them to <targetId>.png), while rejecting wrong directories, traversal,
    //    subdirectories, non-.png extensions, and external URLs
    const globalCharRow = server.db
      .prepare('SELECT data FROM import_staging.character WHERE id = ?')
      .get(seeded.globalCharId) as { data: string };
    const globalCharData = JSON.parse(globalCharRow.data) as Record<string, unknown>;
    const originalGlobalImagePath = globalCharData.imagePath;

    server.db.prepare('UPDATE import_staging.character SET data = ? WHERE id = ?').run(
      JSON.stringify({
        ...globalCharData,
        imagePath: '/api/files/character_cards/custom_portrait.png?v=123',
      }),
      seeded.globalCharId
    );

    const customGlobalImgRes = await validateStagedData({
      selectedScenarioIds: [],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [seeded.globalCharId],
    });
    expect(customGlobalImgRes.valid).toBe(true);

    // Reject /images/../ traversal, wrong directories, nested subdirs, non-.png, and external URLs
    for (const badPath of [
      '/images/../secret.png',
      `/api/files/scenario/${seeded.scenarioId}/character_cards/${seeded.globalCharId}.png`,
      '/api/files/character_cards/nested/pic.png',
      '/api/files/character_cards/evil.svg',
      'https://evil.com/portrait.png',
    ]) {
      server.db
        .prepare('UPDATE import_staging.character SET data = ? WHERE id = ?')
        .run(JSON.stringify({ ...globalCharData, imagePath: badPath }), seeded.globalCharId);

      const rejectedImgRes = await validateStagedData({
        selectedScenarioIds: [],
        selectedMapIds: [],
        selectedGlobalCharacterIds: [seeded.globalCharId],
      });
      expect(rejectedImgRes.valid).toBe(false);
    }

    server.db
      .prepare('UPDATE import_staging.character SET data = ? WHERE id = ?')
      .run(JSON.stringify({ ...globalCharData, imagePath: originalGlobalImagePath }), seeded.globalCharId);

    // 2. Scenario character allows valid filenames inside its own scenario character_cards/ dir
    //    (e.g. cloned globalCharacterId filename), but rejects other scenarios or wrong dirs
    const scenCharRow = server.db
      .prepare('SELECT data FROM import_staging.scenario_character WHERE id = ?')
      .get(seeded.scenarioChar1Id) as { data: string };
    const scenCharData = JSON.parse(scenCharRow.data) as Record<string, unknown>;
    server.db.prepare('UPDATE import_staging.scenario_character SET data = ? WHERE id = ?').run(
      JSON.stringify({
        ...scenCharData,
        imagePath: `/api/files/scenario/${seeded.scenarioId}/character_cards/${seeded.globalCharId}.png`,
      }),
      seeded.scenarioChar1Id
    );

    const nonMatchingIdScenImgRes = await validateStagedData({
      selectedScenarioIds: [seeded.scenarioId],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [],
    });
    expect(nonMatchingIdScenImgRes.valid).toBe(true);

    server.db.prepare('UPDATE import_staging.scenario_character SET data = ? WHERE id = ?').run(
      JSON.stringify({
        ...scenCharData,
        imagePath: `/api/files/scenario/ffffffffffffffffff/character_cards/${seeded.scenarioChar1Id}.png`,
      }),
      seeded.scenarioChar1Id
    );

    const badScenImgRes = await validateStagedData({
      selectedScenarioIds: [seeded.scenarioId],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [],
    });
    expect(badScenImgRes.valid).toBe(false);
    if (!badScenImgRes.valid) {
      expect(badScenImgRes.errors.join('\n')).toContain('Invalid character imagePath');
    }

    // 3. Duplicate ID across staging tables (e.g. a map and a scenario sharing an ID) is rejected
    const now = new Date().toISOString();
    server.db
      .prepare('INSERT INTO import_staging.map (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(seeded.scenarioId, '{}', now, now);

    const duplicateIdRes = await validateStagedData({
      selectedScenarioIds: [],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [],
    });
    expect(duplicateIdRes.valid).toBe(false);
    if (!duplicateIdRes.valid) {
      expect(duplicateIdRes.errors.join('\n')).toContain('Duplicate entity IDs found across staging tables');
      expect(duplicateIdRes.errors.join('\n')).toContain(seeded.scenarioId);
    }
  });

  it('rejects staging when archive contains symlink entries and rejects symlink sources on commit', async () => {
    /** Marks matching entries as Unix symlinks in the ZIP central directory. */
    const markZipEntriesAsSymlinks = (zip: Buffer, symlinkEntryNames: ReadonlySet<string>): Buffer => {
      const patched = Buffer.from(zip);
      let pos = 0;
      let patchedCount = 0;
      while (pos <= patched.length - 46) {
        if (patched.readUInt32LE(pos) === 0x02014b50) {
          const nameLen = patched.readUInt16LE(pos + 28);
          const extraLen = patched.readUInt16LE(pos + 30);
          const commentLen = patched.readUInt16LE(pos + 32);
          const entryName = patched.toString('utf8', pos + 46, pos + 46 + nameLen);
          if (symlinkEntryNames.has(entryName)) {
            patched.writeUInt16LE(0x031e, pos + 4);
            patched.writeUInt32LE((0o120777 << 16) >>> 0, pos + 38);
            patchedCount++;
          }
          pos += 46 + nameLen + extraLen + commentLen;
        } else {
          pos++;
        }
      }
      expect(patchedCount).toBe(symlinkEntryNames.size);
      return patched;
    };

    server = await createTestServer();
    server.setActive();

    const manifest = { exportName: 'SymlinkArchive', dbUserVersion: 8 };

    // 1. Archive with a file symlink pointing outside unpackedDir
    const rawFileSymlinkZip = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'character_cards/victim.png', content: Buffer.from('../../../../app.sqlite') },
    ]);
    const fileSymlinkZip = markZipEntriesAsSymlinks(
      rawFileSymlinkZip,
      new Set(['character_cards/victim.png'])
    );

    const stageFileSymlinkRes = await stageImportArchive(
      new File([new Uint8Array(fileSymlinkZip)], 'SymlinkFile.yozakura_export.zip', {
        type: 'application/zip',
      })
    );
    expect(stageFileSymlinkRes.success).toBe(false);
    if (!stageFileSymlinkRes.success) {
      expect(stageFileSymlinkRes.error).toContain('Forbidden symlink entry in import archive');
    }
    expect(fs.existsSync(path.join(server.dataDir, 'temp', 'import_staging'))).toBe(false);

    // 2. Archive with a directory-named symlink at character_cards
    const rawDirSymlinkZip = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'character_cards', content: Buffer.from('../../../character_cards') },
    ]);
    const dirSymlinkZip = markZipEntriesAsSymlinks(rawDirSymlinkZip, new Set(['character_cards']));

    const stageDirSymlinkRes = await stageImportArchive(
      new File([new Uint8Array(dirSymlinkZip)], 'SymlinkDir.yozakura_export.zip', {
        type: 'application/zip',
      })
    );
    expect(stageDirSymlinkRes.success).toBe(false);
    if (!stageDirSymlinkRes.success) {
      expect(stageDirSymlinkRes.error).toContain('Forbidden symlink entry in import archive');
    }

    // 3. Defense-in-depth: /import/commit rejects symlink copy sources via lstat
    const cleanZip = await createZipBuffer([{ name: 'manifest.json', content: JSON.stringify(manifest) }]);
    const cleanStageRes = await stageImportArchive(
      new File([new Uint8Array(cleanZip)], 'Clean.yozakura_export.zip', { type: 'application/zip' })
    );
    expect(cleanStageRes.success).toBe(true);

    const unpackedCardsDir = path.join(
      server.dataDir,
      'temp',
      'import_staging',
      'unpacked',
      'character_cards'
    );
    fs.mkdirSync(unpackedCardsDir, { recursive: true });
    fs.symlinkSync(path.join(server.dataDir, 'app.sqlite'), path.join(unpackedCardsDir, 'sneaky.png'));

    const symlinkCommitRes = await commitImport({
      sqlStatements: [],
      imageCopies: [
        {
          zipPath: 'character_cards/sneaky.png',
          targetRelPath: 'character_cards/sneaky.png',
        },
      ],
      allowedImageDirectories: ['character_cards', 'scenario'],
      allowedFileExtensions: ['.png'],
    });
    expect(symlinkCommitRes.success).toBe(false);
    if (!symlinkCommitRes.success) {
      expect(symlinkCommitRes.error).toContain('Forbidden symlink image copy source');
    }
    expect(fs.existsSync(path.join(server.dataDir, 'character_cards', 'sneaky.png'))).toBe(false);
  });

  it('rejects mismatched SQL id and JSON data id across TABLE_COLUMNS tables and prevents fallback copy overwrite', async () => {
    const sourceServer = await createTestServer();
    let zipBuffer: Buffer;
    let seeded: ReturnType<typeof seedCompleteScenario>;

    try {
      sourceServer.setActive();
      seeded = seedCompleteScenario(sourceServer.db, sourceServer.dataDir);

      const sourceMap = JSON.parse(
        (sourceServer.db.prepare('SELECT data FROM map WHERE id = ?').get(seeded.mapId) as { data: string })
          .data
      ) as WorldMap;
      const sourceScenario = JSON.parse(
        (
          sourceServer.db.prepare('SELECT data FROM scenario WHERE id = ?').get(seeded.scenarioId) as {
            data: string;
          }
        ).data
      ) as Scenario;
      const sourceGlobalChar = JSON.parse(
        (
          sourceServer.db.prepare('SELECT data FROM character WHERE id = ?').get(seeded.globalCharId) as {
            data: string;
          }
        ).data
      ) as Character;

      const sourceScenarioSummary: ScenarioSummary = {
        scenario: sourceScenario,
        mapId: sourceScenario.mapId,
        mapName: sourceMap.name,
        userCharacterName: 'Alice Liddell',
        hasCharacters: true,
        hasCharacterGroups: true,
        hasCharacterGroupSchedules: true,
        hasRelationships: true,
        hasConversationLogs: true,
        hasCurrentConversation: true,
        createdAt: sourceScenario.createdAt,
        updatedAt: sourceScenario.updatedAt,
      };

      const exportPayload = buildExportPayload({
        exportName: 'IdMismatchExport',
        selectedIds: new Set([
          TreeEntityIds.scenario(seeded.scenarioId),
          TreeEntityIds.scenarioCharacters(seeded.scenarioId),
          TreeEntityIds.scenarioGroups(seeded.scenarioId),
          TreeEntityIds.scenarioSchedules(seeded.scenarioId),
          TreeEntityIds.scenarioMemories(seeded.scenarioId),
          TreeEntityIds.scenarioConversations(seeded.scenarioId),
          TreeEntityIds.map(seeded.mapId),
          TreeEntityIds.character(seeded.globalCharId),
        ]),
        scenarios: [sourceScenarioSummary],
        maps: [sourceMap],
        globalCharacters: [sourceGlobalChar],
      });

      ({ zipBuffer } = await exportViaApi(exportPayload));
    } finally {
      await sourceServer.close();
    }

    server = await createTestServer();
    server.setActive();

    const file = new File([new Uint8Array(zipBuffer)], 'IdMismatch.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);

    // 1. Mismatch on global character (SQL id changed while JSON $.id still claims seeded.globalCharId)
    const fakeSqlId = 'aaaaaaaaaaaaaaaaaa';
    server.db
      .prepare('UPDATE import_staging.character SET id = ? WHERE id = ?')
      .run(fakeSqlId, seeded.globalCharId);

    // Build payload directly with "copy": must throw instead of silently falling back to zipPath overwrite
    await expect(
      prepareStagingAndBuildCommitPayload({
        exportName: 'IdMismatchExport',
        selectedGlobalCharacterIds: [seeded.globalCharId],
        conflictResolutions: { [seeded.globalCharId]: 'copy' },
      })
    ).rejects.toThrow(`Failed to allocate copy ID for global character "${seeded.globalCharId}"`);

    const charMismatchRes = await validateStagedData({
      selectedScenarioIds: [],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [seeded.globalCharId],
    });
    expect(charMismatchRes.valid).toBe(false);
    if (!charMismatchRes.valid) {
      expect(charMismatchRes.errors.join('\n')).toContain(
        `Mismatched entity column and JSON data: character.id(${fakeSqlId})`
      );
    }

    // Restore global character ID, then tamper a scenario_character row with wrong JSON id
    server.db
      .prepare('UPDATE import_staging.character SET id = ? WHERE id = ?')
      .run(seeded.globalCharId, fakeSqlId);

    const scenCharRow = server.db
      .prepare('SELECT data FROM import_staging.scenario_character WHERE id = ?')
      .get(seeded.scenarioChar1Id) as { data: string };
    const scenCharData = JSON.parse(scenCharRow.data) as Record<string, unknown>;
    server.db
      .prepare('UPDATE import_staging.scenario_character SET data = ? WHERE id = ?')
      .run(JSON.stringify({ ...scenCharData, id: 'bbbbbbbbbbbbbbbbbb' }), seeded.scenarioChar1Id);

    const scenCharMismatchRes = await validateStagedData({
      selectedScenarioIds: [seeded.scenarioId],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [],
    });
    expect(scenCharMismatchRes.valid).toBe(false);
    if (!scenCharMismatchRes.valid) {
      expect(scenCharMismatchRes.errors.join('\n')).toContain(
        `Mismatched entity column and JSON data: scenario_character.id(${seeded.scenarioChar1Id})`
      );
    }

    // Also verify relational columns (scenario_id, from_id, to_id, group_id) are checked against JSON data
    server.db
      .prepare('UPDATE import_staging.scenario_character SET data = ? WHERE id = ?')
      .run(JSON.stringify({ ...scenCharData, scenarioId: 'cccccccccccccccccc' }), seeded.scenarioChar1Id);

    const relRow = server.db
      .prepare('SELECT id, data FROM import_staging.character_relationship LIMIT 1')
      .get() as { id: string; data: string };
    const relData = JSON.parse(relRow.data) as Record<string, unknown>;
    server.db
      .prepare('UPDATE import_staging.character_relationship SET data = ? WHERE id = ?')
      .run(
        JSON.stringify({ ...relData, fromId: 'dddddddddddddddddd', toId: 'eeeeeeeeeeeeeeeeee' }),
        relRow.id
      );

    const schedRow = server.db
      .prepare('SELECT id, data FROM import_staging.scenario_character_group_schedule LIMIT 1')
      .get() as { id: string; data: string };
    const schedData = JSON.parse(schedRow.data) as Record<string, unknown>;
    server.db
      .prepare('UPDATE import_staging.scenario_character_group_schedule SET data = ? WHERE id = ?')
      .run(JSON.stringify({ ...schedData, groupId: 'ffffffffffffffffff' }), schedRow.id);

    const fkMismatchRes = await validateStagedData({
      selectedScenarioIds: [seeded.scenarioId],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [],
    });
    expect(fkMismatchRes.valid).toBe(false);
    if (!fkMismatchRes.valid) {
      const joinedErrors = fkMismatchRes.errors.join('\n');
      expect(joinedErrors).toContain(`scenario_character.scenario_id(${seeded.scenarioChar1Id})`);
      expect(joinedErrors).toContain(`character_relationship.from_id(${relRow.id})`);
      expect(joinedErrors).toContain(`character_relationship.to_id(${relRow.id})`);
      expect(joinedErrors).toContain(`scenario_character_group_schedule.group_id(${schedRow.id})`);
    }

    // Restore rows, then verify missing/non-string $.id in map is also rejected cleanly
    server.db
      .prepare('UPDATE import_staging.scenario_character SET data = ? WHERE id = ?')
      .run(scenCharRow.data, seeded.scenarioChar1Id);
    server.db
      .prepare('UPDATE import_staging.character_relationship SET data = ? WHERE id = ?')
      .run(relRow.data, relRow.id);
    server.db
      .prepare('UPDATE import_staging.scenario_character_group_schedule SET data = ? WHERE id = ?')
      .run(schedRow.data, schedRow.id);
    const mapRow = server.db
      .prepare('SELECT data FROM import_staging.map WHERE id = ?')
      .get(seeded.mapId) as { data: string };
    const mapData = JSON.parse(mapRow.data) as Record<string, unknown>;
    server.db
      .prepare('UPDATE import_staging.map SET data = ? WHERE id = ?')
      .run(JSON.stringify({ ...mapData, id: 12345 }), seeded.mapId);

    const mapTypeMismatchRes = await validateStagedData({
      selectedScenarioIds: [],
      selectedMapIds: [seeded.mapId],
      selectedGlobalCharacterIds: [],
    });
    expect(mapTypeMismatchRes.valid).toBe(false);
    if (!mapTypeMismatchRes.valid) {
      expect(mapTypeMismatchRes.errors.join('\n')).toContain(
        `Mismatched entity column and JSON data: map.id(${seeded.mapId})`
      );
    }
  });

  it('normalizes non-matching global character image filenames to <id>.png so they cannot overwrite other portraits', async () => {
    server = await createTestServer();
    server.setActive();

    const victimId = 'ffffffffffffffffff';
    const importedId = 'aaaaaaaaaaaaaaaaaa';
    const now = new Date().toISOString();

    const cardDir = path.join(server.dataDir, 'character_cards');
    fs.mkdirSync(cardDir, { recursive: true });
    fs.writeFileSync(path.join(cardDir, `${victimId}.png`), Buffer.from('VICTIM_ORIGINAL_PNG'));

    const currentDbVersion = Number(server.db.pragma('user_version', { simple: true }));
    const manifest = { exportName: 'NonMatchingImageTest', dbUserVersion: currentDbVersion };
    const importedChar = {
      id: importedId,
      createdAt: now,
      updatedAt: now,
      globalCharacterId: importedId,
      scenarioId: '',
      firstName: 'Custom',
      lastName: 'ImageChar',
      internalDescription: 'Desc',
      externalDescription: 'Ext',
      baseAppearanceTags: 'tag',
      imagePath: `/api/files/character_cards/${victimId}.png?v=123`,
      wardrobes: [],
      globalMemories: '',
      locationId: '',
      exampleDialogue: '',
      rollingConversationSummaries: [],
      nextConversationWithCharacterId: '',
      groupIds: [],
    };

    const dbRowsLines = JSON.stringify({
      table: 'character',
      row: {
        id: importedId,
        data: JSON.stringify(importedChar),
        created_at: now,
        updated_at: now,
      },
    });

    const zipBuffer = await createZipBuffer([
      { name: 'manifest.json', content: JSON.stringify(manifest) },
      { name: 'db_rows.jsonl', content: dbRowsLines },
      { name: `character_cards/${victimId}.png`, content: Buffer.from('IMPORTED_PNG_DATA') },
    ]);

    const file = new File([new Uint8Array(zipBuffer)], 'NonMatchingImageTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageRes = await stageImportArchive(file);
    expect(stageRes.success).toBe(true);

    const validRes = await validateStagedData({
      selectedScenarioIds: [],
      selectedMapIds: [],
      selectedGlobalCharacterIds: [importedId],
    });
    expect(validRes).toEqual({ valid: true });

    const payload = await prepareStagingAndBuildCommitPayload({
      exportName: 'NonMatchingImageTest',
      selectedGlobalCharacterIds: [importedId],
    });
    const commitRes = await commitImport(payload);
    expect(commitRes.success).toBe(true);

    // Victim's existing portrait file must be completely untouched
    expect(fs.readFileSync(path.join(cardDir, `${victimId}.png`), 'utf8')).toBe('VICTIM_ORIGINAL_PNG');

    // Imported character's portrait was copied to <importedId>.png and DB imagePath normalized
    expect(fs.readFileSync(path.join(cardDir, `${importedId}.png`), 'utf8')).toBe('IMPORTED_PNG_DATA');
    const storedRow = server.db.prepare('SELECT data FROM main.character WHERE id = ?').get(importedId) as {
      data: string;
    };
    expect(JSON.parse(storedRow.data).imagePath).toBe(`/api/files/character_cards/${importedId}.png`);
  });
});
