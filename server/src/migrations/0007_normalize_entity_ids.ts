import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { Migration } from '../types.js';
import { applyIdMap, deriveDeterministicHex18Id } from '../id_map.js';

const OLD_TO_NEW_MAP_IDS: Readonly<Record<string, string>> = {
  f918d31fb1a24a5da88a2507678d40de: '77857aab9e47d2d6d5',
  c42275869d6b4af4af9652c589a088a5: '5d4f493e1031ae6f32',
  '2abe1a77c3c942b0a9816acfcce6419a': 'eac2a5f9060c2183bf',
  '8092f34f878c4454a69758ee58ff4264': '0e4eab3c35e29b4b2b',
};

const OLD_TO_NEW_LOCATION_IDS: Readonly<Record<string, string>> = {
  // Paradise Island
  f563580ad4a9429191c267b58b4e0af2: 'bebec280b16b77476c',
  '7d4a007f1e1a44cd93cd388c1171f2c5': 'ae2c14b5db625fd580',
  ffe97fb004a34673948d1d90643d9679: 'b794814b2e0d5d7f09',
  '93449930c6a045acbd8c538e3dc96206': '8725fc2bda99a82672',
  fabe4e2f262f41c496afa5fb7f29b657: 'a3205eef41bcf98e6f',
  '16501a7cc725490eb54422378e4f8239': '30c5ceec3ba8b73170',
  '6511b54601604bfe92dfb032e5d54b2b': '3df4fb510d5942337f',
  '5356a72f13484dd18fd499a21c53eb65': '47b7b91ce99988dc78',
  c1c3dda1ef914fdcb87ee217ffc14351: '99f492f4de7252cc81',
  '5f252d4242014fd899527085ddcf5d4d': 'dd2ba3cf8a75ca8c96',
  d2fdeb7a7f784f54862a67faecaaac82: '2192afd4be04af1000',
  a1b897ab9824437cb91fca8438627eb5: '133852adc371fa4af0',

  // Yozakura University
  '41de8d5f137b43c59f11782fff65d1e7': 'b9692403f37cbaa1fa',
  '6a7ae3b2644b48c5876125575bcdc8ad': 'c857012528979735c2',
  '0c2c983e5c784d6da08621aee8af8ca1': '709599749ce0b5fdc3',
  fea1cd1a2d0c474e8396e41256b2774d: '6084951510e1def675',
  '605437b6991c4847bbe2df580a52c443': '715685521eb9e8e12b',
  '964e48fe75744f08b541123368a2d40e': '473ad5ad9aa9c7092e',
  '23bde3c56ab64eaaa8c8a22cd4d20377': '54c9d2fca180d12c2f',
  d36349dc9113475d8fe22e8dde15bc3b: '6e54695c7f8472c8fe',
  eea793a96cff4790a44f7cafbdaf8214: '4136e7603c1b518c64',
  '3c9ab2bc125844f8baf01a471d3e74cf': 'af270b06fd66441dcc',
  '172864dfd3984567a973df0e5e87e924': '497b43db6cb901ceaa',

  // Oyacho Agawase
  e605db2bc36f40cfa0adf0249952e9fa: 'f478943d96d1bf6545',
  '0f2cb2a265c94a6db606439d091e9f26': 'd7d92a273d9a0c4992',
  a156f48212dc4b20a27ee27bbcce0b48: '4310137d777d9569ce',
  '47eb148b209c42a98602ad3776e879f5': '7eeb0900f61ec53f6c',
  c2c228d157664c1a884b06f1fc268ab8: 'b7c619c3a192d52039',
  '11a9877a3241462fb7c1a3cb177dfc73': 'b72533407901c94c83',
  b4df02655cd44e12a5d5312dd58df224: '140351c96742cd9aa4',
  d12f2ea65eea445abdecda94c7474bf1: '3ecc85d3bf31c268e7',
  '935bd88d564c4a9cb5460e0f9d2292a6': '98524fdc98a234c40e',
  '86a98a57f431417b80659fef30951779': '427e5906c9430c2af4',
  dba78c7f26ef4112a4e2d07baf7ce855: 'bdda13d85a934bec58',
  bcedffbb3eca458e98c1a353c13db6e0: 'cdb084a02252c66261',

  // Kingdoms
  df2c350879cf465fb88d185ff6beb5df: '69f4478a7baef524d4',
  '175d1a2dc9604a8ab8732b5e47e087f0': '44bd062aab353e43bc',
  aa251dd2211546a18f22d1f95e2cdd35: 'c9543aeb8847b016c7',
  b7d434a7f8b1438490137f52af079305: '58e491c717fdf005c4',
  fc2fa26d0b9541b697baceac80660903: 'f591c53db753035513',
  '5b2fc93cdfe04dc0a42e2bbed8d452c0': '4c8dcf901de1d32a5e',
  e12a64d0435f4b0fbc94a19c3cd214de: 'e74bb612ede010d14d',
  '9943c32f49364bb8ba0911e5600e928e': 'f7d62ec255e773a8bc',
  '4c58d49ae05946a7b6172176ed3afccf': '3127f054967bfd118e',
  '24a6d4de30174f37bb63625a418f12c9': '86e17f1c4945f750d7',
  e84a14a18bfc41068ad565b6bd11be54: 'd718d5823080cbd807',
  '198ebcd82eb746b79d079625c4e5ed52': 'a4525ebbbe487ec1be',
};

