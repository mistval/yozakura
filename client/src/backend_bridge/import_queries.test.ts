import { describe, it, expect, beforeEach } from 'vitest';
import {
  prepareImportStaging,
  buildMapCommitStatement,
  buildGlobalCharacterCommitStatement,
  buildScenarioCommitStatement,
  buildScenarioCharacterCommitStatement,
  buildCharacterRelationshipCommitStatement,
  buildScenarioGroupCommitStatement,
  buildScenarioGroupScheduleCommitStatement,
  buildConversationCommitStatements,
  buildTurnKeyValueCommitStatement,
  buildImportCommitStatements,
} from './import_queries.js';
import { createImportStagingDatabase, type ISQLTarget } from './database.js';

describe('import_queries', () => {
  let dbRunCalls: Array<{ statement: string; params: unknown[][] }>;
  let testSqlTarget: ISQLTarget;

  beforeEach(() => {
    dbRunCalls = [];
    testSqlTarget = {
      async dbRun(statement, parameterGroups) {
        dbRunCalls.push({ statement, params: parameterGroups });
        return {};
      },
      async dbAll(statement) {
        if (statement.includes('import_staging._id_map')) {
          return {
            results: [[{ old_id: 'char_copy', new_id: 'new_hex_123' }]],
          };
        }
        return { results: [] };
      },
    };
  });

  describe('prepareImportStaging', () => {
    it('creates _id_map and runs all staging queries', async () => {
      const db = createImportStagingDatabase(testSqlTarget);

      const mapping = await prepareImportStaging({
        db,
        exportName: 'MyExport',
        selectedScenarioIds: ['scen_1'],
        selectedScenarioMemoriesIds: [], // unchecked memories -> should strip
        selectedScenarioGroupsIds: [], // unchecked groups -> should strip
        copiedMapIds: ['map_1'],
        copiedGlobalCharIds: ['char_copy'],
      });

      expect(mapping.get('char_copy')).toBe('new_hex_123');

      // Check _id_map creation and clearing
      expect(dbRunCalls.some((c) => c.statement.includes('CREATE TABLE IF NOT EXISTS import_staging._id_map'))).toBe(true);
      expect(dbRunCalls.some((c) => c.statement.includes('DELETE FROM import_staging._id_map'))).toBe(true);

      // Check scenario scoped tables
      expect(dbRunCalls.some((c) => c.statement.includes('FROM import_staging.scenario_character'))).toBe(true);

      // Check copied map handling
      expect(dbRunCalls.some((c) => c.statement.includes('FROM import_staging.map'))).toBe(true);
      expect(dbRunCalls.some((c) => c.statement.includes("json_set(data, '$.name'"))).toBe(true);

      // Check copied character handling
      expect(dbRunCalls.some((c) => c.statement.includes('FROM import_staging.character'))).toBe(true);
      expect(dbRunCalls.some((c) => c.statement.includes("json_set(data, '$.firstName'"))).toBe(true);

      // Check stripping
      expect(dbRunCalls.some((c) => c.statement.includes('globalMemories'))).toBe(true);
      expect(dbRunCalls.some((c) => c.statement.includes('groupIds'))).toBe(true);
    });
  });

  describe('individual commit statement builders', () => {
    it('returns undefined or empty array for empty inputs', () => {
      expect(buildMapCommitStatement([])).toBeUndefined();
      expect(buildGlobalCharacterCommitStatement([])).toBeUndefined();
      expect(buildScenarioCommitStatement([], [])).toBeUndefined();
      expect(buildScenarioCharacterCommitStatement([])).toBeUndefined();
      expect(buildCharacterRelationshipCommitStatement([])).toBeUndefined();
      expect(buildScenarioGroupCommitStatement([])).toBeUndefined();
      expect(buildScenarioGroupScheduleCommitStatement([])).toBeUndefined();
      expect(buildConversationCommitStatements([])).toEqual([]);
      expect(buildTurnKeyValueCommitStatement([])).toBeUndefined();
    });

    it('builds valid commit statements for non-empty inputs', () => {
      const mapStmt = buildMapCommitStatement(['map_1']);
      expect(typeof mapStmt === 'object' && mapStmt.statement).toContain('INSERT INTO main.map');

      const charStmt = buildGlobalCharacterCommitStatement(['char_1']);
      expect(typeof charStmt === 'object' && charStmt.statement).toContain('INSERT INTO main.character');

      const scenStmt = buildScenarioCommitStatement(['scen_1'], ['scen_1']);
      expect(typeof scenStmt === 'object' && scenStmt.statement).toContain('INSERT INTO main.scenario');

      const scenCharStmt = buildScenarioCharacterCommitStatement(['scen_1']);
      expect(typeof scenCharStmt === 'object' && scenCharStmt.statement).toContain('INSERT INTO main.scenario_character');

      const relStmt = buildCharacterRelationshipCommitStatement(['scen_1']);
      expect(typeof relStmt === 'object' && relStmt.statement).toContain('INSERT INTO main.character_relationship');

      const grpStmt = buildScenarioGroupCommitStatement(['scen_1']);
      expect(typeof grpStmt === 'object' && grpStmt.statement).toContain('INSERT INTO main.scenario_character_group');

      const schedStmt = buildScenarioGroupScheduleCommitStatement(['scen_1']);
      expect(typeof schedStmt === 'object' && schedStmt.statement).toContain('INSERT INTO main.scenario_character_group_schedule');

      const convStmts = buildConversationCommitStatements(['scen_1']);
      expect(convStmts).toHaveLength(2);
      expect(typeof convStmts[0] === 'object' && convStmts[0].statement).toContain('INSERT INTO main.conversation');
      expect(typeof convStmts[1] === 'object' && convStmts[1].statement).toContain('INSERT INTO main.conversation_participant');

      const turnStmt = buildTurnKeyValueCommitStatement(['scen_1']);
      expect(typeof turnStmt === 'object' && turnStmt.statement).toContain('INSERT INTO main.key_value');
    });
  });

  describe('buildImportCommitStatements', () => {
    it('aggregates all statements when all entity categories are active', () => {
      const stmts = buildImportCommitStatements({
        activeMapIds: ['map_1'],
        activeGlobalCharIds: ['char_1'],
        selectedScenarioIds: ['scen_1'],
        selectedScenarioCharactersIds: ['scen_1'],
        effectiveMemoriesScenIds: ['scen_1'],
        selectedScenarioGroupsIds: ['scen_1'],
        effectiveSchedulesScenIds: ['scen_1'],
        selectedScenarioConversationsIds: ['scen_1'],
        effectiveTurnScenIds: ['scen_1'],
      });

      expect(stmts).toHaveLength(10);
      const text = stmts.map((s) => (typeof s === 'string' ? s : s.statement)).join('\n');
      expect(text).toContain('INSERT INTO main.map');
      expect(text).toContain('INSERT INTO main.character');
      expect(text).toContain('INSERT INTO main.scenario');
      expect(text).toContain('INSERT INTO main.scenario_character');
      expect(text).toContain('INSERT INTO main.character_relationship');
      expect(text).toContain('INSERT INTO main.scenario_character_group');
      expect(text).toContain('INSERT INTO main.scenario_character_group_schedule');
      expect(text).toContain('INSERT INTO main.conversation');
      expect(text).toContain('INSERT INTO main.conversation_participant');
      expect(text).toContain('INSERT INTO main.key_value');
    });
  });
});

