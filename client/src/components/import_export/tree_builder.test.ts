import { describe, it, expect } from 'vitest';
import { buildImportExportTreeRoots } from './tree_builder.js';
import { TreeEntityIds } from '../../backend_bridge/export_payload_builder.js';
import type { ScenarioSummary, WorldMap, Character } from '../../engine/types.js';

describe('buildImportExportTreeRoots', () => {
  const dummyScenarios: ScenarioSummary[] = [
    {
      mapId: 'map_1',
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

  it('builds tree roots correctly for scenarios, maps, and characters', async () => {
    const roots = buildImportExportTreeRoots({
      scenarios: dummyScenarios,
      maps: dummyMaps,
      globalCharacters: dummyCharacters,
    });

    expect(roots).toHaveLength(3);
    expect(roots.map((r) => r.id)).toEqual([
      TreeEntityIds.rootScenarios(),
      TreeEntityIds.rootMaps(),
      TreeEntityIds.rootCharacters(),
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
  });

  it('builds import tree roots filtering empty sections', async () => {
    const roots = buildImportExportTreeRoots({
      scenarios: [],
      maps: dummyMaps,
      globalCharacters: [],
    });

    expect(roots).toHaveLength(1);
    expect(roots[0]!.id).toBe(TreeEntityIds.rootMaps());
    expect(roots[0]!.subtitle).toBe('(1 available)');
  });

  it('omits Map child node under scenario when the map is not present in maps', async () => {
    const roots = buildImportExportTreeRoots({
      scenarios: dummyScenarios,
      maps: [],
      globalCharacters: [],
    });

    const scenChildren = await roots[0]!.getChildren!();
    const scenSubChildren = await scenChildren[0]!.getChildren!();
    expect(scenSubChildren.map((c) => c.id)).not.toContain(
      TreeEntityIds.scenarioMap('scen_1', 'map_1')
    );
  });
});
