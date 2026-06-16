import type { Migration } from '../types.js';

const CREATE_INITIAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS character (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z'))
  );

  CREATE TABLE IF NOT EXISTS scenario_character (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scenario_character_scenario_character
    ON scenario_character(scenario_id);

  CREATE TABLE IF NOT EXISTS scenario (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z'))
  );

  CREATE TABLE IF NOT EXISTS character_relationship (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    UNIQUE(from_id, to_id),
    FOREIGN KEY (from_id) REFERENCES scenario_character(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id) REFERENCES scenario_character(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_character_relationship_from_to
    ON character_relationship(from_id, to_id);

  CREATE INDEX IF NOT EXISTS idx_character_relationship_to_from
    ON character_relationship(to_id, from_id);

  CREATE TABLE IF NOT EXISTS conversation (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    FOREIGN KEY (scenario_id) REFERENCES scenario(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_scenario_updated_at_desc
    ON conversation(scenario_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS conversation_participant (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    UNIQUE(character_id, conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_participant_character_updated_at_desc
    ON conversation_participant(character_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_conversation_participant_conversation_character
    ON conversation_participant(conversation_id, character_id);

  CREATE TABLE IF NOT EXISTS map (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z'))
  );

  CREATE TABLE IF NOT EXISTS key_value (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z'))
  );
`;

export const migration: Migration = {
  doMigration(db) {
    db.exec(CREATE_INITIAL_SCHEMA_SQL);
  },
};
