import { describe, it, expect } from 'vitest';
import { DatabaseClient, mainDatabase, importStagingDatabase } from './database.js';

describe('DatabaseClient', () => {
  it('correctly qualifies table names with the assigned schema', () => {
    const mainClient = new DatabaseClient('main');
    const stagingClient = new DatabaseClient('import_staging');

    expect(mainClient.targetSchema).toBe('main');
    expect(stagingClient.targetSchema).toBe('import_staging');

    expect(mainClient.sql.table('scenario')).toBe('main.scenario');
    expect(stagingClient.sql.table('scenario')).toBe('import_staging.scenario');

    expect(mainClient.sql.SELECT_ALL_MAPS_SQL).toContain('main.map');
    expect(stagingClient.sql.SELECT_ALL_MAPS_SQL).toContain('import_staging.map');

    expect(mainClient.sql.SELECT_ALL_CHARACTERS_SQL).toContain('main.character');
    expect(stagingClient.sql.SELECT_ALL_CHARACTERS_SQL).toContain('import_staging.character');
  });

  it('exports singleton instances for mainDatabase and importStagingDatabase', () => {
    expect(mainDatabase).toBeInstanceOf(DatabaseClient);
    expect(mainDatabase.targetSchema).toBe('main');

    expect(importStagingDatabase).toBeInstanceOf(DatabaseClient);
    expect(importStagingDatabase.targetSchema).toBe('import_staging');
  });
});