const OLD_TO_NEW_DEMO_CHARACTER_IDS: Readonly<Record<string, string>> = {
  'demo-delphine-acquaviva': '1bc07a1064b2b7aead',
  'demo-conrad-voss': '35ecc55d6169c250c2',
  'demo-marisol-esperanza': '95afdb3d72d295732f',
  'demo-theo-brandt': 'd941f2a2860355473a',
  'demo-yelena-sorokin': '58ae8c1299b1c9e11f',
  'demo-emeka-okafor': '37fb130c3599067a7a',
  'demo-birdie-calloway': '74626f4a570160969c',
  'demo-rajesh-malhotra': '87c72a60520ac2d995',
  'demo-margaret-lindqvist': '02d8092f87ad7660ab',
  'demo-kai-nakamura': '6b573a2aaeb9d45500',
  'demo-vivian-asghari': '6339c164e67289d6ba',
  'demo-gus-pelletier': '15ae0f6ed007ff6712',
  'demo-noor-rahimi': 'e49bee44b1291736fb',
  'demo-lyle-sullivan': '4669e0abdd8aee846d',
  'demo-celeste-moreau': 'fe185fc2b3733603ce',
  'demo-idris-mwangi': '4130395ddc5642f602',
  'demo-anneliese-brauer': 'e533dac1b22756edba',
  'demo-hank-yoshida': '671b9edb74a7484b09',
  'demo-beatrix-lindgren': '01879324022e8a104e',
  'demo-marcus-cole': 'e878ec6972a7c9f6e5',
};

const HEX_32_ID_PATTERN = /^[0-9a-f]{32}$/;

const rowidSchema = z.object({
  rowid: z.number(),
});

function is32HexId(value: unknown): value is string {
  return typeof value === 'string' && HEX_32_ID_PATTERN.test(value);
}

function addId(id: unknown, idMap: Map<string, string>): void {
  if (typeof id === 'string' && is32HexId(id) && !idMap.has(id)) {
    idMap.set(id, deriveDeterministicHex18Id(id));
  }
}

function addIds(ids: unknown, idMap: Map<string, string>): void {
  if (Array.isArray(ids)) {
    for (const item of ids) {
      addId(item, idMap);
    }
  }
}

const TABLE_ID_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  character: ['id'],
  scenario: ['id'],
  scenario_character: ['id', 'scenario_id'],
  character_relationship: ['id', 'from_id', 'to_id'],
  conversation: ['id', 'scenario_id'],
  conversation_participant: ['id', 'character_id', 'conversation_id'],
  map: ['id'],
  scenario_character_group: ['id', 'scenario_id'],
  scenario_character_group_schedule: ['id', 'scenario_id', 'group_id'],
  scenario_event_log: ['id', 'scenario_id'],
};

function scanTableIdColumnsFor32Hex(
  db: Database.Database,
  tableName: string,
  idColumns: readonly string[],
  idMap: Map<string, string>
): void {
  const selectStmt = db.prepare(`SELECT ${idColumns.join(', ')} FROM ${tableName}`);
  for (const row of selectStmt.iterate() as Iterable<Record<string, unknown>>) {
    for (const col of idColumns) {
      addId(row[col], idMap);
    }
  }
}

