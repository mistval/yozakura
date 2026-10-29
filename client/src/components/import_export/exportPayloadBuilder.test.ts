import { describe, it, expect } from 'vitest';
import { buildExportPayload, sanitizeExportFilename, TreeEntityIds } from './exportPayloadBuilder.js';
import type { ScenarioSummary, WorldMap, Character } from '../../engine/types.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';

describe('exportPayloadBuilder', () => {
  const dummyScenario: ScenarioSummary = {
    scenario: {
      id: 'scen_001',
      mapId: 'map_001',
      userCharacterId: 'char_001',
      turnNumber: 5,
      temporalContext: { selectedScriptId: 'default', controlValues: {} },
      createdAt: '2026-10-29T10:00:00Z',
      updatedAt: '2026-10-29T12:00:00Z',
    },
    mapName: 'Sunny Vale',
    userCharacterName: 'Alice',
    createdAt: '2026-10-29T10:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
  };

  const dummyMap: WorldMap = {
    id: 'map_001',
    name: 'Sunny Vale',
    description: 'A quiet valley',
    locations: [],
    zones: [],
    createdAt: '2026-10-29T10:00:00Z',
    updatedAt: '2026-10-29T10:00:00Z',
  };

  const dummyGlobalCharCustom: Character = {
    id: 'char_001',
    globalCharacterId: 'char_001',
    scenarioId: '',
    firstName: 'Custom',
    lastName: 'Hero',
    internalDescription: 'A custom hero',
    externalDescription: 'Tall and strong',
    baseAppearanceTags: 'armor',
    wardrobes: [],
    globalMemories: '',
    locationId: '',
    nextConversationWithCharacterId: '',
    exampleDialogue: '',
    rollingConversationSummaries: [],
    groupIds: [],
    imagePath: '/api/files/character_cards/custom.png?v=123',
    createdAt: '2026-10-29T10:00:00Z',
    updatedAt: '2026-10-29T10:00:00Z',
  };

  const dummyGlobalCharBuiltin: Character = {
    id: 'char_002',
    globalCharacterId: 'char_002',
    scenarioId: '',
    firstName: 'Builtin',
    lastName: 'Char',
    internalDescription: 'A demo character',
    externalDescription: 'Calm expression',
    baseAppearanceTags: 'casual',
    wardrobes: [],
    globalMemories: '',
    locationId: '',
    nextConversationWithCharacterId: '',
    exampleDialogue: '',
    rollingConversationSummaries: [],
    groupIds: [],
    imagePath: '/images/character/demo-alice.png',
    createdAt: '2026-10-29T10:00:00Z',
    updatedAt: '2026-10-29T10:00:00Z',
  };

  const dummyTemplateGroups: TemplateGroupData = {
    chat_group: {
      templateChains: {
        chain_1: {
          title: 'Chain 1',
          description: 'First chain',
          parserSource: 'console.log("hello");',
          templates: {
            t1: {
              name: 'T1',
              description: 'Template 1',
              role: 'user',
              templateString: 'Hello {{name}}',
            },
          },
        },
        chain_2: {
          title: 'Chain 2',
          description: 'Second chain',
          templates: {},
        },
      },
    },
  };

  it('sanitizes export filename and guarantees .yozakura_export.zip extension', () => {
    expect(sanitizeExportFilename('My Export')).toBe('My Export.yozakura_export.zip');
    expect(sanitizeExportFilename('Invalid/Name:Test*')).toBe('Invalid_Name_Test_.yozakura_export.zip');
    expect(sanitizeExportFilename('already_named.yozakura_export.zip')).toBe(
      'already_named.yozakura_export.zip'
    );
    expect(sanitizeExportFilename('')).toBe('export.yozakura_export.zip');
  });

  it('builds queries without json_patch when both Memories and Groups are selected', () => {
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario('scen_001'),
      TreeEntityIds.scenarioCharacters('scen_001'),
      TreeEntityIds.scenarioMemories('scen_001'),
      TreeEntityIds.scenarioGroups('scen_001'),
      TreeEntityIds.scenarioSchedules('scen_001'),
    ]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [dummyScenario],
      maps: [dummyMap],
      globalCharacters: [dummyGlobalCharCustom],
      templateGroupData: dummyTemplateGroups,
    });

    const charQuery = payload.queries.find((q) => q.table === 'scenario_character');
    expect(charQuery).toBeDefined();
    expect(charQuery?.statement).not.toContain('json_patch');
    expect(charQuery?.statement).toContain('IN (SELECT value FROM json_each(?))');
    expect(charQuery?.params).toEqual([JSON.stringify(['scen_001'])]);

    expect(payload.queries.some((q) => q.table === 'character_relationship')).toBe(true);
    expect(payload.queries.some((q) => q.table === 'scenario_character_group')).toBe(true);
    expect(payload.queries.some((q) => q.table === 'scenario_character_group_schedule')).toBe(true);
  });

  it('applies json_patch to strip memories when Memories is unselected', () => {
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario('scen_001'),
      TreeEntityIds.scenarioCharacters('scen_001'),
      TreeEntityIds.scenarioGroups('scen_001'),
      // TreeEntityIds.scenarioMemories('scen_001') is omitted!
    ]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [dummyScenario],
      maps: [],
      globalCharacters: [],
      templateGroupData: {},
    });

    const charQuery = payload.queries.find((q) => q.table === 'scenario_character');
    expect(charQuery).toBeDefined();
    expect(charQuery?.statement).toContain('json_patch(data, ?)');
    expect(charQuery?.statement).toContain('IN (SELECT value FROM json_each(?))');
    expect(charQuery?.params[0]).toContain('"globalMemories":""');
    expect(charQuery?.params[0]).not.toContain('"groupIds":[]');
    expect(charQuery?.params[1]).toEqual(JSON.stringify(['scen_001']));

    expect(payload.queries.some((q) => q.table === 'character_relationship')).toBe(false);
  });

  it('applies json_patch to strip groupIds when Groups is unselected', () => {
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario('scen_001'),
      TreeEntityIds.scenarioCharacters('scen_001'),
      TreeEntityIds.scenarioMemories('scen_001'),
      // TreeEntityIds.scenarioGroups('scen_001') is omitted!
    ]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [dummyScenario],
      maps: [],
      globalCharacters: [],
      templateGroupData: {},
    });

    const charQuery = payload.queries.find((q) => q.table === 'scenario_character');
    expect(charQuery).toBeDefined();
    expect(charQuery?.statement).toContain('json_patch(data, ?)');
    expect(charQuery?.statement).toContain('IN (SELECT value FROM json_each(?))');
    expect(charQuery?.params[0]).toContain('"groupIds":[]');
    expect(charQuery?.params[0]).not.toContain('"globalMemories":""');
    expect(charQuery?.params[1]).toEqual(JSON.stringify(['scen_001']));

    expect(payload.queries.some((q) => q.table === 'scenario_character_group')).toBe(false);
  });

  it('applies json_patch to strip both memories and groups when both are unselected', () => {
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario('scen_001'),
      TreeEntityIds.scenarioCharacters('scen_001'),
      // memories and groups both omitted!
    ]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [dummyScenario],
      maps: [],
      globalCharacters: [],
      templateGroupData: {},
    });

    const charQuery = payload.queries.find((q) => q.table === 'scenario_character');
    expect(charQuery).toBeDefined();
    expect(charQuery?.statement).toContain('json_patch(data, ?)');
    expect(charQuery?.statement).toContain('IN (SELECT value FROM json_each(?))');
    expect(charQuery?.params[0]).toContain('"globalMemories":""');
    expect(charQuery?.params[0]).toContain('"groupIds":[]');
    expect(charQuery?.params[1]).toEqual(JSON.stringify(['scen_001']));
  });

  it('orders scenario_event_log by rowid ASC and extracts turn key_value via json_each', () => {
    const selectedIds = new Set<string>([
      TreeEntityIds.scenario('scen_001'),
      TreeEntityIds.scenarioEventLogs('scen_001'),
      TreeEntityIds.scenarioTurn('scen_001'),
    ]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [dummyScenario],
      maps: [],
      globalCharacters: [],
      templateGroupData: {},
    });

    const eventQuery = payload.queries.find((q) => q.table === 'scenario_event_log');
    expect(eventQuery?.statement).toContain('ORDER BY rowid ASC');
    expect(eventQuery?.statement).toContain('IN (SELECT value FROM json_each(?))');
    expect(eventQuery?.params).toEqual([JSON.stringify(['scen_001'])]);

    const kvQuery = payload.queries.find((q) => q.table === 'key_value');
    expect(kvQuery?.statement).toContain('IN (SELECT value FROM json_each(?))');
    expect(kvQuery?.params).toEqual([JSON.stringify(['scenario_scen_001_turn'])]);
  });

  it('includes custom character card images while skipping built-in static portraits', () => {
    const selectedIds = new Set<string>([
      TreeEntityIds.character('char_001'),
      TreeEntityIds.character('char_002'),
    ]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [],
      maps: [],
      globalCharacters: [dummyGlobalCharCustom, dummyGlobalCharBuiltin],
      templateGroupData: {},
    });

    expect(payload.imageDescriptors).toEqual([
      {
        mode: 'file',
        sourceRelPath: 'character_cards/custom.png',
        kind: 'global_character_card',
      },
    ]);
  });

  it('serializes only selected template chains into prebuilt settings row', () => {
    const selectedIds = new Set<string>([TreeEntityIds.promptChain('chain_1')]);

    const payload = buildExportPayload({
      exportName: 'Test Pack',
      selectedIds,
      scenarios: [],
      maps: [],
      globalCharacters: [],
      templateGroupData: dummyTemplateGroups,
    });

    expect(payload.prebuiltRows.length).toBe(1);
    const settingsRow = payload.prebuiltRows[0]!;
    expect(settingsRow.table).toBe('key_value');
    expect(settingsRow.row.key).toBe('settings');

    const parsedData = JSON.parse(settingsRow.row.data as string);
    expect(parsedData.templateGroupData.chat_group.templateChains.chain_1).toBeDefined();
    expect(parsedData.templateGroupData.chat_group.templateChains.chain_2).toBeUndefined();
  });
});
