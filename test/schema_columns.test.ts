import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, type TestServer } from './harness.js';
import { TABLE_COLUMNS } from '../client/src/components/import_export/importExportCommon.js';

describe('Integration: Schema Columns & Drift Guard', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  const EXCLUDED_TABLES: Record<string, string> = {
    scenario_event_log: 'Ephemeral runtime character movement and event log; intentionally not exported',
    user_text_files: 'Global user scripts/files created in migration 0002; intentionally not exported',
  };

  it('every table in TABLE_COLUMNS matches PRAGMA table_info exactly', () => {
    for (const [tableName, expectedCols] of Object.entries(TABLE_COLUMNS)) {
      const rows = server.db.pragma(`table_info("${tableName}")`) as Array<{ name: string }>;
      const actualCols = rows.map((r) => r.name);
      expect(actualCols, `Columns for table "${tableName}" should match TABLE_COLUMNS`).toEqual(
        expect.arrayContaining([...expectedCols])
      );
      expect(expectedCols, `TABLE_COLUMNS for table "${tableName}" should match DB columns`).toEqual(
        expect.arrayContaining(actualCols)
      );
    }
  });

  it('every user table in SQLite is either in TABLE_COLUMNS or in EXCLUDED_TABLES', () => {
    const tableRows = server.db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const allTableNames = tableRows.map((r) => r.name);

    for (const tableName of allTableNames) {
      const isExported = tableName in TABLE_COLUMNS;
      const isExcluded = tableName in EXCLUDED_TABLES;

      expect(
        isExported || isExcluded,
        `Table "${tableName}" is not listed in TABLE_COLUMNS or EXCLUDED_TABLES. If newly added, update TABLE_COLUMNS or EXCLUDED_TABLES.`
      ).toBe(true);
    }
  });
});