function extractTranscriptIds(transcript: unknown, idMap: Map<string, string>): void {
  if (typeof transcript !== 'object' || transcript === null) return;
  const t = transcript as Record<string, unknown>;

  addId(t.id, idMap);

  if (Array.isArray(t.participants)) {
    for (const p of t.participants) {
      if (typeof p === 'object' && p !== null) {
        addId((p as Record<string, unknown>).id, idMap);
      }
    }
  }

  if (Array.isArray(t.rawMessages)) {
    for (const m of t.rawMessages) {
      if (typeof m === 'object' && m !== null) {
        const msg = m as Record<string, unknown>;
        addId(msg.id, idMap);
        addId(msg.senderId, idMap);
        addId(msg.characterId, idMap);
        if (msg.isPrivateToCharacterId !== '__transcript_system__') {
          addId(msg.isPrivateToCharacterId, idMap);
        }
      }
    }
  }

  if (typeof t.ragHelperState === 'object' && t.ragHelperState !== null) {
    const rag = t.ragHelperState as Record<string, unknown>;
    if (Array.isArray(rag.messageMentions)) {
      for (const entry of rag.messageMentions) {
        if (Array.isArray(entry)) {
          addId(entry[0], idMap);
          if (typeof entry[1] === 'object' && entry[1] !== null) {
            const mentionObj = entry[1] as Record<string, unknown>;
            addId(mentionObj.senderId, idMap);
            addIds(mentionObj.mentionedCharacterIds, idMap);
          }
        }
      }
    }
    if (Array.isArray(rag.ragCache)) {
      for (const entry of rag.ragCache) {
        if (Array.isArray(entry) && typeof entry[1] === 'object' && entry[1] !== null) {
          addId((entry[1] as Record<string, unknown>).mentionedCharacterId, idMap);
        }
      }
    }
  }
}

function extractCharacterDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.id, idMap);
  addId(data.globalCharacterId, idMap);
  addId(data.scenarioId, idMap);
  addId(data.locationId, idMap);
  addId(data.nextConversationWithCharacterId, idMap);
  addIds(data.groupIds, idMap);

  if (Array.isArray(data.wardrobes)) {
    for (const w of data.wardrobes) {
      if (typeof w === 'object' && w !== null) {
        addId((w as Record<string, unknown>).id, idMap);
      }
    }
  }

  if (Array.isArray(data.rollingConversationSummaries)) {
    for (const s of data.rollingConversationSummaries) {
      if (typeof s === 'object' && s !== null) {
        const summary = s as Record<string, unknown>;
        addId(summary.id, idMap);
        addId(summary.conversationId, idMap);
      }
    }
  }
}

function extractScenarioDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.id, idMap);
  addId(data.mapId, idMap);
  addId(data.userCharacterId, idMap);
}

function extractCharacterRelationshipDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.fromId, idMap);
  addId(data.toId, idMap);

  if (Array.isArray(data.rollingPairwiseSummaries)) {
    for (const s of data.rollingPairwiseSummaries) {
      if (typeof s === 'object' && s !== null) {
        const summary = s as Record<string, unknown>;
        addId(summary.id, idMap);
        addId(summary.conversationId, idMap);
      }
    }
  }

  if (Array.isArray(data.rollingOffscreenLearnedInformation)) {
    for (const info of data.rollingOffscreenLearnedInformation) {
      if (typeof info === 'object' && info !== null) {
        const learned = info as Record<string, unknown>;
        addId(learned.id, idMap);
        addId(learned.sourceConversationId, idMap);
      }
    }
  }
}

function extractConversationDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.id, idMap);

  if (Array.isArray(data.characterUpdates)) {
    for (const u of data.characterUpdates) {
      if (typeof u === 'object' && u !== null) {
        const update = u as Record<string, unknown>;
        addId(update.id, idMap);
        addId(update.characterId, idMap);
      }
    }
  }

  extractTranscriptIds(data.serializedTranscript, idMap);
}

function extractMapDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.id, idMap);

  if (Array.isArray(data.locations)) {
    for (const loc of data.locations) {
      if (typeof loc === 'object' && loc !== null) {
        const location = loc as Record<string, unknown>;
        addId(location.id, idMap);
        addIds(location.adjacency, idMap);
      }
    }
  }

  if (Array.isArray(data.zones)) {
    for (const z of data.zones) {
      if (typeof z === 'object' && z !== null) {
        const zone = z as Record<string, unknown>;
        addId(zone.id, idMap);
        addIds(zone.locationIds, idMap);
      }
    }
  }
}

function extractScenarioCharacterGroupDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.id, idMap);
  addId(data.scenarioId, idMap);
  addIds(data.privateZones, idMap);
}

function extractScenarioCharacterGroupScheduleDataIds(
  data: Record<string, unknown>,
  idMap: Map<string, string>
): void {
  addId(data.id, idMap);
  addId(data.scenarioId, idMap);
  addId(data.groupId, idMap);

  if (Array.isArray(data.segments)) {
    for (const seg of data.segments) {
      if (typeof seg === 'object' && seg !== null) {
        const segment = seg as Record<string, unknown>;
        addId(segment.id, idMap);
        addId(segment.zoneId, idMap);
      }
    }
  }
}

function extractScenarioEventLogDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addId(data.id, idMap);
  addId(data.characterId, idMap);
}

function extractTurnDataIds(data: Record<string, unknown>, idMap: Map<string, string>): void {
  addIds(data.pendingTurnCharacterIds, idMap);

  if (typeof data.chatsSoFar === 'object' && data.chatsSoFar !== null) {
    for (const [charId, chatRecords] of Object.entries(data.chatsSoFar)) {
      addId(charId, idMap);
      if (Array.isArray(chatRecords)) {
        for (const record of chatRecords) {
          if (typeof record === 'object' && record !== null) {
            addIds((record as Record<string, unknown>).withIds, idMap);
          }
        }
      }
    }
  }

  if (typeof data.activeChat === 'object' && data.activeChat !== null) {
    const chat = data.activeChat as Record<string, unknown>;
    addIds(chat.participantIds, idMap);
    addIds(chat.removedParticipantIds, idMap);
    addId(chat.gossipTargetCharacterId, idMap);
    addId(chat.initiatorId, idMap);

    if (
      typeof chat.preConversationWardrobeSnapshotByCharacterId === 'object' &&
      chat.preConversationWardrobeSnapshotByCharacterId !== null
    ) {
      for (const [charId, wardrobes] of Object.entries(chat.preConversationWardrobeSnapshotByCharacterId)) {
        addId(charId, idMap);
        if (Array.isArray(wardrobes)) {
          for (const w of wardrobes) {
            if (typeof w === 'object' && w !== null) {
              addId((w as Record<string, unknown>).id, idMap);
            }
          }
        }
      }
    }

    if (typeof chat.ephemeralLocation === 'object' && chat.ephemeralLocation !== null) {
      const eph = chat.ephemeralLocation as Record<string, unknown>;
      addId(eph.id, idMap);
      addIds(eph.adjacency, idMap);
    }

    extractTranscriptIds(chat.serializedTranscript, idMap);
  }
}

type DataExtractor = (data: Record<string, unknown>, idMap: Map<string, string>) => void;

const TABLE_DATA_EXTRACTORS: Readonly<Record<string, DataExtractor>> = {
  character: extractCharacterDataIds,
  scenario: extractScenarioDataIds,
  scenario_character: extractCharacterDataIds,
  character_relationship: extractCharacterRelationshipDataIds,
  conversation: extractConversationDataIds,
  map: extractMapDataIds,
  scenario_character_group: extractScenarioCharacterGroupDataIds,
  scenario_character_group_schedule: extractScenarioCharacterGroupScheduleDataIds,
  scenario_event_log: extractScenarioEventLogDataIds,
};

function scanTableDataColumnFor32Hex(
  db: Database.Database,
  tableName: string,
  extractor: DataExtractor,
  idMap: Map<string, string>
): void {
  const selectStmt = db.prepare(`SELECT data FROM ${tableName}`);
  for (const row of selectStmt.iterate() as Iterable<{ data: unknown }>) {
    if (typeof row.data === 'string') {
      try {
        const parsed: unknown = JSON.parse(row.data);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          extractor(parsed as Record<string, unknown>, idMap);
        }
      } catch {
        // Skip unparseable JSON
      }
    }
  }
}

