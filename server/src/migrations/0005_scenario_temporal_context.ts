import type { Migration } from '../types.js';

/**
 * Backfills the per-scenario temporal context configuration onto existing scenario
 * blobs. New scenarios get this set at creation time; existing ones default to the
 * built-in "New York" calendar starting on the scenario's own creation date.
 */
const BACKFILL_SQL = `
  UPDATE scenario
  SET data = json_set(
    data,
    '$.temporalContext',
    json_object(
      'selectedScriptId', 'new-york',
      'controlValues', json_object(
        'new-york', json_object('startDate', substr(created_at, 1, 10))
      )
    )
  )
  WHERE json_extract(data, '$.temporalContext') IS NULL;
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(BACKFILL_SQL);
  },
};
