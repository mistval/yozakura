import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.resolve(__dirname, '..');
const demoSourceDir = path.join(serverDir, 'demo_source');
const demoDataDir = path.join(serverDir, 'demo_data');
const outZipPath = path.join(serverDir, 'demo_data.yozakura_export.zip');

const TIMESTAMP_ISO = '2026-11-01T12:00:00.000Z';
const TIMESTAMP_SQL = '2026-11-01 12:00:00Z';
const EXPORT_NAME = 'yozakura_export_demo';
const DB_USER_VERSION = 10;

const hexIdSchema = z.string().regex(/^[a-f0-9]{18}$/, 'Expected 18-char lowercase hex ID');

const wardrobeSchema = z.object({
  id: hexIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  text: z.string().trim().min(1),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  autoRevert: z.boolean(),
});

const sourceCharacterSchema = z.object({
  slug: z.string().min(1),
  globalId: hexIdSchema,
  scenarioCharacterId: hexIdSchema,
  firstName: z.string().min(1),
  lastName: z.string(),
  internalDescription: z.string(),
  externalDescription: z.string(),
  baseAppearanceTags: z.string(),
  wardrobes: z.array(wardrobeSchema).min(6),
  globalMemories: z.string(),
  locationId: hexIdSchema,
  exampleDialogue: z.string(),
  groupIds: z.array(hexIdSchema),
});

const mapLocationSchema = z.object({
  id: hexIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  name: z.string().min(1),
  description: z.string(),
  adjacency: z.array(hexIdSchema),
  isEphemeral: z.boolean(),
});

const wardrobeTriggerSchema = z.object({
  command: z.enum(['disable', 'enable', 'enable_one']),
  tag: z.string().min(1),
});

const mapZoneSchema = z.object({
  id: hexIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  name: z.string().min(1),
  locationIds: z.array(hexIdSchema),
  wardrobeTriggers: z.array(wardrobeTriggerSchema),
});

const worldMapSchema = z.object({
  id: hexIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  name: z.string().min(1),
  description: z.string(),
  locations: z.array(mapLocationSchema),
  zones: z.array(mapZoneSchema),
});

const scheduleSegmentSchema = z.object({
  id: hexIdSchema,
  startTurn: z.number().int().nonnegative(),
  endTurn: z.number().int().positive(),
  zoneId: hexIdSchema,
  movementPolicy: z.enum(['teleport', 'jump', 'rush', 'casual']),
  obedienceRate: z.number().min(0).max(1),
  reason: z.string().optional(),
});

const sourceGroupFileSchema = z.object({
  group: z.object({
    id: hexIdSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    scenarioId: hexIdSchema,
    name: z.string().min(1),
    privateZones: z.array(hexIdSchema),
  }),
  schedule: z.object({
    id: hexIdSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    scenarioId: hexIdSchema,
    groupId: hexIdSchema,
    lengthInTurns: z.number().int().positive(),
    segments: z.array(scheduleSegmentSchema).min(1),
  }),
});

const relationshipSideSchema = z.object({
  id: hexIdSchema,
  descriptor: z.string().min(1),
  memory: z.string(),
  nextConversationGoal: z.string(),
});

const sourceRelationshipPairSchema = z.object({
  charASlug: z.string().min(1),
  charBSlug: z.string().min(1),
  familiarity: z.number().min(0).max(100),
  aToB: relationshipSideSchema,
  bToA: relationshipSideSchema,
});

const sourceScenarioSchema = z.object({
  scenario: z.object({
    id: hexIdSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    mapId: hexIdSchema,
    userCharacterId: hexIdSchema,
    turnOffset: z.number().int(),
    turnNumber: z.number().int().nonnegative(),
    saveName: z.string(),
    remoteChatMedium: z.string().min(1),
    temporalContext: z.object({
      selectedScriptId: z.string().min(1),
      controlValues: z.record(z.string(), z.record(z.string(), z.string())),
    }),
  }),
  openingChat: z.object({
    transcriptId: hexIdSchema,
    openingMessageId: hexIdSchema,
    openingImageMessageId: hexIdSchema,
    speakerSlug: z.string().min(1),
    initiatorSlug: z.string().min(1),
    message: z.string().min(1),
  }),
});

