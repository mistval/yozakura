import { describe, it, expect } from 'vitest';
import { buildImportExportTreeRoots } from './treeBuilder.js';
import { TreeEntityIds } from './exportPayloadBuilder.js';
import type { ScenarioSummary, WorldMap, Character } from '../../engine/types.js';
import {
  RUNTIME_CHAT_TEMPLATES_GROUP_ID,
  type TemplateGroupData,
} from '../../engine/prompt_templates/template_types.js';

describe('buildImportExportTreeRoots', () => {
  const dummyScenarios: ScenarioSummary[] = [
    {
      scenario: {
        id: 'scen_1',
        mapId: 'map_1',
        turnNumber: 5,
      } as any,
      userCharacterName: 'Alice',
      mapName: 'Test Town',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const dummyMaps: WorldMap[] = [
    {
      id: 'map_1',
      name: 'Test Town',
      locations: [{ id: 'loc_1' } as any],
      zones: [{ id: 'zone_1' } as any],
    } as any,
  ];

  const dummyCharacters: Character[] = [
    {
      id: 'char_1',
      firstName: 'Bob',
      lastName: 'Smith',
      internalDescription: 'A helpful NPC',
      imagePath: '/api/files/character_cards/bob.png',
    } as any,
  ];

  it('builds export tree roots correctly with custom prompt templates', async () => {
    const templateGroupData: TemplateGroupData = {
      [RUNTIME_CHAT_TEMPLATES_GROUP_ID]: {
        templateChains: {
          gen_npc_response: {
            title: 'Custom Title',
            description: 'Custom description',
            prompts: [],
          } as any,
        },
      },
    };

    const roots = buildImportExportTreeRoots({
      mode: 'export',
      scenarios: dummyScenarios,
      maps: dummyMaps,
      globalCharacters: dummyCharacters,
      templateGroupData,
    });

    expect(roots).toHaveLength(4);
    expect(roots.map((r) => r.id)).toEqual([
      TreeEntityIds.rootScenarios(),
      TreeEntityIds.rootMaps(),
      TreeEntityIds.rootCharacters(),
      TreeEntityIds.rootSettings(),
    ]);

    expect(roots[0]!.subtitle).toBe('(1 available)');
    expect(roots[1]!.subtitle).toBe('(1 available)');
    expect(roots[2]!.subtitle).toBe('(1 available)');

    // Test scenario children
    const scenChildren = await roots[0]!.getChildren!();
    expect(scenChildren).toHaveLength(1);
    expect(scenChildren[0]!.id).toBe(TreeEntityIds.scenario('scen_1'));
    expect(scenChildren[0]!.label).toBe('Alice on Test Town');

    const scenSubChildren = await scenChildren[0]!.getChildren!();
    expect(scenSubChildren.map((c) => c.id)).toEqual([
      TreeEntityIds.scenarioMap('scen_1', 'map_1'),
      TreeEntityIds.scenarioCharacters('scen_1'),
      TreeEntityIds.scenarioGroups('scen_1'),
      TreeEntityIds.scenarioSchedules('scen_1'),
      TreeEntityIds.scenarioMemories('scen_1'),
      TreeEntityIds.scenarioConversations('scen_1'),
      TreeEntityIds.scenarioTurn('scen_1'),
    ]);

    // Test maps children
    const mapChildren = await roots[1]!.getChildren!();
    expect(mapChildren[0]!.id).toBe(TreeEntityIds.map('map_1'));
    expect(mapChildren[0]!.label).toBe('Test Town');

    // Test character children
    const charChildren = await roots[2]!.getChildren!();
    expect(charChildren[0]!.id).toBe(TreeEntityIds.character('char_1'));
    expect(charChildren[0]!.label).toBe('Bob Smith');

    // Test prompt templates
    const settingsChildren = await roots[3]!.getChildren!();
    expect(settingsChildren[0]!.id).toBe(TreeEntityIds.rootPromptTemplates());
    const groupChildren = await settingsChildren[0]!.getChildren!();
    expect(groupChildren[0]!.id).toBe(TreeEntityIds.promptGroup(RUNTIME_CHAT_TEMPLATES_GROUP_ID));
    const chainChildren = await groupChildren[0]!.getChildren!();
    expect(chainChildren[0]!.id).toBe(TreeEntityIds.promptChain('gen_npc_response'));
  });

  it('omits prompt templates in export mode if none are modified', () => {
    const roots = buildImportExportTreeRoots({
      mode: 'export',
      scenarios: dummyScenarios,
      maps: dummyMaps,
      globalCharacters: dummyCharacters,
      templateGroupData: {},
    });

    expect(roots).toHaveLength(3);
    expect(roots.map((r) => r.id)).toEqual([
      TreeEntityIds.rootScenarios(),
      TreeEntityIds.rootMaps(),
      TreeEntityIds.rootCharacters(),
    ]);
  });

  it('builds import tree roots filtering empty sections', async () => {
    const roots = buildImportExportTreeRoots({
      mode: 'import',
      scenarios: [],
      maps: dummyMaps,
      globalCharacters: [],
      templateGroupData: {},
    });

    expect(roots).toHaveLength(1);
    expect(roots[0]!.id).toBe(TreeEntityIds.rootMaps());
    expect(roots[0]!.subtitle).toBe('(1 in archive)');
  });
});
