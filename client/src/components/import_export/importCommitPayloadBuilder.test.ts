import { describe, it, expect, beforeEach } from 'vitest';
import { prepareStagingAndBuildCommitPayload } from './importCommitPayloadBuilder.js';
import { createImportStagingDatabase, type ISQLTarget } from '../../backend_bridge/database.js';
import type { StagedImageEntry } from '../../backend_bridge/import_api.js';
import type { Character } from '../../engine/types.js';

describe('importCommitPayloadBuilder', () => {
  let dbRunCalls: Array<{ statement: string; params: unknown[][] }>;
  let testSqlTarget: ISQLTarget;

  beforeEach(() => {
    dbRunCalls = [];
    testSqlTarget = {
      async dbRun(statement, parameterGroups) {
        dbRunCalls.push({ statement, params: parameterGroups });
        return {};
      },
      async dbAll() {
        return { results: [] };
      },
    };
  });

  const dummyGlobalCharacters: Character[] = [
    { id: 'char_1', imagePath: '/api/files/character_cards/custom_1.png' } as Character,
    { id: 'char_2', imagePath: '/api/files/character_cards/custom_2.png' } as Character,
    { id: 'char_skip', imagePath: '/api/files/character_cards/skip_portrait.png' } as Character,
    { id: 'char_overwrite', imagePath: '/api/files/character_cards/overwrite_portrait.png' } as Character,
  ];

  const dummyImages: StagedImageEntry[] = [
    {
      zipPath: 'character_cards/custom_1.png',
      kind: 'global_character_card',
    },
    {
      zipPath: 'character_cards/custom_2.png',
      kind: 'global_character_card',
    },
    {
      zipPath: 'scenario/scen_1/character_cards/scen_char_1.png',
      kind: 'scenario_character_card',
      scenarioId: 'scen_1',
    },
    {
      zipPath: 'scenario/scen_1/chat_images/chat_img_1.png',
      kind: 'chat_image',
      scenarioId: 'scen_1',
    },
    {
      zipPath: 'scenario/scen_2/chat_images/chat_img_2.png',
      kind: 'chat_image',
      scenarioId: 'scen_2',
    },
  ];

  it('builds commit payload for full scenario import with no conflicts', async () => {
    const stagingDb = createImportStagingDatabase(testSqlTarget);

    const payload = await prepareStagingAndBuildCommitPayload({
      sessionId: 'test-session-123',
      exportName: 'MyExport',
      selectedScenarioIds: ['scen_1'],
      selectedScenarioMemoriesIds: ['scen_1'],
      selectedScenarioGroupsIds: ['scen_1'],
      selectedMapIds: ['map_1'],
      selectedGlobalCharacterIds: ['char_1'],
      conflictResolutions: {},
      stagedImages: dummyImages,
      stagedGlobalCharacters: dummyGlobalCharacters,
      stagingDb,
    });

    expect(payload.sessionId).toBe('test-session-123');

    // Check DB queries called to populate _id_map
    expect(dbRunCalls.length).toBeGreaterThan(0);

    // Verify SQL statements include map, character, scenario, scenario_character, character_relationship, groups, schedules, conversation, turn
    const sqlText = payload.sqlStatements.map((s) => (typeof s === 'string' ? s : s.statement)).join('\n');
    expect(sqlText).toContain('INSERT INTO main.map');
    expect(sqlText).toContain('INSERT INTO main.character');
    expect(sqlText).toContain('INSERT INTO main.scenario');
    expect(sqlText).toContain('INSERT INTO main.scenario_character');
    expect(sqlText).toContain('INSERT INTO main.character_relationship');
    expect(sqlText).toContain('INSERT INTO main.scenario_character_group');
    expect(sqlText).toContain('INSERT INTO main.scenario_character_group_schedule');
    expect(sqlText).toContain('INSERT INTO main.conversation');
    expect(sqlText).toContain('INSERT INTO main.conversation_participant');
    expect(sqlText).toContain('INSERT INTO main.key_value');

    // Verify image copies include char_1, scen_1 cards and chat images, but not scen_2
    expect(payload.imageCopies).toEqual([
      {
        zipPath: 'character_cards/custom_1.png',
        targetRelPath: 'character_cards/custom_1.png',
      },
      {
        zipPath: 'scenario/scen_1/character_cards/scen_char_1.png',
        targetRelPath: 'scenario/scen_1/character_cards/scen_char_1.png',
      },
      {
        zipPath: 'scenario/scen_1/chat_images/chat_img_1.png',
        targetRelPath: 'scenario/scen_1/chat_images/chat_img_1.png',
      },
    ]);
  });

  it('handles conflict resolutions: skips skipped entities and renames copied maps', async () => {
    const stagingDb = createImportStagingDatabase(testSqlTarget);

    const payload = await prepareStagingAndBuildCommitPayload({
      sessionId: 'test-session-123',
      exportName: 'HolidayArchive',
      selectedScenarioIds: [],
      selectedScenarioMemoriesIds: [],
      selectedScenarioGroupsIds: [],
      selectedMapIds: ['map_skip', 'map_copy'],
      selectedGlobalCharacterIds: ['char_skip', 'char_overwrite'],
      conflictResolutions: {
        map_skip: 'skip',
        map_copy: 'copy',
        char_skip: 'skip',
        char_overwrite: 'overwrite',
      },
      stagedImages: [
        { zipPath: 'character_cards/skip_portrait.png', kind: 'global_character_card' },
        { zipPath: 'character_cards/overwrite_portrait.png', kind: 'global_character_card' },
      ],
      stagedGlobalCharacters: dummyGlobalCharacters,
      stagingDb,
    });

    const mapStatement = payload.sqlStatements.find(
      (s) => typeof s === 'object' && s.statement.includes('INSERT INTO main.map')
    );
    expect(mapStatement).toBeDefined();
    if (typeof mapStatement === 'object') {
      expect(mapStatement.params).toEqual([JSON.stringify(['map_copy'])]);
    }

    const charStatement = payload.sqlStatements.find(
      (s) => typeof s === 'object' && s.statement.includes('INSERT INTO main.character')
    );
    expect(charStatement).toBeDefined();
    if (typeof charStatement === 'object') {
      expect(charStatement.params).toEqual([JSON.stringify(['char_overwrite'])]);
    }

    // dbRun should have updated the copied map name with ' (Imported From HolidayArchive)'
    const nameUpdateCall = dbRunCalls.find((call) => call.statement.includes("json_set(data, '$.name'"));
    expect(nameUpdateCall).toBeDefined();
    expect(nameUpdateCall!.params).toEqual([[' (Imported From HolidayArchive)', '["map_copy"]']]);

    // Skipped character image should not be in imageCopies
    expect(payload.imageCopies).toEqual([
      {
        zipPath: 'character_cards/overwrite_portrait.png',
        targetRelPath: 'character_cards/overwrite_portrait.png',
      },
    ]);
  });

  it('omits relationship and group tables and strips data when memories or groups are unchecked', async () => {
    const stagingDb = createImportStagingDatabase(testSqlTarget);

    const payload = await prepareStagingAndBuildCommitPayload({
      sessionId: 'test-session-123',
      exportName: 'PartialExport',
      selectedScenarioIds: ['scen_1'],
      selectedScenarioMemoriesIds: [], // unchecked memories
      selectedScenarioGroupsIds: [], // unchecked groups
      selectedMapIds: [],
      selectedGlobalCharacterIds: [],
      conflictResolutions: {},
      stagedImages: [],
      stagedGlobalCharacters: dummyGlobalCharacters,
      stagingDb,
    });

    const sqlText = payload.sqlStatements.map((s) => (typeof s === 'string' ? s : s.statement)).join('\n');
    expect(sqlText).toContain('INSERT INTO main.scenario');
    expect(sqlText).toContain('INSERT INTO main.scenario_character');
    expect(sqlText).not.toContain('INSERT INTO main.character_relationship');
    expect(sqlText).not.toContain('INSERT INTO main.scenario_character_group');

    // dbRun calls should include stripping memories and stripping groupIds
    const stripMemoriesCall = dbRunCalls.find((call) => call.statement.includes('globalMemories'));
    expect(stripMemoriesCall).toBeDefined();

    const stripGroupsCall = dbRunCalls.find((call) => call.statement.includes('groupIds'));
    expect(stripGroupsCall).toBeDefined();
  });
});