type SourceCharacter = z.infer<typeof sourceCharacterSchema>;

function readJsonFilesFromDir<T>(dirPath: string, schema: z.ZodType<T>): Array<{ file: string; data: T }> {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Missing demo source directory: ${dirPath}`);
  }

  const files = fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .sort();

  return files.map((file) => {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
    return { file, data: schema.parse(raw) };
  });
}

function registerUniqueId(seenIds: Map<string, string>, id: string, owner: string): void {
  const existing = seenIds.get(id);
  if (existing) {
    throw new Error(`Duplicate ID "${id}" used by both ${existing} and ${owner}`);
  }
  seenIds.set(id, owner);
}

function resolvePlaceholderImagePath(): string {
  const localPlaceholder = path.join(demoSourceDir, 'images', 'characters', '_default_placeholder.png');
  if (fs.existsSync(localPlaceholder)) {
    return localPlaceholder;
  }

  const clientPlaceholder = path.resolve(
    serverDir,
    '..',
    'client',
    'src',
    'public',
    'images',
    'character',
    'default_character.png'
  );
  if (fs.existsSync(clientPlaceholder)) {
    return clientPlaceholder;
  }

  throw new Error('Could not find fallback character PNG image for demo compilation');
}

function formatJsonlLine(table: string, row: Record<string, unknown>): string {
  return JSON.stringify({ table, row });
}

function compileDemoSource(): void {
  const maps = readJsonFilesFromDir(path.join(demoSourceDir, 'maps'), worldMapSchema);
  const characters = readJsonFilesFromDir(path.join(demoSourceDir, 'characters'), sourceCharacterSchema);
  const groups = readJsonFilesFromDir(path.join(demoSourceDir, 'groups'), sourceGroupFileSchema);
  const relationshipPairs = readJsonFilesFromDir(
    path.join(demoSourceDir, 'relationships'),
    sourceRelationshipPairSchema
  );

  const rawScenario: unknown = JSON.parse(fs.readFileSync(path.join(demoSourceDir, 'scenario.json'), 'utf8'));
  const { scenario, openingChat } = sourceScenarioSchema.parse(rawScenario);

  if (characters.length === 0) {
    throw new Error('Expected at least 1 character JSON in demo_source/characters');
  }

  const seenIds = new Map<string, string>();
  registerUniqueId(seenIds, scenario.id, 'scenario');
  registerUniqueId(seenIds, openingChat.transcriptId, 'openingChat.transcriptId');
  registerUniqueId(seenIds, openingChat.openingMessageId, 'openingChat.openingMessageId');
  registerUniqueId(seenIds, openingChat.openingImageMessageId, 'openingChat.openingImageMessageId');

  const mapsById = new Map<string, z.infer<typeof worldMapSchema>>();
  for (const { file, data } of maps) {
    registerUniqueId(seenIds, data.id, `map:${file}`);
    for (const loc of data.locations) {
      registerUniqueId(seenIds, loc.id, `location:${file}:${loc.name}`);
    }
    for (const zone of data.zones) {
      registerUniqueId(seenIds, zone.id, `zone:${file}:${zone.name}`);
    }
    mapsById.set(data.id, data);
  }

  const scenarioMap = mapsById.get(scenario.mapId);
  if (!scenarioMap) {
    throw new Error(`Scenario mapId "${scenario.mapId}" not found in demo_source/maps`);
  }
  const validLocationIds = new Set(scenarioMap.locations.map((loc) => loc.id));
  const validZoneIds = new Set(scenarioMap.zones.map((zone) => zone.id));

  const validGroupIds = new Set<string>();
  for (const { file, data } of groups) {
    if (data.group.scenarioId !== scenario.id || data.schedule.scenarioId !== scenario.id) {
      throw new Error(`Group file "${file}" scenarioId does not match scenario.id`);
    }
    if (data.schedule.groupId !== data.group.id) {
      throw new Error(`Group file "${file}" schedule.groupId does not match group.id`);
    }
    registerUniqueId(seenIds, data.group.id, `group:${file}`);
    registerUniqueId(seenIds, data.schedule.id, `schedule:${file}`);
    for (const seg of data.schedule.segments) {
      if (!validZoneIds.has(seg.zoneId)) {
        throw new Error(`Group file "${file}" references unknown zoneId "${seg.zoneId}"`);
      }
    }
    validGroupIds.add(data.group.id);
  }

  const REQUIRED_LOCATION_WARDROBE_TAGS = ['dueling', 'lab', 'greenhouse', 'dorm'] as const;

  const seenFirstNames = new Set<string>();
  const seenLastNames = new Set<string>();
  const charsBySlug = new Map<string, SourceCharacter>();
  let userChar: SourceCharacter | undefined;
  for (const { file, data } of characters) {
    if (`${data.slug}.json` !== file) {
      throw new Error(`Character file "${file}" must match slug "${data.slug}"`);
    }
    const normalizedFirstName = data.firstName.trim().toLowerCase();
    if (seenFirstNames.has(normalizedFirstName)) {
      throw new Error(`Duplicate firstName "${data.firstName}" on character "${data.slug}"`);
    }
    seenFirstNames.add(normalizedFirstName);
    if (data.lastName.trim()) {
      const normalizedLastName = data.lastName.trim().toLowerCase();
      if (seenLastNames.has(normalizedLastName)) {
        throw new Error(`Duplicate lastName "${data.lastName}" on character "${data.slug}"`);
      }
      seenLastNames.add(normalizedLastName);
    }
    registerUniqueId(seenIds, data.globalId, `character:${data.slug}`);
    registerUniqueId(seenIds, data.scenarioCharacterId, `scenario_character:${data.slug}`);
    if (!validLocationIds.has(data.locationId)) {
      throw new Error(`Character "${data.slug}" locationId "${data.locationId}" not on scenario map`);
    }
    for (const groupId of data.groupIds) {
      if (!validGroupIds.has(groupId)) {
        throw new Error(`Character "${data.slug}" references unknown groupId "${groupId}"`);
      }
    }

    if (!data.wardrobes[0]?.enabled || data.wardrobes.slice(1).some((w) => w.enabled)) {
      throw new Error(`Character "${data.slug}" must have only wardrobes[0] enabled by default`);
    }

    let everydayAutoselectCount = 0;
    for (const wardrobe of data.wardrobes) {
      registerUniqueId(seenIds, wardrobe.id, `wardrobe:${data.slug}`);
      const hasDailyAutoselect = wardrobe.tags.some((tag) => tag.startsWith('daily_autoselect:'));
      const hasEveryday = wardrobe.tags.includes('everyday');

      if (hasDailyAutoselect && !hasEveryday) {
        throw new Error(
          `Character "${data.slug}" wardrobe "${wardrobe.id}" has daily_autoselect tag without "everyday"`
        );
      }
      if (wardrobe.tags.includes('daily_autoselect:default') && hasEveryday) {
        everydayAutoselectCount++;
      }
    }

    if (everydayAutoselectCount < 1) {
      throw new Error(
        `Character "${data.slug}" must have at least 1 wardrobe tagged with both "daily_autoselect:default" and "everyday"`
      );
    }

    for (const requiredTag of REQUIRED_LOCATION_WARDROBE_TAGS) {
      if (!data.wardrobes.some((w) => w.tags.includes(requiredTag))) {
        throw new Error(
          `Character "${data.slug}" is missing required location wardrobe tag "${requiredTag}"`
        );
      }
    }

    if (data.scenarioCharacterId === scenario.userCharacterId) {
      if (data.globalMemories !== '') {
        throw new Error(`User character "${data.slug}" must have empty globalMemories`);
      }
      userChar = data;
    } else if (!data.globalMemories.trim()) {
      throw new Error(`NPC character "${data.slug}" must have non-empty globalMemories`);
    }

    charsBySlug.set(data.slug, data);
  }

  if (!userChar) {
    throw new Error(`Scenario userCharacterId "${scenario.userCharacterId}" not found among characters`);
  }

  const expectedPairs = (characters.length * (characters.length - 1)) / 2;
  if (relationshipPairs.length !== expectedPairs) {
    throw new Error(
      `Expected ${expectedPairs} relationship pair JSON files for ${characters.length} characters, found ${relationshipPairs.length}`
    );
  }

  const seenPairKeys = new Set<string>();
  const relationshipLines: string[] = [];

  for (const { file, data } of relationshipPairs) {
    const charA = charsBySlug.get(data.charASlug);
    const charB = charsBySlug.get(data.charBSlug);
    if (!charA || !charB || data.charASlug === data.charBSlug) {
      throw new Error(`Invalid character pair in relationship file "${file}"`);
    }

    const pairKey = [data.charASlug, data.charBSlug].sort().join('__');
    if (seenPairKeys.has(pairKey)) {
      throw new Error(`Duplicate relationship pair "${pairKey}" in "${file}"`);
    }
    seenPairKeys.add(pairKey);

    registerUniqueId(seenIds, data.aToB.id, `relationship:${file}:aToB`);
    registerUniqueId(seenIds, data.bToA.id, `relationship:${file}:bToA`);

    const buildRelRow = (
      fromChar: SourceCharacter,
      toChar: SourceCharacter,
      side: z.infer<typeof relationshipSideSchema>
    ) => {
      if (fromChar.scenarioCharacterId === userChar.scenarioCharacterId) {
        if (side.memory !== '' || side.nextConversationGoal !== '') {
          throw new Error(
            `Outgoing user relationship ${fromChar.slug} -> ${toChar.slug} in "${file}" must have empty memory and nextConversationGoal`
          );
        }
      } else if (toChar.scenarioCharacterId === userChar.scenarioCharacterId) {
        if (!side.memory.trim() || !side.nextConversationGoal.trim()) {
          throw new Error(
            `Incoming NPC->user relationship ${fromChar.slug} -> ${toChar.slug} in "${file}" must have non-empty memory and nextConversationGoal`
          );
        }
      }

      const relData = {
        id: side.id,
        createdAt: TIMESTAMP_ISO,
        updatedAt: TIMESTAMP_ISO,
        fromId: fromChar.scenarioCharacterId,
        toId: toChar.scenarioCharacterId,
        familiarity: data.familiarity,
        lastProcessedTurn: 0,
        descriptor: side.descriptor,
        memory: side.memory,
        nextConversationGoal: side.nextConversationGoal,
        rollingPairwiseSummaries: [],
        rollingOffscreenLearnedInformation: [],
      };

      return formatJsonlLine('character_relationship', {
        id: side.id,
        from_id: fromChar.scenarioCharacterId,
        to_id: toChar.scenarioCharacterId,
        created_at: TIMESTAMP_SQL,
        updated_at: TIMESTAMP_SQL,
        data: JSON.stringify(relData),
      });
    };

    relationshipLines.push(buildRelRow(charA, charB, data.aToB));
    relationshipLines.push(buildRelRow(charB, charA, data.bToA));
  }

  // Clean output directory and populate images + JSONL rows
  fs.rmSync(demoDataDir, { recursive: true, force: true });
  const globalCardsDir = path.join(demoDataDir, 'character_cards');
  const scenarioCardsDir = path.join(demoDataDir, 'scenario', scenario.id, 'character_cards');
  const scenarioChatImagesDir = path.join(demoDataDir, 'scenario', scenario.id, 'chat_images');
  fs.mkdirSync(globalCardsDir, { recursive: true });
  fs.mkdirSync(scenarioCardsDir, { recursive: true });

  const placeholderImagePath = resolvePlaceholderImagePath();
  let customPortraitCount = 0;

  const characterImagesDir = path.join(demoSourceDir, 'images', 'characters');
  for (const { data: char } of characters) {
    const candidateNames = [`${char.globalId}.png`, `${char.scenarioCharacterId}.png`, `${char.slug}.png`];
    const customImage = candidateNames
      .map((name) => path.join(characterImagesDir, name))
      .find((candidatePath) => fs.existsSync(candidatePath));
    const sourceImage = customImage ?? placeholderImagePath;
    if (customImage) {
      customPortraitCount++;
    }
    fs.copyFileSync(sourceImage, path.join(globalCardsDir, `${char.globalId}.png`));
    fs.copyFileSync(sourceImage, path.join(scenarioCardsDir, `${char.globalId}.png`));
  }

  const openingSpeaker = charsBySlug.get(openingChat.speakerSlug);
  const openingInitiator = charsBySlug.get(openingChat.initiatorSlug);
  if (!openingSpeaker || !openingInitiator) {
    throw new Error('Invalid openingChat speakerSlug or initiatorSlug in scenario.json');
  }

  const rawMessages: Array<Record<string, unknown>> = [];
  const openingSceneSrc = path.join(demoSourceDir, 'images', 'chat', 'opening_scene.png');
  if (fs.existsSync(openingSceneSrc)) {
    fs.mkdirSync(scenarioChatImagesDir, { recursive: true });
    fs.copyFileSync(openingSceneSrc, path.join(scenarioChatImagesDir, 'opening_scene.png'));
    rawMessages.push({
      id: openingChat.openingImageMessageId,
      createdAt: TIMESTAMP_ISO,
      updatedAt: TIMESTAMP_ISO,
      messageType: 'image',
      imageUrl: `/api/files/scenario/${scenario.id}/chat_images/opening_scene.png`,
    });
  }

  rawMessages.push({
    id: openingChat.openingMessageId,
    createdAt: TIMESTAMP_ISO,
    updatedAt: TIMESTAMP_ISO,
    messageType: 'chat_message',
    senderId: openingSpeaker.scenarioCharacterId,
    message: openingChat.message,
  });

  const turnData = {
    turnMachineState: 'chatting',
    pendingTurnCharacterIds: [
      userChar.scenarioCharacterId,
      ...characters
        .map((c) => c.data.scenarioCharacterId)
        .filter((id) => id !== userChar.scenarioCharacterId),
    ],
    chatsSoFar: {},
    wardrobeAutoselectRan: true,
    activeChat: {
      participantIds: [openingInitiator.scenarioCharacterId, openingSpeaker.scenarioCharacterId],
      removedParticipantIds: [],
      serializedTranscript: {
        id: openingChat.transcriptId,
        createdAt: TIMESTAMP_ISO,
        updatedAt: TIMESTAMP_ISO,
        rawMessages,
        participants: [
          {
            id: openingSpeaker.scenarioCharacterId,
            firstName: openingSpeaker.firstName,
            lastName: openingSpeaker.lastName,
            imagePath: `/api/files/scenario/${scenario.id}/character_cards/${openingSpeaker.globalId}.png`,
          },
          {
            id: openingInitiator.scenarioCharacterId,
            firstName: openingInitiator.firstName,
            lastName: openingInitiator.lastName,
            imagePath: `/api/files/scenario/${scenario.id}/character_cards/${openingInitiator.globalId}.png`,
          },
        ],
        ragHelperState: {
          messageMentions: [
            [
              openingChat.openingMessageId,
              {
                senderId: openingSpeaker.scenarioCharacterId,
                mentionedCharacterIds: [
                  openingInitiator.scenarioCharacterId,
                  openingSpeaker.scenarioCharacterId,
                ],
              },
            ],
          ],
          ragCache: [],
        },
      },
      preConversationWardrobeSnapshotByCharacterId: {
        [openingInitiator.scenarioCharacterId]: openingInitiator.wardrobes,
        [openingSpeaker.scenarioCharacterId]: openingSpeaker.wardrobes,
      },
      initiatorId: openingInitiator.scenarioCharacterId,
      chatInstructions: '',
      chatInstructionsByCharacterId: {},
    },
  };

  const jsonlLines: string[] = [];

  for (const { data: map } of maps) {
    jsonlLines.push(
      formatJsonlLine('map', {
        id: map.id,
        created_at: TIMESTAMP_SQL,
        updated_at: TIMESTAMP_SQL,
        data: JSON.stringify(map),
      })
    );
  }

  for (const { data: char } of characters) {
    const globalData = {
      id: char.globalId,
      createdAt: TIMESTAMP_ISO,
      updatedAt: TIMESTAMP_ISO,
      globalCharacterId: char.globalId,
      scenarioId: '',
      firstName: char.firstName,
      lastName: char.lastName,
      internalDescription: char.internalDescription,
      externalDescription: char.externalDescription,
      baseAppearanceTags: char.baseAppearanceTags,
      imagePath: `/api/files/character_cards/${char.globalId}.png`,
      wardrobes: char.wardrobes,
      globalMemories: char.globalMemories,
      locationId: '',
      nextConversationWithCharacterId: '',
      exampleDialogue: char.exampleDialogue,
      rollingConversationSummaries: [],
      groupIds: [],
    };
    jsonlLines.push(
      formatJsonlLine('character', {
        id: char.globalId,
        created_at: TIMESTAMP_SQL,
        updated_at: TIMESTAMP_SQL,
        data: JSON.stringify(globalData),
      })
    );
  }

  jsonlLines.push(
    formatJsonlLine('scenario', {
      id: scenario.id,
      created_at: TIMESTAMP_SQL,
      updated_at: TIMESTAMP_SQL,
      data: JSON.stringify(scenario),
    })
  );

  for (const { data: char } of characters) {
    const scenarioCharData = {
      id: char.scenarioCharacterId,
      createdAt: TIMESTAMP_ISO,
      updatedAt: TIMESTAMP_ISO,
      globalCharacterId: char.globalId,
      scenarioId: scenario.id,
      firstName: char.firstName,
      lastName: char.lastName,
      internalDescription: char.internalDescription,
      externalDescription: char.externalDescription,
      baseAppearanceTags: char.baseAppearanceTags,
      imagePath: `/api/files/scenario/${scenario.id}/character_cards/${char.globalId}.png`,
      wardrobes: char.wardrobes,
      globalMemories: char.globalMemories,
      locationId: char.locationId,
      nextConversationWithCharacterId: '',
      exampleDialogue: char.exampleDialogue,
      rollingConversationSummaries: [],
      groupIds: char.groupIds,
    };
    jsonlLines.push(
      formatJsonlLine('scenario_character', {
        id: char.scenarioCharacterId,
        scenario_id: scenario.id,
        created_at: TIMESTAMP_SQL,
        updated_at: TIMESTAMP_SQL,
        data: JSON.stringify(scenarioCharData),
      })
    );
  }

  for (const { data: groupBundle } of groups) {
    jsonlLines.push(
      formatJsonlLine('scenario_character_group', {
        id: groupBundle.group.id,
        scenario_id: scenario.id,
        created_at: TIMESTAMP_SQL,
        updated_at: TIMESTAMP_SQL,
        data: JSON.stringify(groupBundle.group),
      })
    );
    jsonlLines.push(
      formatJsonlLine('scenario_character_group_schedule', {
        id: groupBundle.schedule.id,
        scenario_id: scenario.id,
        group_id: groupBundle.group.id,
        created_at: TIMESTAMP_SQL,
        updated_at: TIMESTAMP_SQL,
        data: JSON.stringify(groupBundle.schedule),
      })
    );
  }

  jsonlLines.push(...relationshipLines);
  jsonlLines.push(
    formatJsonlLine('key_value', {
      key: `scenario_${scenario.id}_turn`,
      created_at: TIMESTAMP_SQL,
      updated_at: TIMESTAMP_SQL,
      data: JSON.stringify(turnData),
    })
  );

  fs.writeFileSync(path.join(demoDataDir, 'db_rows.jsonl'), `${jsonlLines.join('\n')}\n`);
  fs.writeFileSync(
    path.join(demoDataDir, 'manifest.json'),
    `${JSON.stringify({ exportName: EXPORT_NAME, dbUserVersion: DB_USER_VERSION }, null, 2)}\n`
  );

  console.log(
    `Compiled demo_source (${maps.length} maps, ${characters.length} characters [${customPortraitCount} custom portraits], ${groups.length} groups, ${relationshipLines.length} relationships).`
  );
}

async function pack(): Promise<void> {
  if (fs.existsSync(demoSourceDir)) {
    compileDemoSource();
  } else if (!fs.existsSync(demoDataDir)) {
    console.error(`Neither demo_source (${demoSourceDir}) nor demo_data (${demoDataDir}) exists.`);
    process.exit(1);
  }

  console.log(`Packaging demo data from ${demoDataDir} into ${outZipPath}...`);
  const output = fs.createWriteStream(outZipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on('close', () => {
      console.log(`Successfully packed demo archive: ${archive.pointer()} total bytes.`);
      resolve();
    });

    output.on('error', (err) => {
      reject(err);
    });

    archive.on('error', (err: unknown) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(demoDataDir, false);
    archive.finalize().catch((err: unknown) => reject(err));
  });
}

pack().catch((err) => {
  console.error('Error packing demo data:', err);
  process.exit(1);
});