function scanTurnKeyValueFor32Hex(db: Database.Database, idMap: Map<string, string>): void {
  const selectStmt = db.prepare("SELECT key, data FROM key_value WHERE key LIKE 'scenario_%_turn'");
  for (const row of selectStmt.iterate() as Iterable<{ key: string; data: unknown }>) {
    const match = row.key.match(/^scenario_([0-9a-f]{32})_turn$/);
    if (match?.[1]) {
      addId(match[1], idMap);
    }
    if (typeof row.data === 'string') {
      try {
        const parsed: unknown = JSON.parse(row.data);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          extractTurnDataIds(parsed as Record<string, unknown>, idMap);
        }
      } catch {
        // Skip unparseable JSON
      }
    }
  }
}

function scanSettingsLlmConfigKeysFor32Hex(db: Database.Database, idMap: Map<string, string>): void {
  const row = db.prepare("SELECT data FROM key_value WHERE key = 'settings' LIMIT 1").get() as
    | { data: string }
    | undefined;

  if (!row || typeof row.data !== 'string') {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    return;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return;
  }

  const llmConfigs = (parsed as Record<string, unknown>).llmConfigs;
  if (typeof llmConfigs !== 'object' || llmConfigs === null || Array.isArray(llmConfigs)) {
    return;
  }

  for (const key of Object.keys(llmConfigs)) {
    addId(key, idMap);
  }
}

function rewriteTableRows(
  db: Database.Database,
  tableName: string,
  columns: readonly string[],
  idMap: ReadonlyMap<string, string>
): void {
  const selectRowidsStmt = db.prepare(`SELECT rowid FROM ${tableName} ORDER BY rowid ASC`);
  const rowidRows = selectRowidsStmt.all().map((r) => rowidSchema.parse(r));

  if (rowidRows.length === 0) {
    return;
  }

  const selectOneStmt = db.prepare(`SELECT rowid, ${columns.join(', ')} FROM ${tableName} WHERE rowid = ?`);
  const setClauses = columns.map((col) => `${col} = ?`).join(', ');
  const updateStmt = db.prepare(`UPDATE ${tableName} SET ${setClauses} WHERE rowid = ?`);

  for (const { rowid } of rowidRows) {
    const rawRow = selectOneStmt.get(rowid) as Record<string, unknown> | undefined;
    if (!rawRow) {
      continue;
    }

    let changed = false;
    const nextValues: string[] = [];

    for (const col of columns) {
      const val = rawRow[col];
      const strVal = typeof val === 'string' ? val : '';
      const rewritten = applyIdMap(strVal, idMap);
      if (rewritten !== strVal) {
        changed = true;
      }
      nextValues.push(rewritten);
    }

    if (changed) {
      updateStmt.run(...nextValues, rowid);
    }
  }
}

function rewriteTurnKeyValue(db: Database.Database, idMap: ReadonlyMap<string, string>): void {
  const selectStmt = db.prepare(
    "SELECT rowid, key, data FROM key_value WHERE key LIKE 'scenario_%_turn' ORDER BY rowid ASC"
  );
  const rows = selectStmt.all().map((r) =>
    z
      .object({
        rowid: z.number(),
        key: z.string(),
        data: z.string(),
      })
      .parse(r)
  );

  const updateStmt = db.prepare('UPDATE key_value SET key = ?, data = ? WHERE rowid = ?');

  for (const row of rows) {
    const newKey = applyIdMap(row.key, idMap);
    const newData = applyIdMap(row.data, idMap);

    if (newKey !== row.key || newData !== row.data) {
      updateStmt.run(newKey, newData, row.rowid);
    }
  }
}

function rewriteSettingsKeyValue(db: Database.Database, idMap: ReadonlyMap<string, string>): void {
  const selectStmt = db.prepare("SELECT data FROM key_value WHERE key = 'settings' LIMIT 1");
  const row = selectStmt.get() as { data: string } | undefined;
  if (!row || typeof row.data !== 'string') {
    return;
  }

  const newData = applyIdMap(row.data, idMap);
  if (newData !== row.data) {
    db.prepare("UPDATE key_value SET data = ? WHERE key = 'settings'").run(newData);
  }
}

