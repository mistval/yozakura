import type Database from 'better-sqlite3';
import type { Migration } from '../types.js';

/**
 * Moves offscreen-mention RAG state out of the transcript's message stream and into a
 * structured `ragHelperState` field, matching the client's MemoryRAGHelper serialization.
 *
 * Old transcripts materialized reminders as `memory_character_rag` system messages in
 * `rawMessages`, each positioned right after the `chat_message` that triggered it and
 * carrying `{ message (content), mentionedCharacterId, isPrivateToCharacterId (= perspective) }`.
 * The client no longer stores those; it expects the helper's two maps. This migration
 * reconstructs them from the legacy messages (recovering the sender from the preceding
 * chat message), strips the legacy messages, and writes `ragHelperState`.
 *
 * Two persistence sites embed a serialized transcript:
 *  - the `conversation` table (`data.serializedTranscript`), and
 *  - the in-progress turn in `key_value` (`data.activeChat.serializedTranscript`),
 *    keyed `scenario_<id>_turn`.
 *
 * Idempotent: a transcript that already has `ragHelperState` and no legacy messages is left
 * untouched, so re-running is safe.
 */

type RawMessage = {
  id: string;
  messageType: string;
  systemMessageType?: string;
  senderId?: string;
  mentionedCharacterId?: string;
  isPrivateToCharacterId?: string;
  message?: string;
  [key: string]: unknown;
};

type SerializedTranscript = {
  rawMessages?: RawMessage[];
  ragHelperState?: unknown;
  [key: string]: unknown;
};

function cacheKey(perspectiveId: string, mentionedCharacterId: string, senderId: string): string {
  return `${perspectiveId}:${mentionedCharacterId}:${senderId}`;
}

function isLegacyRagMessage(message: RawMessage): boolean {
  return message.messageType === 'system_message' && message.systemMessageType === 'memory_character_rag';
}

/** Rewrites a serialized transcript in place. Returns whether anything changed. */
function migrateTranscript(transcript: SerializedTranscript): boolean {
  const rawMessages = transcript.rawMessages;
  if (!Array.isArray(rawMessages)) {
    return false;
  }

  const hasLegacyRagMessages = rawMessages.some(isLegacyRagMessage);

  if (transcript.ragHelperState !== undefined && !hasLegacyRagMessages) {
    return false;
  }

  const messageMentions = new Map<string, { senderId: string; mentionedCharacterIds: string[] }>();
  const ragCache = new Map<string, { mentionedCharacterId: string; content: string }>();

  let lastChatMessage: { id: string; senderId: string } | undefined;

  for (const message of rawMessages) {
    if (message.messageType === 'chat_message' && typeof message.senderId === 'string') {
      lastChatMessage = { id: message.id, senderId: message.senderId };
      continue;
    }

    if (
      isLegacyRagMessage(message) &&
      lastChatMessage &&
      typeof message.mentionedCharacterId === 'string' &&
      typeof message.isPrivateToCharacterId === 'string' &&
      typeof message.message === 'string'
    ) {
      const { id: mentioningMessageId, senderId } = lastChatMessage;
      const mentionedCharacterId = message.mentionedCharacterId;

      const mentions = messageMentions.get(mentioningMessageId) ?? { senderId, mentionedCharacterIds: [] };
      if (!mentions.mentionedCharacterIds.includes(mentionedCharacterId)) {
        mentions.mentionedCharacterIds.push(mentionedCharacterId);
      }
      messageMentions.set(mentioningMessageId, mentions);

      ragCache.set(cacheKey(message.isPrivateToCharacterId, mentionedCharacterId, senderId), {
        mentionedCharacterId,
        content: message.message,
      });
    }
  }

  transcript.rawMessages = rawMessages.filter((message) => !isLegacyRagMessage(message));
  transcript.ragHelperState = {
    messageMentions: [...messageMentions],
    ragCache: [...ragCache],
  };

  return true;
}

/**
 * Walks a table one row at a time via `ORDER BY <pk> LIMIT 1 OFFSET n` (incrementing the
 * offset), so only a single transcript blob is ever held in memory — bounded regardless of
 * how many rows exist. The migration runs inside an exclusive transaction (no concurrent
 * inserts/deletes) and only ever rewrites `data` (never the ordering key), so the row set
 * and ordering are stable across the walk and each row is visited exactly once.
 */
function migrateRowsPaged(
  db: Database.Database,
  selectOneSql: string,
  updateSql: string,
  getTranscript: (parsed: any) => SerializedTranscript | undefined
): void {
  const selectOne = db.prepare(selectOneSql);
  const update = db.prepare(updateSql);

  for (let offset = 0; ; offset += 1) {
    const row = selectOne.get(offset) as { rowKey: string; data: string } | undefined;
    if (!row) {
      break;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      continue;
    }

    const transcript = getTranscript(parsed);
    if (transcript && migrateTranscript(transcript)) {
      update.run(JSON.stringify(parsed), row.rowKey);
    }
  }
}

export const migration: Migration = {
  doMigration(db) {
    migrateRowsPaged(
      db,
      'SELECT id AS rowKey, data FROM conversation ORDER BY id LIMIT 1 OFFSET ?',
      'UPDATE conversation SET data = ? WHERE id = ?',
      (parsed) => parsed?.serializedTranscript
    );

    migrateRowsPaged(
      db,
      "SELECT key AS rowKey, data FROM key_value WHERE key LIKE 'scenario_%_turn' ORDER BY key LIMIT 1 OFFSET ?",
      'UPDATE key_value SET data = ? WHERE key = ?',
      (parsed) => parsed?.activeChat?.serializedTranscript
    );
  },
};
