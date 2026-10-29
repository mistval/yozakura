import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareStagingAndBuildCommitPayload } from './importCommitPayloadBuilder.js';
import { importStagingDatabase } from '../../backend_bridge/database.js';
import type { StagedImageEntry } from '../../backend_bridge/import_api.js';

vi.mock('../../backend_bridge/database.js', () => ({
  importStagingDatabase: {
    dbRun: vi.fn(async () => {}),
  },
}));

describe('importCommitPayloadBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dummyImages: StagedImageEntry[] = [
    {
      zipPath: 'images/character_cards/char_1.png',
      kind: 'global_character_card',
    },
    {
      zipPath: 'images/character_cards/char_2.png',
      kind: 'global_character_card',
    },
    {
      zipPath: 'images/scenarios/scen_1/character_cards/scen_char_1.png',
      kind: 'scenario_character_card',
      scenarioId: 'scen_1',
    },
    {
      zipPath: 'images/scenarios/scen_1/chat_images/chat_img_1.png',
      kind: 'chat_image',
      scenarioId: 'scen_1',
    },
    {
      zipPath: 'images/scenarios/scen_2/chat_images/chat_img_2.png',
      kind: 'chat_image',
      scenarioId: 'scen_2',
    },
  ];

  it('builds commit payload for full scenario import with no conflicts', async () => {
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
    });

    expect(payload.sessionId).toBe('test-session-123');

    // Check DB queries called to populate _id_map
    expect(importStagingDatabase.dbRun).toHaveBeenCalled();

    // Verify SQL statements include map, character, scenario, scenario_character, character_relationship, groups, schedules, conversation, event_log
    const sqlText = payload.sqlStatements.join('\n');
    expect(sqlText).toContain('INSERT INTO main.map');
    expect(sqlText).toContain('INSERT INTO main.character');
    expect(sqlText).toContain('INSERT INTO main.scenario');
    expect(sqlText).toContain('INSERT INTO main.scenario_character');
    expect(sqlText).toContain('INSERT INTO main.character_relationship');
    expect(sqlText).toContain('INSERT INTO main.scenario_character_group');
    expect(sqlText).toContain('INSERT INTO main.scenario_character_group_schedule');
    expect(sqlText).toContain('INSERT INTO main.conversation');
    expect(sqlText).toContain('INSERT INTO main.conversation_participant');
    expect(sqlText).toContain('INSERT INTO main.scenario_event_log');

    // Verify image copies include char_1, scen_1 cards and chat images, but not scen_2
    expect(payload.imageCopies).toEqual([
      {
        zipPath: 'images/character_cards/char_1.png',
        targetRelPath: 'character_cards/char_1.png',
      },
      {
        zipPath: 'images/scenarios/scen_1/character_cards/scen_char_1.png',
        targetRelPath: 'scenario/scen_1/character_cards/scen_char_1.png',
      },
      {
        zipPath: 'images/scenarios/scen_1/chat_images/chat_img_1.png',
        targetRelPath: 'scenario/scen_1/chat_images/chat_img_1.png',
      },
    ]);
  });

  it('handles conflict resolutions: skips skipped entities and renames copied maps', async () => {
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
        { zipPath: 'images/character_cards/char_skip.png', kind: 'global_character_card' },
        { zipPath: 'images/character_cards/char_overwrite.png', kind: 'global_character_card' },
      ],
    });

    const sqlText = payload.sqlStatements.join('\n');
    // map_skip and char_skip should NOT be in the SQL statements
    expect(sqlText).not.toContain('map_skip');
    expect(sqlText).toContain('map_copy');
    expect(sqlText).not.toContain('char_skip');
    expect(sqlText).toContain('char_overwrite');

    // dbRun should have updated the copied map name with ' (Imported From HolidayArchive)'
    const dbRunCalls = vi.mocked(importStagingDatabase.dbRun).mock.calls;
    const nameUpdateCall = dbRunCalls.find((call) => call[0].includes("json_set(data, '$.name'"));
    expect(nameUpdateCall).toBeDefined();
    expect(nameUpdateCall![1]).toEqual([[' (Imported From HolidayArchive)'], ['["map_copy"]']]);

    // Skipped character image should not be in imageCopies
    expect(payload.imageCopies).toEqual([
      {
        zipPath: 'images/character_cards/char_overwrite.png',
        targetRelPath: 'character_cards/char_overwrite.png',
      },
    ]);
  });

  it('omits relationship and group tables and strips data when memories or groups are unchecked', async () => {
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
    });

    const sqlText = payload.sqlStatements.join('\n');
    expect(sqlText).toContain('INSERT INTO main.scenario');
    expect(sqlText).toContain('INSERT INTO main.scenario_character');
    expect(sqlText).not.toContain('INSERT INTO main.character_relationship');
    expect(sqlText).not.toContain('INSERT INTO main.scenario_character_group');

    // dbRun calls should include stripping memories and stripping groupIds
    const dbRunCalls = vi.mocked(importStagingDatabase.dbRun).mock.calls;
    const stripMemoriesCall = dbRunCalls.find((call) => call[0].includes('$.globalMemories'));
    expect(stripMemoriesCall).toBeDefined();

    const stripGroupsCall = dbRunCalls.find((call) => call[0].includes('$.groupIds'));
    expect(stripGroupsCall).toBeDefined();
  });
});
