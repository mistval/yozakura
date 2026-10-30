import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { startServer } from '../server/src/app.js';
import type { ExportPayload } from '../client/src/components/import_export/exportPayloadBuilder.js';

let activeServerUrl: string | null = null;
const originalFetch = globalThis.fetch;

export function setupFetchShim() {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      if (!activeServerUrl) {
        throw new Error(`Fetch called with relative URL "${input}" but no test server is active`);
      }
      return originalFetch(`${activeServerUrl}${input}`, init);
    }
    if (input instanceof URL && input.href.startsWith('/')) {
      if (!activeServerUrl) {
        throw new Error(`Fetch called with relative URL "${input.href}" but no test server is active`);
      }
      return originalFetch(new URL(input.href, activeServerUrl), init);
    }
    return originalFetch(input, init);
  };
}

export function restoreFetch() {
  globalThis.fetch = originalFetch;
  activeServerUrl = null;
}

export type TestServer = {
  dataDir: string;
  port: number;
  baseUrl: string;
  db: Database.Database;
  close: () => Promise<void>;
  setActive: () => void;
};

export async function createTestServer(): Promise<TestServer> {
  const tempDir = path.join(os.tmpdir(), `yozakura-test-${crypto.randomBytes(8).toString('hex')}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const {
    server,
    close: serverClose,
    db,
  } = startServer({
    dataDir: tempDir,
    port: 0,
  });

  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', resolve);
    }
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  activeServerUrl = baseUrl;

  const setActive = () => {
    activeServerUrl = baseUrl;
  };

  const close = async () => {
    if (activeServerUrl === baseUrl) {
      activeServerUrl = null;
    }
    if (server.listening) {
      await serverClose();
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  };

  return { dataDir: tempDir, port, baseUrl, db, close, setActive };
}

export type SeededScenarioData = {
  scenarioId: string;
  mapId: string;
  globalCharId: string;
  scenarioChar1Id: string;
  scenarioChar2Id: string;
  groupId: string;
  scheduleId: string;
  relId: string;
  convId: string;
  part1Id: string;
  part2Id: string;
  eventLogIds: string[];
};

export function seedCompleteScenario(db: Database.Database, dataDir: string): SeededScenarioData {
  const scenarioId = '0123456789abcdef01';
  const mapId = '0123456789abcdef10';
  const globalCharId = '0123456789abcdef20';
  const scenarioChar1Id = '0123456789abcdef30';
  const scenarioChar2Id = '0123456789abcdef40';
  const groupId = '0123456789abcdef50';
  const scheduleId = '0123456789abcdef60';
  const relId = '0123456789abcdef70';
  const convId = '0123456789abcdef80';
  const part1Id = '0123456789abcdef81';
  const part2Id = '0123456789abcdef82';
  const eventLogIds = ['0123456789abcdef91', '0123456789abcdef92'];

  const now = new Date().toISOString();

  // 1. Global Map
  const mapData = {
    id: mapId,
    name: 'Capital City',
    description: 'A bustling fantasy capital',
    imageUrl: '',
    imagePath: '',
    locations: [
      {
        id: '0123456789abcdef11',
        name: 'Town Square',
        description: 'Center of town',
        adjacency: ['0123456789abcdef12'],
        isEphemeral: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '0123456789abcdef12',
        name: 'Tavern',
        description: 'Warm tavern',
        adjacency: ['0123456789abcdef11'],
        isEphemeral: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    zones: [],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO map (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    mapId,
    JSON.stringify(mapData),
    now,
    now
  );

  // 2. Global Character + File
  const globalCharData = {
    id: globalCharId,
    globalCharacterId: globalCharId,
    scenarioId: '',
    firstName: 'Alice',
    lastName: 'Liddell',
    internalDescription: 'Curious girl',
    externalDescription: 'Young girl in blue dress',
    baseAppearanceTags: 'blonde hair, blue dress',
    imagePath: `/api/files/character_cards/${globalCharId}.png`,
    wardrobes: [],
    globalMemories: '',
    locationId: '',
    exampleDialogue: '',
    rollingConversationSummaries: [],
    nextConversationWithCharacterId: '',
    groupIds: [],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO character (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    globalCharId,
    JSON.stringify(globalCharData),
    now,
    now
  );

  const globalCardDir = path.join(dataDir, 'character_cards');
  fs.mkdirSync(globalCardDir, { recursive: true });
  fs.writeFileSync(path.join(globalCardDir, `${globalCharId}.png`), Buffer.from('FAKE_GLOBAL_PNG'));

  // 3. Scenario
  const scenarioData = {
    id: scenarioId,
    name: 'Wonderland Adventure',
    description: 'An unexpected journey',
    mapId,
    userCharacterId: scenarioChar1Id,
    turnNumber: 5,
    temporalContext: {
      selectedScriptId: '',
      controlValues: {},
    },
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO scenario (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    scenarioId,
    JSON.stringify(scenarioData),
    now,
    now
  );

  // 4. Scenario Characters + Files
  const char1Data = {
    ...globalCharData,
    id: scenarioChar1Id,
    globalCharacterId: globalCharId,
    scenarioId,
    locationId: '0123456789abcdef11',
    globalMemories: 'Met the Hatter in the tavern.',
    rollingConversationSummaries: [
      {
        id: '0123456789abcdef31',
        conversationId: convId,
        turnNumber: 2,
        summary: 'Alice spoke with the Hatter.',
        participantIds: [scenarioChar1Id, scenarioChar2Id],
        chatMedium: 'in_person',
        createdAt: now,
        updatedAt: now,
      },
    ],
    nextConversationWithCharacterId: scenarioChar2Id,
    groupIds: [groupId],
    imagePath: `/api/files/scenario/${scenarioId}/character_cards/${scenarioChar1Id}.png`,
  };
  const char2Data = {
    ...globalCharData,
    id: scenarioChar2Id,
    globalCharacterId: scenarioChar2Id,
    scenarioId,
    firstName: 'Mad',
    lastName: 'Hatter',
    internalDescription: 'Eccentric hatter',
    externalDescription: 'Man in top hat',
    baseAppearanceTags: 'top hat, tea cup',
    imagePath: `/api/files/scenario/${scenarioId}/character_cards/${scenarioChar2Id}.png`,
    locationId: '0123456789abcdef12',
    globalMemories: 'Offered tea to Alice.',
    rollingConversationSummaries: [],
    nextConversationWithCharacterId: '',
    groupIds: [groupId],
  };
  db.prepare(
    `INSERT INTO scenario_character (id, scenario_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(scenarioChar1Id, scenarioId, JSON.stringify(char1Data), now, now);
  db.prepare(
    `INSERT INTO scenario_character (id, scenario_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(scenarioChar2Id, scenarioId, JSON.stringify(char2Data), now, now);

  const scenarioCharDir = path.join(dataDir, 'scenario', scenarioId, 'character_cards');
  fs.mkdirSync(scenarioCharDir, { recursive: true });
  fs.writeFileSync(path.join(scenarioCharDir, `${scenarioChar1Id}.png`), Buffer.from('FAKE_CHAR1_PNG'));
  fs.writeFileSync(path.join(scenarioCharDir, `${scenarioChar2Id}.png`), Buffer.from('FAKE_CHAR2_PNG'));

  // Chat Image
  const chatImagesDir = path.join(dataDir, 'scenario', scenarioId, 'chat_images');
  fs.mkdirSync(chatImagesDir, { recursive: true });
  fs.writeFileSync(path.join(chatImagesDir, 'tea_cup.png'), Buffer.from('FAKE_CHAT_PNG'));

  // 5. Character Group
  const groupData = {
    id: groupId,
    scenarioId,
    name: 'Tea Party Club',
    description: 'Enthusiasts of afternoon tea',
    characterIds: [scenarioChar1Id, scenarioChar2Id],
    locationId: '0123456789abcdef12',
    privateZones: [],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO scenario_character_group (id, scenario_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(groupId, scenarioId, JSON.stringify(groupData), now, now);

  // 6. Character Group Schedule
  const scheduleData = {
    id: scheduleId,
    scenarioId,
    groupId,
    lengthInTurns: 24,
    segments: [
      {
        id: '0123456789abcdef61',
        startTurn: 0,
        endTurn: 12,
        zoneId: '0123456789abcdef11',
        movementPolicy: 'casual',
        obedienceRate: 1,
        reason: 'Resting',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO scenario_character_group_schedule (id, scenario_id, group_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(scheduleId, scenarioId, groupId, JSON.stringify(scheduleData), now, now);

  // 7. Character Relationship
  const relData = {
    id: relId,
    fromId: scenarioChar1Id,
    toId: scenarioChar2Id,
    familiarity: 75,
    lastProcessedTurn: 2,
    descriptor: 'friend',
    memory: 'They enjoyed tea together.',
    nextConversationGoal: 'Talk again tomorrow',
    rollingPairwiseSummaries: [],
    rollingOffscreenLearnedInformation: [],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO character_relationship (id, from_id, to_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(relId, scenarioChar1Id, scenarioChar2Id, JSON.stringify(relData), now, now);

  // 8. Conversation & Participants
  const convData = {
    id: convId,
    scenarioId,
    turnNumber: 2,
    label: 'Afternoon Tea',
    serializedTranscript: {
      id: '0123456789abcdef83',
      rawMessages: [],
      participants: [],
      ragHelperState: {
        messageMentions: [],
        ragCache: [],
      },
      createdAt: now,
      updatedAt: now,
    },
    characterUpdates: [],
    stateUpdates: [],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO conversation (id, scenario_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(convId, scenarioId, JSON.stringify(convData), now, now);
  db.prepare(
    `INSERT INTO conversation_participant (id, character_id, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(part1Id, scenarioChar1Id, convId, now, now);
  db.prepare(
    `INSERT INTO conversation_participant (id, character_id, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(part2Id, scenarioChar2Id, convId, now, now);

  // 9. Active Turn State in key_value
  const turnData = {
    scenarioId,
    turnNumber: 5,
    chatState: 'inactive',
    activeParticipantIds: [scenarioChar1Id],
    currentSpeakerId: scenarioChar1Id,
  };
  db.prepare(`INSERT INTO key_value (key, data, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    `scenario_${scenarioId}_turn`,
    JSON.stringify(turnData),
    now,
    now
  );

  // 10. Scenario Event Logs
  for (let i = 0; i < eventLogIds.length; i++) {
    const logId = eventLogIds[i]!;
    const logData = {
      id: logId,
      scenarioId,
      eventType: 'movement',
      turnNumber: i + 1,
      characterId: scenarioChar1Id,
      characterName: 'Alice',
      fromLocationName: 'Town Square',
      toLocationName: 'Tavern',
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(
      `INSERT INTO scenario_event_log (id, scenario_id, event_type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(logId, scenarioId, 'movement', JSON.stringify(logData), now, now);
  }

  return {
    scenarioId,
    mapId,
    globalCharId,
    scenarioChar1Id,
    scenarioChar2Id,
    groupId,
    scheduleId,
    relId,
    convId,
    part1Id,
    part2Id,
    eventLogIds,
  };
}

export async function exportViaApi(payload: ExportPayload): Promise<{ filename: string; zipBuffer: Buffer }> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(`Export failed (${res.status}): ${JSON.stringify(errorJson)}`);
  }

  const data = (await res.json()) as { filename: string; filePath: string };
  const zipBuffer = fs.readFileSync(data.filePath);
  return { filename: data.filename, zipBuffer };
}
