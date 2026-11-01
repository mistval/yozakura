import { describe, it, expect } from 'vitest';
import {
  TABLE_COLUMNS,
  buildTableExportQueries,
  buildScenarioExportQuery,
  buildScenarioCharacterExportQueries,
  buildCharacterRelationshipExportQuery,
  buildScenarioGroupExportQuery,
  buildScenarioGroupScheduleExportQuery,
  buildConversationExportQueries,
  buildTurnKeyValueExportQuery,
  buildMapExportQuery,
  buildGlobalCharacterExportQuery,
} from './export_queries.js';

describe('export_queries', () => {
  it('defines correct column lists for all exported tables', () => {
    expect(TABLE_COLUMNS.scenario).toContain('id');
    expect(TABLE_COLUMNS.scenario).toContain('data');
    expect(TABLE_COLUMNS.scenario_character).toContain('scenario_id');
    expect(TABLE_COLUMNS.map).toContain('data');
    expect(TABLE_COLUMNS.character).toContain('data');
  });

  it('buildScenarioExportQuery returns undefined when empty and valid query when populated', () => {
    expect(buildScenarioExportQuery([])).toBeUndefined();
    const query = buildScenarioExportQuery(['scen_1']);
    expect(query?.table).toBe('scenario');
    expect(query?.statement).toContain('FROM scenario');
    expect(query?.params).toEqual([JSON.stringify(['scen_1'])]);
  });

  it('buildScenarioCharacterExportQueries handles full and patched variants', () => {
    const queries = buildScenarioCharacterExportQueries({
      fullScenarioIds: ['scen_full'],
      stripMemoriesScenarioIds: ['scen_mem'],
      stripGroupsScenarioIds: ['scen_grp'],
      stripBothScenarioIds: ['scen_both'],
    });

    expect(queries).toHaveLength(4);
    expect(queries[0]?.statement).not.toContain('json_patch');
    expect(queries[1]?.statement).toContain('json_patch');
    expect(queries[2]?.statement).toContain('json_patch');
    expect(queries[3]?.statement).toContain('json_patch');
  });

  it('individual builders return undefined or empty when passed empty inputs', () => {
    expect(buildCharacterRelationshipExportQuery([])).toBeUndefined();
    expect(buildScenarioGroupExportQuery([])).toBeUndefined();
    expect(buildScenarioGroupScheduleExportQuery([])).toBeUndefined();
    expect(buildConversationExportQueries([])).toEqual([]);
    expect(buildTurnKeyValueExportQuery([])).toBeUndefined();
    expect(buildMapExportQuery([])).toBeUndefined();
    expect(buildGlobalCharacterExportQuery([])).toBeUndefined();
  });

  it('individual builders build valid query objects for non-empty inputs', () => {
    expect(buildCharacterRelationshipExportQuery(['scen_1'])?.table).toBe('character_relationship');
    expect(buildScenarioGroupExportQuery(['scen_1'])?.table).toBe('scenario_character_group');
    expect(buildScenarioGroupScheduleExportQuery(['scen_1'])?.table).toBe(
      'scenario_character_group_schedule'
    );
    expect(buildConversationExportQueries(['scen_1']).map((q) => q.table)).toEqual([
      'conversation',
      'conversation_participant',
    ]);
    expect(buildTurnKeyValueExportQuery(['k1'])?.table).toBe('key_value');
    expect(buildMapExportQuery(['map_1'])?.table).toBe('map');
    expect(buildGlobalCharacterExportQuery(['char_1'])?.table).toBe('character');
  });

  it('buildTableExportQueries aggregates all non-empty table queries', () => {
    const queries = buildTableExportQueries({
      selectedScenarioIds: ['scen_1'],
      characterPartition: {
        fullScenarioIds: ['scen_1'],
        stripMemoriesScenarioIds: [],
        stripGroupsScenarioIds: [],
        stripBothScenarioIds: [],
      },
      scenariosWithMemories: ['scen_1'],
      scenariosWithGroups: ['scen_1'],
      scenariosWithSchedules: ['scen_1'],
      scenariosWithConversations: ['scen_1'],
      turnKeys: ['scenario_scen_1_turn'],
      selectedMapIds: ['map_1'],
      selectedGlobalCharacterIds: ['char_1'],
    });

    const tables = queries.map((q) => q.table);
    expect(tables).toContain('scenario');
    expect(tables).toContain('scenario_character');
    expect(tables).toContain('character_relationship');
    expect(tables).toContain('scenario_character_group');
    expect(tables).toContain('scenario_character_group_schedule');
    expect(tables).toContain('conversation');
    expect(tables).toContain('conversation_participant');
    expect(tables).toContain('key_value');
    expect(tables).toContain('map');
    expect(tables).toContain('character');
  });
});
