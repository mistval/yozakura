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

    expect(stageResult.manifest.dbUserVersion).toBe(8);

    // Staging database should contain the demo entities
    const mapCount = server.db.prepare('SELECT count(*) as c FROM import_staging.map').get() as {
      c: number;
    };
    expect(mapCount.c).toBe(4);

    const charCount = server.db.prepare('SELECT count(*) as c FROM import_staging.character').get() as {
      c: number;
    };
    expect(charCount.c).toBe(16);

    const scenCount = server.db.prepare('SELECT count(*) as c FROM import_staging.scenario').get() as {
      c: number;
    };
    expect(scenCount.c).toBe(1);

    const groupCount = server.db
      .prepare('SELECT count(*) as c FROM import_staging.scenario_character_group')
      .get() as { c: number };
    expect(groupCount.c).toBe(5);

    const scheduleCount = server.db
      .prepare('SELECT count(*) as c FROM import_staging.scenario_character_group_schedule')
      .get() as { c: number };
    expect(scheduleCount.c).toBe(5);

    const relCount = server.db
      .prepare('SELECT count(*) as c FROM import_staging.character_relationship')
      .get() as { c: number };
    expect(relCount.c).toBe(240);

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

    const yozakuraMap = stagedMaps.find((m) => m.id === '5d4f493e1031ae6f32');
    expect(yozakuraMap).toBeDefined();
    const expectedZoneTriggers: Record<string, string> = {
      '5d4f493e1031ae0101': 'dorm',
      '5d4f493e1031ae0102': 'dorm',
      '5d4f493e1031ae0103': 'lab',
      '5d4f493e1031ae0104': 'greenhouse',
      '5d4f493e1031ae0105': 'dueling',
      '5d4f493e1031ae0106': 'lab',
    };
    expect(yozakuraMap?.zones).toHaveLength(6);
    for (const zone of yozakuraMap?.zones ?? []) {
      const expectedTag = expectedZoneTriggers[zone.id];
      expect(expectedTag).toBeDefined();
      expect(zone.wardrobeTriggers).toEqual([
        { command: 'disable', tag: 'everyday' },
        { command: 'enable_one', tag: expectedTag },
      ]);
    }

    for (const char of stagedChars) {
      expect(char.wardrobes.length).toBeGreaterThanOrEqual(6);
      expect(char.wardrobes[0]?.enabled).toBe(true);
      expect(char.wardrobes.slice(1).every((w) => !w.enabled)).toBe(true);

      const everydayAutoselect = char.wardrobes.filter(
        (w) => w.tags.includes('daily_autoselect:default') && w.tags.includes('everyday')
      );
      expect(everydayAutoselect.length).toBeGreaterThanOrEqual(2);

      for (const wardrobe of char.wardrobes) {
        const hasDaily = wardrobe.tags.some((t) => t.startsWith('daily_autoselect:'));
        if (hasDaily) {
          expect(wardrobe.tags).toContain('everyday');
        }
      }

      for (const requiredTag of ['dueling', 'lab', 'greenhouse', 'dorm']) {
        const matching = char.wardrobes.filter((w) => w.tags.includes(requiredTag));
        expect(matching.length).toBeGreaterThanOrEqual(1);
        for (const w of matching) {
          expect(w.tags.some((t) => t.startsWith('daily_autoselect:'))).toBe(false);
        }
      }
    }

    await cancelImport();
  });

  it('importDemoMaps imports all 4 maps without characters when map table is empty', async () => {
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
    expect(mapRows).toHaveLength(4);

    const names = mapRows.map((r) => JSON.parse(r.data).name).sort();
    expect(names).toEqual(['Kingdoms', 'Oyacho Agawase', 'Paradise Island', 'Yozakura University']);

    const charCount = server.db.prepare('SELECT count(*) as c FROM main.character').get() as { c: number };
    expect(charCount.c).toBe(0);

    const scenCount = server.db.prepare('SELECT count(*) as c FROM main.scenario').get() as { c: number };
    expect(scenCount.c).toBe(0);

    // Calling it again skips existing maps without errors
    await importDemoMaps();
    const secondMapCount = server.db.prepare('SELECT count(*) as c FROM main.map').get() as { c: number };
    expect(secondMapCount.c).toBe(4);
  });

  it('importDemoScenario imports demo scenario, scenario characters, cards, turn, and remaps IDs', async () => {
    server = await createTestServer();
    server.setActive();

    const { newScenarioId } = await importDemoScenario();
    expect(newScenarioId).toMatch(/^[0-9a-f]{18}$/);

    // Scenario row should exist with newly generated ID
    const scenRow = server.db
      .prepare('SELECT id, data FROM main.scenario WHERE id = ?')
      .get(newScenarioId) as { id: string; data: string } | undefined;
    expect(scenRow).toBeDefined();

    const scenData = JSON.parse(scenRow!.data);
    expect(scenData.mapId).toBe('5d4f493e1031ae6f32'); // Yozakura University
    expect(scenData.userCharacterId).toMatch(/^[0-9a-f]{18}$/);

    // 16 Scenario characters should exist for newScenarioId
    const scenChars = server.db
      .prepare('SELECT id, data FROM main.scenario_character WHERE scenario_id = ?')
      .all(newScenarioId) as Array<{ id: string; data: string }>;
    expect(scenChars).toHaveLength(16);

    // Verify protagonist is Leo Vance
    const userChar = scenChars.find((c) => c.id === scenData.userCharacterId);
    expect(userChar).toBeDefined();
    const userCharData = JSON.parse(userChar!.data);
    expect(userCharData.firstName).toBe('Leo');
    expect(userCharData.lastName).toBe('Vance');

    // Groups, schedules, and 240 relationships should be imported for newScenarioId
    const groups = server.db
      .prepare('SELECT id FROM main.scenario_character_group WHERE scenario_id = ?')
      .all(newScenarioId);
    expect(groups).toHaveLength(5);

    const schedules = server.db
      .prepare('SELECT id FROM main.scenario_character_group_schedule WHERE scenario_id = ?')
      .all(newScenarioId);
    expect(schedules).toHaveLength(5);

    const rels = server.db
      .prepare(
        `SELECT cr.id FROM main.character_relationship cr
         JOIN main.scenario_character sc ON cr.from_id = sc.id
         WHERE sc.scenario_id = ?`
      )
      .all(newScenarioId);
    expect(rels).toHaveLength(240);

    // Turn state key_value row must exist for scenario_<newScenarioId>_turn
    const turnRow = server.db
      .prepare('SELECT data FROM main.key_value WHERE key = ?')
      .get(`scenario_${newScenarioId}_turn`) as { data: string } | undefined;
    expect(turnRow).toBeDefined();

    // Disk character cards should be copied into scenario/<newScenarioId>/character_cards
    const scenCardDir = path.join(server.dataDir, 'scenario', newScenarioId, 'character_cards');
    expect(fs.existsSync(scenCardDir)).toBe(true);
    const cardFiles = fs.readdirSync(scenCardDir);
    expect(cardFiles.length).toBe(16);

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
    expect(globalChars).toHaveLength(16);

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
    expect(secondCount.c).toBe(16);
  });
});
