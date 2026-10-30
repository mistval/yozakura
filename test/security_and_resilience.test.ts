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
import { stageImportArchive, cancelImport } from '../client/src/backend_bridge/import_api.js';
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
      prebuiltRows: [],
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
      mapName: sourceMap.name,
      userCharacterName: 'Alice Liddell',
      createdAt: sourceScenario.createdAt,
      updatedAt: sourceScenario.updatedAt,
    };

    const exportPayload = buildExportPayload({
      exportName: 'CancelTest',
      selectedIds: new Set([TreeEntityIds.scenario(seeded.scenarioId)]),
      scenarios: [sourceScenarioSummary],
      maps: [sourceMap],
      globalCharacters: [sourceGlobalChar],
      templateGroupData: {},
    });

    const { zipBuffer } = await exportViaApi(exportPayload);

    // Stage
    const file = new File([new Uint8Array(zipBuffer)], 'CancelTest.yozakura_export.zip', {
      type: 'application/zip',
    });
    const stageResult = await stageImportArchive(file);
    expect(stageResult.success).toBe(true);

    const stagingDir = path.join(server.dataDir, 'import_staging');
    expect(fs.existsSync(stagingDir)).toBe(true);

    // Cancel import
    await cancelImport();

    // Staging directory must be wiped
    expect(fs.existsSync(stagingDir)).toBe(false);

    // Re-staging immediately should succeed without detached database collisions
    const secondStage = await stageImportArchive(file);
    expect(secondStage.success).toBe(true);
  });
});