function renameDiskFiles(dataDir: string, idMap: ReadonlyMap<string, string>): void {
  // 1. Rename files in <dataDir>/character_cards
  const characterCardsDir = path.join(dataDir, 'character_cards');
  if (fs.existsSync(characterCardsDir)) {
    const entries = fs.readdirSync(characterCardsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const rewrittenName = applyIdMap(entry.name, idMap);
        if (rewrittenName !== entry.name) {
          const oldPath = path.join(characterCardsDir, entry.name);
          const newPath = path.join(characterCardsDir, rewrittenName);
          if (!fs.existsSync(newPath)) {
            fs.renameSync(oldPath, newPath);
          }
        }
      }
    }
  }

  // 2. Rename folders and files in <dataDir>/scenario
  const scenarioDir = path.join(dataDir, 'scenario');
  if (fs.existsSync(scenarioDir)) {
    const scenarioEntries = fs.readdirSync(scenarioDir, { withFileTypes: true });
    for (const scenEntry of scenarioEntries) {
      if (scenEntry.isDirectory()) {
        const scenPath = path.join(scenarioDir, scenEntry.name);

        for (const subfolder of ['character_cards', 'chat_images']) {
          const subPath = path.join(scenPath, subfolder);
          if (fs.existsSync(subPath)) {
            const files = fs.readdirSync(subPath, { withFileTypes: true });
            for (const file of files) {
              if (file.isFile()) {
                const rewrittenName = applyIdMap(file.name, idMap);
                if (rewrittenName !== file.name) {
                  const oldFilePath = path.join(subPath, file.name);
                  const newFilePath = path.join(subPath, rewrittenName);
                  if (!fs.existsSync(newFilePath)) {
                    fs.renameSync(oldFilePath, newFilePath);
                  }
                }
              }
            }
          }
        }

        const rewrittenScenName = applyIdMap(scenEntry.name, idMap);
        if (rewrittenScenName !== scenEntry.name) {
          const newScenPath = path.join(scenarioDir, rewrittenScenName);
          if (!fs.existsSync(newScenPath)) {
            fs.renameSync(scenPath, newScenPath);
          }
        }
      }
    }
  }
}

export const migration: Migration = {
  doMigration(db, context) {
    // Pass 1: Build idMap
    const idMap = new Map<string, string>();

    for (const [oldId, newId] of Object.entries(OLD_TO_NEW_MAP_IDS)) {
      idMap.set(oldId, newId);
    }
    for (const [oldId, newId] of Object.entries(OLD_TO_NEW_LOCATION_IDS)) {
      idMap.set(oldId, newId);
    }
    for (const [oldId, newId] of Object.entries(OLD_TO_NEW_DEMO_CHARACTER_IDS)) {
      idMap.set(oldId, newId);
    }

    for (const [table, idColumns] of Object.entries(TABLE_ID_COLUMNS)) {
      scanTableIdColumnsFor32Hex(db, table, idColumns, idMap);
      const extractor = TABLE_DATA_EXTRACTORS[table];
      if (extractor) {
        scanTableDataColumnFor32Hex(db, table, extractor, idMap);
      }
    }
    scanTurnKeyValueFor32Hex(db, idMap);
    scanSettingsLlmConfigKeysFor32Hex(db, idMap);

    // Pass 2: Rewrite SQLite tables
    db.pragma('defer_foreign_keys = ON');

    rewriteTableRows(db, 'character', ['id', 'data'], idMap);
    rewriteTableRows(db, 'scenario', ['id', 'data'], idMap);
    rewriteTableRows(db, 'scenario_character', ['id', 'scenario_id', 'data'], idMap);
    rewriteTableRows(db, 'character_relationship', ['id', 'from_id', 'to_id', 'data'], idMap);
    rewriteTableRows(db, 'conversation', ['id', 'scenario_id', 'data'], idMap);
    rewriteTableRows(db, 'conversation_participant', ['id', 'character_id', 'conversation_id'], idMap);
    rewriteTableRows(db, 'map', ['id', 'data'], idMap);
    rewriteTableRows(db, 'scenario_character_group', ['id', 'scenario_id', 'data'], idMap);
    rewriteTableRows(
      db,
      'scenario_character_group_schedule',
      ['id', 'scenario_id', 'group_id', 'data'],
      idMap
    );
    rewriteTableRows(db, 'scenario_event_log', ['id', 'scenario_id', 'data'], idMap);
    rewriteTurnKeyValue(db, idMap);
    rewriteSettingsKeyValue(db, idMap);

    const fkViolations = db.pragma('foreign_key_check') as unknown[];
    if (Array.isArray(fkViolations) && fkViolations.length > 0) {
      throw new Error(`Migration 0007 failed foreign_key_check with ${fkViolations.length} violations`);
    }

    // Pass 3: Disk rename
    if (context?.dataDir) {
      renameDiskFiles(context.dataDir, idMap);
    }
  },
};
