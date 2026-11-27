import { describe, expect, it } from 'vitest';
import z from 'zod';
import { newId } from '../../util/id.js';
import { createBlankCharacter } from '../character_gen.js';
import { resolveScheduledMove } from '../character_schedule/schedule_movement.js';
import { normalizeWorldMap } from '../map/world_map.js';
import { familiarityRelativeWeight } from '../relationship.js';
import {
  characterSchema,
  timestampSchema,
  worldMapSchema,
  type Character,
  type CharacterRelationship,
  type OpenAIChatCompletionRequestMessage,
  type WorldMap,
  type WorldMapLocation,
} from '../types.js';
import { ObjectEditor, type ObjectEditorDelegate, type ObjectEditorPromptOutput } from './object_editor.js';
import {
  createBidirectionalRelationshipSchema,
  createCharacterDraftSessionBinding,
  type BidirectionalCharacterRelationship,
} from './object_editor_delegates.js';
import type { JsonPatchOperation } from './object_editor_util.js';

function makeLocation(overrides: Partial<WorldMapLocation> = {}): WorldMapLocation {
  return {
    id: newId(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Central Park',
    description: 'Leafy courtyard.',
    adjacency: [],
    isEphemeral: false,
    ...overrides,
  };
}

function makeWorldMap(locations?: WorldMapLocation[]): WorldMap {
  const locs = locations ?? [makeLocation()];
  return {
    id: newId(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Rivendell',
    description: 'An elven sanctuary.',
    locations: locs,
    zones: [
      {
        id: newId(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        name: 'Inner Ward',
        locationIds: locs.map((l) => l.id),
        wardrobeTriggers: [{ command: 'enable', tag: 'formal' }],
      },
    ],
  };
}

function makeCharacter(): Character {
  return {
    id: newId(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    globalCharacterId: newId(),
    scenarioId: newId(),
    firstName: 'Alice',
    lastName: 'Smith',
    internalDescription: 'Curious and brave.',
    externalDescription: 'Always carries a notebook.',
    baseAppearanceTags: 'brown hair, green eyes',
    imagePath: 'characters/alice.png',
    wardrobes: [
      {
        id: newId(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        text: 'red dress, elegant',
        enabled: true,
        tags: ['evening'],
        autoRevert: false,
      },
    ],
    globalMemories: '',
    locationId: newId(),
    nextConversationWithCharacterId: '',
    exampleDialogue: '',
    rollingConversationSummaries: [
      {
        id: newId(),
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        conversationId: newId(),
        turnNumber: 1,
        summary: 'Discussed library archives.',
        participantIds: [newId(), newId()],
        chatMedium: 'in_person',
      },
    ],
    groupIds: [newId()],
  };
}

function makeRelationship(fromId: string, toId: string, familiarity = 25): CharacterRelationship {
  return {
    id: newId(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    fromId,
    toId,
    familiarity,
    lastProcessedTurn: 3,
    descriptor: 'best friend',
    memory: 'Met at the library.',
    nextConversationGoal: 'Ask about the exam.',
    rollingPairwiseSummaries: [],
    rollingOffscreenLearnedInformation: [],
  };
}

function makeBidirectionalRelationship(): BidirectionalCharacterRelationship {
  const idA = newId();
  const idB = newId();
  return {
    aToB: makeRelationship(idA, idB, 42),
    bToA: makeRelationship(idB, idA, 30),
  };
}

function createHarness<T>(initialObject: T, zodSchema: z.ZodType<T>, normalizeWrite?: (next: T) => T) {
  let externalState = initialObject;
  const writtenStates: T[] = [];
  let nextPatch: JsonPatchOperation[] = [];

  const delegate: ObjectEditorDelegate<T> = {
    zodSchema,
    getObjectCurrentState: async () => externalState,
    writeObjectState: async (nextObject) => {
      const stored = normalizeWrite ? normalizeWrite(nextObject) : nextObject;
      writtenStates.push(stored);
      externalState = stored;
    },
    executePrompt: async (
      _messages: OpenAIChatCompletionRequestMessage[]
    ): Promise<ObjectEditorPromptOutput> => ({
      message: 'Adversarial attempt.',
      patch: nextPatch,
    }),
  };

  return {
    editor: new ObjectEditor(delegate),
    writtenStates,
    getExternalState: () => externalState,
    setNextPatch: (patch: JsonPatchOperation[]) => {
      nextPatch = patch;
    },
  };
}

async function expectAiAttackRejected<T>(
  initialObject: T,
  zodSchema: z.ZodType<T>,
  attacks: Array<{ label: string; patch: JsonPatchOperation[] }>
) {
  const harness = createHarness(initialObject, zodSchema);
  await harness.editor.initialize();

  for (const attack of attacks) {
    harness.setNextPatch(attack.patch);
    await harness.editor.runUserMessage(`Attack: ${attack.label}`);
    const latest = harness.editor.getState().history.at(-1)!;
    expect(latest.validationError, attack.label).toBeDefined();
    expect(harness.editor.getState().currentObject, attack.label).toEqual(initialObject);
  }

  expect(harness.writtenStates).toHaveLength(0);
  expect(harness.getExternalState()).toEqual(initialObject);
}

async function expectManualAttackRejected<T>(
  initialObject: T,
  zodSchema: z.ZodType<T>,
  attacks: Array<{ label: string; rawJson: string }>
) {
  const harness = createHarness(initialObject, zodSchema);
  await harness.editor.initialize();

  for (const attack of attacks) {
    const applied = await harness.editor.applyManualJsonEdit(attack.rawJson);
    expect(applied, attack.label).toBe(false);
    expect(harness.editor.getState().invalidManualEdit, attack.label).toBeDefined();
    expect(harness.editor.getState().currentObject, attack.label).toEqual(initialObject);
  }

  expect(harness.writtenStates).toHaveLength(0);
  expect(harness.getExternalState()).toEqual(initialObject);
}

describe('ObjectEditor adversarial red-team suite', () => {
  describe('1. container-level replace & remove+add readOnly bypasses', () => {
    it('blocks replacing /aToB or /bToA to rewrite fromId, toId, or id in BidirectionalCharacterRelationship', async () => {
      const pair = makeBidirectionalRelationship();
      const relSchema = createBidirectionalRelationshipSchema('Alice', 'Bob');
      const hijackedId = newId();

      await expectAiAttackRejected(pair, relSchema, [
        {
          label: 'replace /aToB changing fromId',
          patch: [{ op: 'replace', path: '/aToB', value: { ...pair.aToB, fromId: hijackedId } }],
        },
        {
          label: 'replace /aToB changing toId',
          patch: [{ op: 'replace', path: '/aToB', value: { ...pair.aToB, toId: hijackedId } }],
        },
        {
          label: 'replace /bToA changing id to new_id_* placeholder',
          patch: [{ op: 'replace', path: '/bToA', value: { ...pair.bToA, id: 'new_id_hijacked_rel' } }],
        },
      ]);

      await expectManualAttackRejected(pair, relSchema, [
        {
          label: 'manual Raw JSON changing aToB.fromId',
          rawJson: JSON.stringify({ ...pair, aToB: { ...pair.aToB, fromId: hijackedId } }),
        },
        {
          label: 'manual Raw JSON changing bToA.toId',
          rawJson: JSON.stringify({ ...pair, bToA: { ...pair.bToA, toId: hijackedId } }),
        },
        {
          label: 'manual Raw JSON changing aToB.id via new_id_*',
          rawJson: JSON.stringify({ ...pair, aToB: { ...pair.aToB, id: 'new_id_hijack' } }),
        },
      ]);
    });

    it('blocks container replace and remove+add laundering on WorldMap locations & zones', async () => {
      const locA = makeLocation({ name: 'Loc A' });
      const locB = makeLocation({ name: 'Loc B' });
      const map = makeWorldMap([locA, locB]);

      await expectAiAttackRejected(map, worldMapSchema, [
        {
          label: 'replace /locations/0 flipping readOnly isEphemeral',
          patch: [{ op: 'replace', path: '/locations/0', value: { ...locA, isEphemeral: true } }],
        },
        {
          label: 'remove + add laundering with flipped isEphemeral',
          patch: [
            { op: 'remove', path: '/locations/0' },
            {
              op: 'add',
              path: '/locations/-',
              value: { ...locA, isEphemeral: true },
            },
          ],
        },
        {
          label: 'clearing createdAt to "" to reset timestamp on existing location',
          patch: [{ op: 'replace', path: '/locations/0/createdAt', value: '' }],
        },
        {
          label: 'move existing createdAt into updatedAt',
          patch: [{ op: 'move', from: '/locations/0/createdAt', path: '/locations/0/updatedAt' }],
        },
      ]);

      await expectManualAttackRejected(map, worldMapSchema, [
        {
          label: 'manual Raw JSON flipping isEphemeral while reordering array',
          rawJson: JSON.stringify({
            ...map,
            locations: [locB, { ...locA, isEphemeral: true }],
          }),
        },
      ]);
    });

    it('blocks container replace and remove+add laundering on Character rolling summaries', async () => {
      const alice = makeCharacter();
      const summary0 = alice.rollingConversationSummaries[0]!;

      await expectAiAttackRejected(alice, characterSchema, [
        {
          label: 'remove + add rollingConversationSummaries/0 altering conversationId',
          patch: [
            { op: 'remove', path: '/rollingConversationSummaries/0' },
            {
              op: 'add',
              path: '/rollingConversationSummaries/-',
              value: { ...summary0, conversationId: newId() },
            },
          ],
        },
      ]);
    });

    it('ignores incoming createdAt and updatedAt (blank, omitted, or forged) and manages them automatically', async () => {
      const locA = makeLocation({ name: 'Loc A' });
      const locB = makeLocation({ name: 'Loc B' });
      const map = makeWorldMap([locA, locB]);
      const originalZone = map.zones[0]!;

      const { editor, getExternalState } = createHarness(map, worldMapSchema);
      await editor.initialize();

      // Pasting identical map JSON with blank or forged createdAt/updatedAt on existing items is a clean no-op
      const noOpResult = await editor.applyManualJsonEdit(
        JSON.stringify({
          ...map,
          createdAt: '1999-01-01T00:00:00.000Z',
          updatedAt: 'not-a-timestamp',
          locations: map.locations.map((loc) => ({ ...loc, createdAt: '', updatedAt: '1999-01-01' })),
          zones: map.zones.map((zone) => ({ ...zone, createdAt: 'yesterday', updatedAt: '' })),
        })
      );
      expect(noOpResult).toBe(false);
      expect(editor.getState().invalidManualEdit).toBeUndefined();
      expect(getExternalState().createdAt).toBe(map.createdAt);
      expect(getExternalState().updatedAt).toBe(map.updatedAt);
      expect(getExternalState().locations[0]!.createdAt).toBe(locA.createdAt);
      expect(getExternalState().locations[0]!.updatedAt).toBe(locA.updatedAt);

      // Multi-turn external AI workflow: updating an existing location and adding a new one with omitted/blank/forged timestamps & omitted isEphemeral
      const {
        createdAt: _omitCreatedAt,
        updatedAt: _omitUpdatedAt,
        isEphemeral: _omitExistingEphemeral,
        ...locBWithoutReadOnlyFields
      } = locB;
      const { isEphemeral: _omitNewEphemeral, ...newSpotWithoutEphemeral } = makeLocation({
        id: 'new_id_new_spot',
        name: 'New Spot',
      });
      const editResult = await editor.applyManualJsonEdit(
        JSON.stringify({
          ...map,
          locations: [
            { ...locA, name: 'Loc A (Updated)', createdAt: '1999-01-01T00:00:00.000Z', updatedAt: '' },
            locBWithoutReadOnlyFields,
            {
              ...newSpotWithoutEphemeral,
              createdAt: '1999-01-01T00:00:00.000Z',
              updatedAt: 'bogus',
            },
          ],
          zones: [{ ...originalZone, createdAt: '', updatedAt: '1999-01-01T00:00:00.000Z' }],
        })
      );
      expect(editResult).toBe(true);
      expect(editor.getState().invalidManualEdit).toBeUndefined();

      const updatedMap = getExternalState();
      const updatedLocA = updatedMap.locations.find((loc) => loc.id === locA.id)!;
      const updatedLocB = updatedMap.locations.find((loc) => loc.id === locB.id)!;
      const newLoc = updatedMap.locations.find((loc) => loc.name === 'New Spot')!;

      expect(updatedLocA.name).toBe('Loc A (Updated)');
      expect(updatedLocA.createdAt).toBe(locA.createdAt);
      expect(updatedLocA.updatedAt).toBe(locA.updatedAt);
      expect(updatedLocB.createdAt).toBe(locB.createdAt);
      expect(updatedLocB.updatedAt).toBe(locB.updatedAt);
      expect(updatedLocB.isEphemeral).toBe(false);
      expect(updatedMap.zones[0]!.createdAt).toBe(originalZone.createdAt);
      expect(updatedMap.zones[0]!.updatedAt).toBe(originalZone.updatedAt);

      // Brand new location gets freshly populated timestamps (ignoring incoming forged/bogus values) and default isEphemeral: false
      expect(timestampSchema.safeParse(newLoc.createdAt).success).toBe(true);
      expect(newLoc.createdAt).not.toBe('1999-01-01T00:00:00.000Z');
      expect(newLoc.createdAt).not.toBe(locA.createdAt);
      expect(timestampSchema.safeParse(newLoc.updatedAt).success).toBe(true);
      expect(newLoc.isEphemeral).toBe(false);

      // Container replace via AI patch with blank or forged createdAt/updatedAt also preserves existing timestamps
      const alice = makeCharacter();
      const wardrobe0 = alice.wardrobes[0]!;
      const charHarness = createHarness(alice, characterSchema);
      await charHarness.editor.initialize();
      charHarness.setNextPatch([
        {
          op: 'replace',
          path: '/wardrobes',
          value: [
            {
              ...wardrobe0,
              text: 'Updated outfit description',
              createdAt: '1999-01-01T00:00:00.000Z',
              updatedAt: '1999-01-01',
            },
          ],
        },
      ]);
      await charHarness.editor.runUserMessage('Update wardrobe');
      expect(charHarness.getExternalState().wardrobes[0]!.text).toBe('Updated outfit description');
      expect(charHarness.getExternalState().wardrobes[0]!.createdAt).toBe(wardrobe0.createdAt);
      expect(charHarness.getExternalState().wardrobes[0]!.updatedAt).toBe(wardrobe0.updatedAt);
    });
  });

  describe('2. cross-collection ID hijacking, copying, and placeholder syntax abuse', () => {
    it('blocks reusing a deleted zone ID as a new location ID, copy-duplicating an existing item, and invalid placeholder formats', async () => {
      const map = makeWorldMap([makeLocation({ name: 'Square' }), makeLocation({ name: 'Tavern' })]);
      const zoneId = map.zones[0]!.id;

      await expectAiAttackRejected(map, worldMapSchema, [
        {
          label: 'cross-collection hijack: remove zone 0 and reuse its ID for new location',
          patch: [
            { op: 'remove', path: '/zones/0' },
            {
              op: 'add',
              path: '/locations/-',
              value: makeLocation({ id: zoneId, name: 'Hijacked Zone Id' }),
            },
          ],
        },
        {
          label: 'copy op duplicating existing location with same id',
          patch: [{ op: 'copy', from: '/locations/0', path: '/locations/-' }],
        },
        {
          label: 'new_id_* inside readOnly /locations/0/id',
          patch: [{ op: 'replace', path: '/locations/0/id', value: 'new_id_replaced' }],
        },
        {
          label: 'legacy newId(1) placeholder syntax',
          patch: [
            {
              op: 'add',
              path: '/locations/-',
              value: makeLocation({ id: 'newId(1)', name: 'Legacy Syntax' }),
            },
          ],
        },
        {
          label: 'uppercase in new_id_* placeholder',
          patch: [
            {
              op: 'add',
              path: '/locations/-',
              value: makeLocation({ id: 'new_id_UpperCase', name: 'Bad Case' }),
            },
          ],
        },
        {
          label: 'hyphen in new_id_* placeholder',
          patch: [
            {
              op: 'add',
              path: '/locations/-',
              value: makeLocation({ id: 'new_id_bad-hyphen', name: 'Bad Hyphen' }),
            },
          ],
        },
        {
          label: 'trailing empty suffix new_id_',
          patch: [
            {
              op: 'add',
              path: '/locations/-',
              value: makeLocation({ id: 'new_id_', name: 'Empty Suffix' }),
            },
          ],
        },
      ]);

      await expectManualAttackRejected(map, worldMapSchema, [
        {
          label: 'manual Raw JSON stealing deleted zone ID for a new location',
          rawJson: JSON.stringify({
            ...map,
            locations: [...map.locations, makeLocation({ id: zoneId, name: 'Stolen Zone Id' })],
            zones: [],
          }),
        },
        {
          label: 'manual Raw JSON with uppercase placeholder',
          rawJson: JSON.stringify({
            ...map,
            locations: [...map.locations, makeLocation({ id: 'new_id_Library', name: 'Upper' })],
          }),
        },
      ]);
    });

    it('blocks new_id_* placeholder inside readOnly root id or Character locationId', async () => {
      const alice = makeCharacter();

      await expectAiAttackRejected(alice, characterSchema, [
        {
          label: 'replace /id with new_id_*',
          patch: [{ op: 'replace', path: '/id', value: 'new_id_root_hijack' }],
        },
        {
          label: 'replace /locationId with new_id_*',
          patch: [{ op: 'replace', path: '/locationId', value: 'new_id_loc_hijack' }],
        },
      ]);
    });
  });

  describe('3. WorldMap empty locations & dangling zone references', () => {
    it('rejects emptying WorldMap.locations in both AI patches and manual Raw JSON', async () => {
      const singleLocMap = makeWorldMap([makeLocation({ name: 'Only Room' })]);

      await expectAiAttackRejected(singleLocMap, worldMapSchema, [
        {
          label: 'replace /locations with []',
          patch: [{ op: 'replace', path: '/locations', value: [] }],
        },
        {
          label: 'remove last location /locations/0',
          patch: [{ op: 'remove', path: '/locations/0' }],
        },
      ]);

      await expectManualAttackRejected(singleLocMap, worldMapSchema, [
        {
          label: 'manual Raw JSON setting locations: []',
          rawJson: JSON.stringify({ ...singleLocMap, locations: [] }),
        },
      ]);
    });

    it('normalizes away dangling and duplicate zone.locationIds after ObjectEditor deletion so scheduled teleport never warps to a deleted location', async () => {
      const keptLoc = makeLocation({ name: 'Courtyard' });
      const doomedLoc = makeLocation({ name: 'Tower' });
      const initialMap = makeWorldMap([keptLoc, doomedLoc]);
      const bogusLocId = newId();
      const groupId = newId();
      const zoneId = initialMap.zones[0]!.id;

      // Mirror useMapStore behavior by normalizing via normalizeWorldMap on write.
      const harness = createHarness(initialMap, worldMapSchema, normalizeWorldMap);
      await harness.editor.initialize();

      // Patch deletes doomedLoc and leaves doomedLoc.id + duplicate/bogus IDs inside zones[0].locationIds.
      harness.setNextPatch([
        { op: 'remove', path: '/locations/1' },
        {
          op: 'replace',
          path: '/zones/0/locationIds',
          value: [keptLoc.id, doomedLoc.id, bogusLocId, keptLoc.id],
        },
      ]);
      await harness.editor.runUserMessage('Delete Tower but leave stale zone refs.');

      const resultingMap = harness.editor.getState().currentObject!;
      expect(resultingMap.locations.map((l) => l.id)).toEqual([keptLoc.id]);
      expect(resultingMap.zones[0]!.locationIds).toEqual([keptLoc.id]);

      const move = resolveScheduledMove({
        character: { id: newId(), locationId: keptLoc.id, groupIds: [groupId] },
        turnNumber: 0,
        locations: resultingMap.locations,
        mapZones: resultingMap.zones,
        characterGroups: [],
        groupSchedulesByGroupId: {
          [groupId]: {
            id: newId(),
            createdAt: '',
            updatedAt: '',
            scenarioId: newId(),
            groupId,
            lengthInTurns: 10,
            segments: [
              {
                id: newId(),
                startTurn: 0,
                endTurn: 10,
                zoneId,
                movementPolicy: 'teleport',
                obedienceRate: 1,
              },
            ],
          },
        },
      });

      expect(move.destinationLocationId).toBe(keptLoc.id);
    });

    it('normalizes isEphemeral: true back to false on newly added locations written through normalizeWorldMap', async () => {
      const initialMap = makeWorldMap();
      const harness = createHarness(initialMap, worldMapSchema, normalizeWorldMap);
      await harness.editor.initialize();

      harness.setNextPatch([
        {
          op: 'add',
          path: '/locations/-',
          value: makeLocation({ id: 'new_id_ephemeral_room', name: 'Dream Hall', isEphemeral: true }),
        },
      ]);
      await harness.editor.runUserMessage('Add an ephemeral room.');

      expect(harness.editor.getState().history[0]!.validationError).toBeUndefined();
      expect(harness.editor.getState().currentObject!.locations[1]!.isEphemeral).toBe(false);
    });
  });

  describe('4. familiarity, lastProcessedTurn, & relationship invariants', () => {
    it('rejects negative familiarity and readOnly lastProcessedTurn edits while permitting familiarity: 0', async () => {
      const pair = makeBidirectionalRelationship();
      const relSchema = createBidirectionalRelationshipSchema('Alice', 'Bob');

      await expectAiAttackRejected(pair, relSchema, [
        {
          label: 'familiarity -1 (would make log(0) = -Infinity)',
          patch: [{ op: 'replace', path: '/aToB/familiarity', value: -1 }],
        },
        { label: 'familiarity -0.5', patch: [{ op: 'replace', path: '/aToB/familiarity', value: -0.5 }] },
        {
          label: 'familiarity -100 (would make log(-99) = NaN)',
          patch: [{ op: 'replace', path: '/bToA/familiarity', value: -100 }],
        },
        {
          label: 'direct replace /aToB/lastProcessedTurn',
          patch: [{ op: 'replace', path: '/aToB/lastProcessedTurn', value: 999 }],
        },
        {
          label: 'container replace /aToB altering lastProcessedTurn',
          patch: [{ op: 'replace', path: '/aToB', value: { ...pair.aToB, lastProcessedTurn: 0 } }],
        },
      ]);

      await expectManualAttackRejected(pair, relSchema, [
        {
          label: 'manual Raw JSON familiarity -1',
          rawJson: JSON.stringify({ ...pair, aToB: { ...pair.aToB, familiarity: -1 } }),
        },
        {
          label: 'manual Raw JSON modifying lastProcessedTurn',
          rawJson: JSON.stringify({ ...pair, bToA: { ...pair.bToA, lastProcessedTurn: 100 } }),
        },
      ]);

      const zeroHarness = createHarness(pair, relSchema);
      await zeroHarness.editor.initialize();
      zeroHarness.setNextPatch([{ op: 'replace', path: '/aToB/familiarity', value: 0 }]);
      await zeroHarness.editor.runUserMessage('Reset familiarity to 0.');
      expect(zeroHarness.editor.getState().history[0]!.validationError).toBeUndefined();
      expect(familiarityRelativeWeight(zeroHarness.editor.getState().currentObject!.aToB.familiarity)).toBe(
        1
      );
    });
  });

  describe('4b. timestamp format enforcement', () => {
    it('enforces timestampSchema format directly while auto-populating valid ISO timestamps on newly added sub-objects regardless of incoming values', async () => {
      expect(timestampSchema.safeParse('yesterday').success).toBe(false);
      expect(timestampSchema.safeParse('2026-99-99T00:00:00Z').success).toBe(false);
      expect(timestampSchema.safeParse('not-a-timestamp').success).toBe(false);
      expect(timestampSchema.safeParse('2026-11-26 11:24:33Z').success).toBe(true);
      expect(timestampSchema.safeParse('2026-11-26T11:24:33.123Z').success).toBe(true);

      const alice = makeCharacter();
      const aiHarness = createHarness(alice, characterSchema);
      await aiHarness.editor.initialize();
      aiHarness.setNextPatch([
        {
          op: 'add',
          path: '/wardrobes/-',
          value: {
            id: 'new_id_traveling_cloak',
            createdAt: 'yesterday',
            updatedAt: '2026-99-99T00:00:00Z',
            text: 'traveling cloak',
            enabled: true,
            tags: [],
            autoRevert: false,
          },
        },
      ]);
      await aiHarness.editor.runUserMessage('Add cloak with hallucinated timestamps.');
      const latest = aiHarness.editor.getState().history[0]!;
      expect(latest.validationError).toBeUndefined();
      const addedWardrobe = aiHarness.editor.getState().currentObject!.wardrobes[1]!;
      expect(timestampSchema.safeParse(addedWardrobe.createdAt).success).toBe(true);
      expect(timestampSchema.safeParse(addedWardrobe.updatedAt).success).toBe(true);
      expect(addedWardrobe.createdAt).not.toBe('yesterday');
    });
  });

  describe('5. prototype pollution, structural corruption, out-of-bounds, and mid-patch failure', () => {
    it('blocks prototype pollution attempts without polluting Object.prototype', async () => {
      const map = makeWorldMap();

      await expectAiAttackRejected(map, worldMapSchema, [
        {
          label: '__proto__ pollution op',
          patch: [{ op: 'add', path: '/__proto__/polluted', value: true }],
        },
        {
          label: 'constructor/prototype pollution op',
          patch: [{ op: 'replace', path: '/constructor/prototype/polluted', value: true }],
        },
      ]);

      await expectManualAttackRejected(map, worldMapSchema, [
        {
          label: 'manual Raw JSON with __proto__ key',
          rawJson: '{"__proto__":{"polluted":true}}',
        },
      ]);

      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rejects root type destruction, out-of-bounds indices, failing test ops, and invalid scalar constraints without partial state writes', async () => {
      const map = makeWorldMap();
      const rootPayloadAttacks: Array<{ label: string; rawValue: unknown }> = [
        { label: 'root null', rawValue: null },
        { label: 'root array', rawValue: [] },
        { label: 'root string', rawValue: 'corrupted' },
        { label: 'root unrelated object', rawValue: { wrong: true } },
      ];

      await expectAiAttackRejected(map, worldMapSchema, [
        ...rootPayloadAttacks.map((c) => ({
          label: `AI replace "" -> ${c.label}`,
          patch: [{ op: 'replace', path: '', value: c.rawValue }] satisfies JsonPatchOperation[],
        })),
        {
          label: 'AI remove root ""',
          patch: [{ op: 'remove', path: '' }],
        },
        {
          label: 'AI out-of-bounds /locations/999',
          patch: [{ op: 'add', path: '/locations/999', value: makeLocation({ id: 'new_id_oob' }) }],
        },
        {
          label: 'AI valid replace followed by failing test op leaves state untouched',
          patch: [
            { op: 'replace', path: '/name', value: 'Partially Mutated Name' },
            { op: 'test', path: '/name', value: 'Rivendell' },
          ],
        },
      ]);

      await expectManualAttackRejected(
        map,
        worldMapSchema,
        rootPayloadAttacks.map((c) => ({
          label: `manual Raw JSON -> ${c.label}`,
          rawJson: JSON.stringify(c.rawValue),
        }))
      );

      const alice = makeCharacter();
      await expectAiAttackRejected(alice, characterSchema, [
        {
          label: 'whitespace-only wardrobe.text',
          patch: [{ op: 'replace', path: '/wardrobes/0/text', value: '   \n\t  ' }],
        },
        {
          label: 'empty character firstName',
          patch: [{ op: 'replace', path: '/firstName', value: '' }],
        },
      ]);
    });
  });

  describe('6. preserves legitimate structural edits without false positives', () => {
    it('allows deleting locations[0] and reordering array items in manual Raw JSON and AI replace /locations', async () => {
      const locA = makeLocation({ name: 'Alpha' });
      const locB = makeLocation({ name: 'Beta' });
      const initialMap = makeWorldMap([locA, locB]);

      // Manual Raw JSON: delete locations[0] (shifts locB from index 1 to index 0).
      const manualDeleteHarness = createHarness(initialMap, worldMapSchema);
      await manualDeleteHarness.editor.initialize();
      const deletedApplied = await manualDeleteHarness.editor.applyManualJsonEdit(
        JSON.stringify({ ...initialMap, locations: [locB] }, null, 2)
      );
      expect(deletedApplied).toBe(true);
      expect(manualDeleteHarness.editor.getState().currentObject!.locations).toEqual([locB]);

      // Manual Raw JSON: reorder [locA, locB] -> [locB, locA].
      const manualReorderHarness = createHarness(initialMap, worldMapSchema);
      await manualReorderHarness.editor.initialize();
      const reorderedApplied = await manualReorderHarness.editor.applyManualJsonEdit(
        JSON.stringify({ ...initialMap, locations: [locB, locA] }, null, 2)
      );
      expect(reorderedApplied).toBe(true);
      expect(manualReorderHarness.editor.getState().currentObject!.locations).toEqual([locB, locA]);

      // AI patch: replace /locations reordering [locA, locB] -> [locB, locA].
      const aiReorderHarness = createHarness(initialMap, worldMapSchema);
      await aiReorderHarness.editor.initialize();
      aiReorderHarness.setNextPatch([{ op: 'replace', path: '/locations', value: [locB, locA] }]);
      await aiReorderHarness.editor.runUserMessage('Swap location order.');
      expect(aiReorderHarness.editor.getState().history[0]!.validationError).toBeUndefined();
      expect(aiReorderHarness.editor.getState().currentObject!.locations).toEqual([locB, locA]);
    });

    it('allows editing a blank draft character initialized with valid ISO timestamps', async () => {
      let currentDraft = createBlankCharacter();
      expect(timestampSchema.safeParse(currentDraft.createdAt).success).toBe(true);
      expect(timestampSchema.safeParse(currentDraft.updatedAt).success).toBe(true);

      const binding = createCharacterDraftSessionBinding({
        getDraft: () => currentDraft,
        setDraft: (next) => {
          currentDraft = next;
        },
      });
      const editor = new ObjectEditor(binding.delegate);
      await editor.initialize();

      const applied = await editor.applyManualJsonEdit(
        JSON.stringify({ ...currentDraft, firstName: 'Elowen' }, null, 2)
      );
      expect(applied).toBe(true);
      expect(editor.getState().currentObject!.firstName).toBe('Elowen');
      expect(editor.getState().currentObject!.createdAt).toBe(currentDraft.createdAt);
      expect(editor.getState().currentObject!.updatedAt).toBe(currentDraft.updatedAt);
    });
  });
});
