import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createTestServer, setupFetchShim, restoreFetch, type TestServer } from './harness.js';
import { stagePrepackagedArchive, cancelImport } from '../client/src/backend_bridge/import_api.js';
import {
  importDemoMaps,
  importDemoScenario,
  importDemoGlobalCharacters,
} from '../client/src/backend_bridge/demo_import.js';
import { validateStagedData } from '../client/src/backend_bridge/import_validation.js';
import { importStagingDatabase } from '../client/src/backend_bridge/database.js';

describe('Integration: Demo Entities from Export', () => {
  let server: TestServer;

  beforeAll(() => {
    setupFetchShim();
  });

  afterAll(() => {
    restoreFetch();
  });

  it('stages bundled demo archive via POST /api/import/stage with prepackagedName: "demo"', async () => {
    server = await createTestServer();
    server.setActive();

    const stageResult = await stagePrepackagedArchive('demo');
    expect(stageResult.success).toBe(true);
    if (!stageResult.success) throw new Error(stageResult.error);

    expect(stageResult.manifest.dbUserVersion).toBeGreaterThan(0);

    // Staging database should contain the demo entities
    const mapCount = server.db.prepare('SELECT count(*) as c FROM import_staging.map').get() as {
      c: number;
    };
    expect(mapCount.c).toBeGreaterThan(0);

    const charCount = server.db.prepare('SELECT count(*) as c FROM import_staging.character').get() as {
      c: number;
    };
    expect(charCount.c).toBeGreaterThan(0);

    const scenCount = server.db.prepare('SELECT count(*) as c FROM import_staging.scenario').get() as {
      c: number;
    };
    expect(scenCount.c).toBe(1);

    const groupCount = server.db
      .prepare('SELECT count(*) as c FROM import_staging.scenario_character_group')
      .get() as { c: number };
    expect(groupCount.c).toBeGreaterThan(0);

    const scheduleCount = server.db
      .prepare('SELECT count(*) as c FROM import_staging.scenario_character_group_schedule')
      .get() as { c: number };
    expect(scheduleCount.c).toBe(groupCount.c);

    const relCount = server.db
      .prepare('SELECT count(*) as c FROM import_staging.character_relationship')
      .get() as { c: number };
    expect(relCount.c).toBeGreaterThan(0);

    const [stagedSummaries, stagedMaps, stagedChars] = await Promise.all([
      importStagingDatabase.loadScenarioSummaries(),
      importStagingDatabase.loadMaps(),
      importStagingDatabase.loadGlobalCharacters(),
    ]);
    const validationRes = await validateStagedData({
      selectedScenarioIds: stagedSummaries.map((s) => s.scenario.id),
      selectedMapIds: stagedMaps.map((m) => m.id),
      selectedGlobalCharacterIds: stagedChars.map((c) => c.id),
    });
    expect(validationRes).toEqual({ valid: true });

    await cancelImport();
  });

  it('importDemoMaps imports maps without characters when map table is empty', async () => {
    server = await createTestServer();
    server.setActive();

    // Verify main database has no maps
    const initialMapCount = server.db.prepare('SELECT count(*) as c FROM main.map').get() as { c: number };
    expect(initialMapCount.c).toBe(0);

    await importDemoMaps();

    // After importDemoMaps, maps are populated but characters and scenarios remain empty
    const mapRows = server.db.prepare('SELECT id, data FROM main.map').all() as Array<{
      id: string;
      data: string;
    }>;
    expect(mapRows.length).toBeGreaterThan(0);
    for (const row of mapRows) {
      const mapData = JSON.parse(row.data) as { name?: unknown };
      expect(typeof mapData.name).toBe('string');
      expect(String(mapData.name).length).toBeGreaterThan(0);
    }

    const charCount = server.db.prepare('SELECT count(*) as c FROM main.character').get() as { c: number };
    expect(charCount.c).toBe(0);

    const scenCount = server.db.prepare('SELECT count(*) as c FROM main.scenario').get() as { c: number };
    expect(scenCount.c).toBe(0);

    // Calling it again skips existing maps without errors or duplicates
    await importDemoMaps();
    const secondMapCount = server.db.prepare('SELECT count(*) as c FROM main.map').get() as { c: number };
    expect(secondMapCount.c).toBe(mapRows.length);
  });

  it('importDemoScenario imports demo scenario, scenario characters, cards, turn, and remaps IDs', async () => {
    server = await createTestServer();
    server.setActive();

    const { newScenarioId } = await importDemoScenario();
    expect(newScenarioId).toMatch(/^[0-9a-f]{18}$/);

    // Scenario row should exist with newly generated ID and valid map/user links
    const scenRow = server.db
      .prepare('SELECT id, data FROM main.scenario WHERE id = ?')
      .get(newScenarioId) as { id: string; data: string } | undefined;
    expect(scenRow).toBeDefined();

    const scenData = JSON.parse(scenRow!.data) as { mapId: string; userCharacterId: string };
    expect(scenData.mapId).toMatch(/^[0-9a-f]{18}$/);
    expect(scenData.userCharacterId).toMatch(/^[0-9a-f]{18}$/);

    const mapRow = server.db.prepare('SELECT id FROM main.map WHERE id = ?').get(scenData.mapId) as
      { id: string } | undefined;
    expect(mapRow).toBeDefined();

    // Scenario characters and remapped userCharacterId should exist for newScenarioId
    const scenChars = server.db
      .prepare('SELECT id, data FROM main.scenario_character WHERE scenario_id = ?')
      .all(newScenarioId) as Array<{ id: string; data: string }>;
    expect(scenChars.length).toBeGreaterThan(0);

    const userChar = scenChars.find((c) => c.id === scenData.userCharacterId);
    expect(userChar).toBeDefined();

    // Groups, schedules, and relationships should be imported for newScenarioId
    const groups = server.db
      .prepare('SELECT id FROM main.scenario_character_group WHERE scenario_id = ?')
      .all(newScenarioId);
    expect(groups.length).toBeGreaterThan(0);

    const schedules = server.db
      .prepare('SELECT id FROM main.scenario_character_group_schedule WHERE scenario_id = ?')
      .all(newScenarioId);
    expect(schedules).toHaveLength(groups.length);

    const rels = server.db
      .prepare(
        `SELECT cr.id FROM main.character_relationship cr
         JOIN main.scenario_character sc ON cr.from_id = sc.id
         WHERE sc.scenario_id = ?`
      )
      .all(newScenarioId);
    expect(rels.length).toBeGreaterThan(0);

    // Turn state key_value row must exist for scenario_<newScenarioId>_turn
    const turnRow = server.db
      .prepare('SELECT data FROM main.key_value WHERE key = ?')
      .get(`scenario_${newScenarioId}_turn`) as { data: string } | undefined;
    expect(turnRow).toBeDefined();

    // Disk character cards should be copied into scenario/<newScenarioId>/character_cards
    const scenCardDir = path.join(server.dataDir, 'scenario', newScenarioId, 'character_cards');
    expect(fs.existsSync(scenCardDir)).toBe(true);
    for (const char of scenChars) {
      const charData = JSON.parse(char.data) as { imagePath?: string };
      if (charData.imagePath) {
        const fileName = path.basename(charData.imagePath);
        expect(fs.existsSync(path.join(scenCardDir, fileName))).toBe(true);
      }
    }

    // Global characters should NOT have been imported
    const globalCount = server.db.prepare('SELECT count(*) as c FROM main.character').get() as { c: number };
    expect(globalCount.c).toBe(0);
  });

  it('importDemoGlobalCharacters installs global demo characters and copies character cards', async () => {
    server = await createTestServer();
    server.setActive();

    await importDemoGlobalCharacters();

    const globalChars = server.db.prepare('SELECT id, data FROM main.character').all() as Array<{
      id: string;
      data: string;
    }>;
    expect(globalChars.length).toBeGreaterThan(0);

    // Global character cards should exist on disk
    const globalCardDir = path.join(server.dataDir, 'character_cards');
    expect(fs.existsSync(globalCardDir)).toBe(true);

    for (const char of globalChars) {
      const cardPath = path.join(globalCardDir, `${char.id}.png`);
      expect(fs.existsSync(cardPath)).toBe(true);
    }

    // Re-running skips existing characters without duplicating
    await importDemoGlobalCharacters();
    const secondCount = server.db.prepare('SELECT count(*) as c FROM main.character').get() as { c: number };
    expect(secondCount.c).toBe(globalChars.length);
  });
});
