import { describe, expect, it } from 'vitest';
import z from 'zod';
import {
  characterRelationshipSchema,
  characterSchema,
  worldMapSchema,
  type Character,
  type CharacterRelationship,
  type WorldMap,
} from '../types.js';
import { idSchema, newId } from '../../util/id.js';
import { createBlankCharacter } from '../character_gen.js';
import { PromptTemplateChain } from '../prompt_templates/prompt_template_chain.js';
import { objectEditorPromptChainSpec } from '../prompt_templates/object_editor/object_editor_prompt.js';
import { chainSpecsToGroupDefaultData } from '../prompt_templates/template_types.js';
import { SettingsBridge } from '../settings/settings_bridge.js';
import {
  createBidirectionalRelationshipSchema,
  createCharacterDraftSessionBinding,
} from './object_editor_delegates.js';
import {
  ObjectEditor,
  type ObjectEditorDelegate,
  type ObjectEditorExecutePromptOptions,
  type ObjectEditorPromptOutput,
} from './object_editor.js';
import type { OpenAIChatCompletionRequestMessage } from '../types.js';

type PromptHandler = (
  messages: OpenAIChatCompletionRequestMessage[],
  options: ObjectEditorExecutePromptOptions
) => Promise<ObjectEditorPromptOutput>;

function createWorldMapFixture(): WorldMap {
  return {
    id: newId(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Rivendell',
    description: 'An elven sanctuary.',
    locations: [
      {
        id: newId(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        name: 'Central Park',
        description: 'Leafy courtyard.',
        adjacency: [],
        isEphemeral: false,
      },
    ],
    zones: [
      {
        id: newId(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        name: 'Inner Ward',
        locationIds: [],
        wardrobeTriggers: [{ command: 'enable', tag: 'formal' }],
      },
    ],
  };
}

function createCharacterFixture(): Character {
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
    rollingConversationSummaries: [],
    groupIds: [newId()],
  };
}

function createRelationshipFixture(): CharacterRelationship {
  return {
    id: newId(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    fromId: newId(),
    toId: newId(),
    familiarity: 42,
    lastProcessedTurn: 3,
    descriptor: 'best friend',
    memory: 'Met at the library.',
    nextConversationGoal: 'Ask about the exam.',
    rollingPairwiseSummaries: [],
    rollingOffscreenLearnedInformation: [],
  };
}

function createEditorHarness<T>(
  initialObject: T,
  zodSchema: z.ZodType<T>,
  promptHandler?: PromptHandler,
  cancelPendingPrompt?: () => void
) {
  let externalState = initialObject;
  const writtenStates: T[] = [];
  const promptCalls: OpenAIChatCompletionRequestMessage[][] = [];

  const delegate: ObjectEditorDelegate<T> = {
    zodSchema,
    getObjectCurrentState: async () => externalState,
    writeObjectState: async (next) => {
      externalState = next;
      writtenStates.push(next);
    },
    executePrompt: async (messages, options) => {
      promptCalls.push(messages);
      if (!promptHandler) {
        throw new Error('Unexpected executePrompt call in test without promptHandler');
      }
      return promptHandler(messages, options);
    },
    cancelPendingPrompt,
  };

  return {
    editor: new ObjectEditor(delegate),
    getExternalState: () => externalState,
    setExternalState: (next: T) => {
      externalState = next;
    },
    writtenStates,
    promptCalls,
  };
}

describe('ObjectEditor', () => {
  describe('patching, newId placeholders, auto-population, and human-readable changes', () => {
    it('expands newId(N) placeholders consistently, auto-populates persisted fields, and formats semantic WorldMap changes', async () => {
      const initialMap = createWorldMapFixture();
      const firstLocId = initialMap.locations[0]!.id;
      const newZoneLocIds = [firstLocId, 'newId(1)'];

      const { editor, getExternalState, writtenStates } = createEditorHarness(
        initialMap,
        worldMapSchema,
        async () => ({
          message: 'Added the Elrond Library and connected it to Central Park.',
          patch: [
            {
              op: 'add',
              path: '/locations/-',
              value: {
                id: 'newId(1)',
                createdAt: '',
                updatedAt: '',
                name: 'Elrond Library',
                description: 'Quiet hall of scrolls.',
                adjacency: [firstLocId],
                isEphemeral: false,
              },
            },
            {
              op: 'add',
              path: '/locations/0/adjacency/-',
              value: 'newId(1)',
            },
            {
              op: 'replace',
              path: '/zones/0/locationIds',
              value: newZoneLocIds,
            },
            {
              op: 'replace',
              path: '/zones/0/wardrobeTriggers/0/command',
              value: 'enable_one',
            },
          ],
        })
      );

      await editor.initialize();
      await editor.runUserMessage('Add an Elrond Library connected to Central Park.');

      const state = editor.getState();
      expect(state.isDirty).toBe(true);
      expect(writtenStates).toHaveLength(1);
      expect(getExternalState()).toBe(state.currentObject);

      const updatedMap = state.currentObject!;
      expect(updatedMap.locations).toHaveLength(2);
      const addedLocation = updatedMap.locations[1]!;
      expect(idSchema.safeParse(addedLocation.id).success).toBe(true);
      expect(addedLocation.createdAt).not.toBe('');
      expect(addedLocation.updatedAt).not.toBe('');

      // Both references to newId(1) resolved to the exact same newly created ID.
      expect(updatedMap.locations[0]!.adjacency).toEqual([addedLocation.id]);
      expect(updatedMap.zones[0]!.locationIds).toEqual([firstLocId, addedLocation.id]);

      const entry = state.history[0]!;
      expect(entry.source).toBe('ai');
      expect(entry.canRevert).toBe(true);
      expect(entry.validationError).toBeUndefined();
      expect(JSON.stringify(entry.objectPatch)).not.toContain('newId(');

      expect(entry.humanReadableChanges).toHaveLength(5);
      expect(entry.humanReadableChanges).toEqual(
        expect.arrayContaining([
          {
            op: 'add',
            path: '/locations/1',
            name: 'Rivendell (World Map) -> Locations -> Elrond Library (Map Location)',
            beforeValue: undefined,
            afterValue: addedLocation,
          },
          {
            op: 'add',
            path: '/locations/0/adjacency/0',
            name: 'Rivendell (World Map) -> Locations -> Central Park (Map Location) -> Adjacency -> #1',
            beforeValue: undefined,
            afterValue: addedLocation.id,
          },
          {
            op: 'add',
            path: '/zones/0/locationIds/0',
            name: 'Rivendell (World Map) -> Zones -> Inner Ward (Map Zone) -> Location Ids -> #1',
            beforeValue: undefined,
            afterValue: firstLocId,
          },
          {
            op: 'add',
            path: '/zones/0/locationIds/1',
            name: 'Rivendell (World Map) -> Zones -> Inner Ward (Map Zone) -> Location Ids -> #2',
            beforeValue: undefined,
            afterValue: addedLocation.id,
          },
          {
            op: 'replace',
            path: '/zones/0/wardrobeTriggers/0/command',
            name: 'Rivendell (World Map) -> Zones -> Inner Ward (Map Zone) -> Wardrobe Triggers -> formal (Wardrobe Trigger) -> Command',
            beforeValue: 'enable',
            afterValue: 'enable_one',
          },
        ])
      );
    });

    it('formats semantic labels for Character and CharacterRelationship edits and auto-populates new sub-objects without IDs', async () => {
      const alice = createCharacterFixture();
      const charHarness = createEditorHarness(alice, characterSchema, async () => ({
        message: 'Disabled evening dress and added casual outfit.',
        patch: [
          { op: 'replace', path: '/wardrobes/0/enabled', value: false },
          {
            op: 'add',
            path: '/wardrobes/-',
            value: {
              id: '',
              createdAt: '',
              updatedAt: '',
              text: 'blue jeans, sneakers',
              enabled: true,
              tags: ['casual'],
              autoRevert: true,
            },
          },
        ],
      }));

      await charHarness.editor.initialize();
      await charHarness.editor.runUserMessage('Switch Alice to casual wear.');

      const charState = charHarness.editor.getState();
      const addedWardrobe = charState.currentObject!.wardrobes[1]!;
      expect(idSchema.safeParse(addedWardrobe.id).success).toBe(true);
      expect(addedWardrobe.createdAt).not.toBe('');
      expect(addedWardrobe.updatedAt).not.toBe('');

      expect(charState.history[0]!.humanReadableChanges.map((c) => c.name)).toEqual([
        'Alice Smith (Character) -> Wardrobes -> red dress, elegant (Wardrobe) -> Enabled',
        'Alice Smith (Character) -> Wardrobes -> blue jeans, sneakers (Wardrobe)',
      ]);

      const rel = createRelationshipFixture();
      const relHarness = createEditorHarness(rel, characterRelationshipSchema, async () => ({
        message: 'Bumped familiarity.',
        patch: [{ op: 'replace', path: '/familiarity', value: 55 }],
      }));

      await relHarness.editor.initialize();
      await relHarness.editor.runUserMessage('Increase familiarity.');

      expect(relHarness.editor.getState().history[0]!.humanReadableChanges).toEqual([
        {
          op: 'replace',
          path: '/familiarity',
          name: 'best friend (Character Relationship) -> Familiarity',
          beforeValue: 42,
          afterValue: 55,
        },
      ]);
    });
  });

  describe('readOnly enforcement & validation error handling', () => {
    it('rejects patches modifying readOnly fields and passes error feedback into subsequent prompt messages', async () => {
      const alice = createCharacterFixture();
      let turn = 0;

      const { editor, writtenStates, promptCalls } = createEditorHarness(alice, characterSchema, async () => {
        turn += 1;
        if (turn === 1) {
          return {
            message: 'Moved Alice.',
            patch: [{ op: 'replace', path: '/locationId', value: newId() }],
          };
        }
        return {
          message: 'Renamed Alice.',
          patch: [{ op: 'replace', path: '/firstName', value: 'Alicia' }],
        };
      });

      await editor.initialize();
      await editor.runUserMessage('Move Alice somewhere else.');

      const afterFailed = editor.getState();
      expect(writtenStates).toHaveLength(0);
      expect(afterFailed.currentObject).toEqual(alice);
      expect(afterFailed.isDirty).toBe(false);
      expect(afterFailed.history).toHaveLength(1);
      expect(afterFailed.history[0]!.canRevert).toBe(false);
      expect(afterFailed.history[0]!.validationError).toContain('/locationId');

      await editor.runUserMessage('Instead rename her to Alicia.');

      const secondPrompt = promptCalls[1]!;
      expect(secondPrompt).toEqual([
        { role: 'user', content: 'Move Alice somewhere else.' },
        {
          role: 'assistant',
          content: expect.stringContaining('<json_patch>'),
        },
        {
          role: 'system',
          content: expect.stringContaining('/locationId'),
        },
        {
          role: 'user',
          content: expect.stringContaining('Instead rename her to Alicia.'),
        },
      ]);
      expect(editor.getState().currentObject!.firstName).toBe('Alicia');
    });

    it('rejects schema-invalid patches as failed history entries without throwing or mutating state', async () => {
      const alice = createCharacterFixture();
      const { editor, writtenStates } = createEditorHarness(alice, characterSchema, async () => ({
        message: 'Cleared first name.',
        patch: [{ op: 'replace', path: '/firstName', value: '' }],
      }));

      await editor.initialize();
      await editor.runUserMessage('Clear her first name.');

      expect(writtenStates).toHaveLength(0);
      expect(editor.getState().currentObject).toEqual(alice);
      expect(editor.getState().history[0]!.canRevert).toBe(false);
      expect(editor.getState().history[0]!.validationError).toBeDefined();
    });
  });

  describe('prompt history formatting, streaming, and cancellation', () => {
    it('always includes <json_patch> tags in assistant history even for no-op replies and forwards streaming tokens', async () => {
      const map = createWorldMapFixture();
      let turn = 0;

      const { editor, writtenStates, promptCalls } = createEditorHarness(
        map,
        worldMapSchema,
        async (_messages, options) => {
          options.onTokens('Checking the map...');
          turn += 1;
          if (turn === 1) {
            return { message: 'The map looks good already.', patch: [] };
          }
          return {
            message: 'Renamed the map.',
            patch: [{ op: 'replace', path: '/name', value: 'Lothlorien' }],
          };
        }
      );

      await editor.initialize();

      const pendingValues: string[] = [];
      const unsubscribe = editor.store.subscribe((state, prevState) => {
        if (
          state.pendingTurn?.streamingMessage &&
          state.pendingTurn.streamingMessage !== prevState.pendingTurn?.streamingMessage
        ) {
          pendingValues.push(state.pendingTurn.streamingMessage);
        }
      });

      await editor.runUserMessage('How does this map look?');
      unsubscribe();

      expect(pendingValues).toEqual(['Checking the map...']);
      expect(editor.getState().pendingTurn).toBeUndefined();
      expect(writtenStates).toHaveLength(0);
      expect(editor.getState().history[0]!.canRevert).toBe(false);

      await editor.runUserMessage('Rename it to Lothlorien.');
      expect(promptCalls[1]![1]).toEqual({
        role: 'assistant',
        content: 'The map looks good already.\n\n<json_patch>\n[]\n</json_patch>',
      });
    });

    it('cancels in-flight prompt via cancelPendingTurn and cleans up pendingTurn', async () => {
      const map = createWorldMapFixture();
      let cancelledViaDelegate = false;
      let rejectPendingPrompt: ((error: Error) => void) | undefined;

      const { editor } = createEditorHarness(
        map,
        worldMapSchema,
        async () =>
          new Promise<ObjectEditorPromptOutput>((_resolve, reject) => {
            rejectPendingPrompt = reject;
            queueMicrotask(() => editor.cancelPendingTurn());
          }),
        () => {
          cancelledViaDelegate = true;
          rejectPendingPrompt?.(new Error('Cancelled'));
        }
      );

      await editor.initialize();
      await expect(editor.runUserMessage('Do something slow')).rejects.toThrow('Cancelled');
      expect(cancelledViaDelegate).toBe(true);
      expect(editor.getState().pendingTurn).toBeUndefined();
    });
  });

  describe('manual JSON edits, invalid edit auto-revert, revert, discard, and external changes', () => {
    it('tracks invalid manual edits, blocks chat turns until resolved, and auto-reverts when restored to last known good state', async () => {
      const map = createWorldMapFixture();
      const validNext: WorldMap = { ...map, name: 'Gondolin' };

      const { editor, writtenStates } = createEditorHarness(map, worldMapSchema);
      await editor.initialize();

      const appliedValid = await editor.applyManualJsonEdit(JSON.stringify(validNext, null, 2));
      expect(appliedValid).toBe(true);
      expect(writtenStates).toHaveLength(1);
      expect(editor.getState().history).toHaveLength(1);
      expect(editor.getState().currentObject!.name).toBe('Gondolin');
      expect(editor.getState().isDirty).toBe(true);

      // Two consecutive invalid edits stack in history and block runUserMessage.
      const appliedSyntaxErr = await editor.applyManualJsonEdit('{ bad json');
      const appliedSchemaErr = await editor.applyManualJsonEdit(JSON.stringify({ wrong: true }));
      expect(appliedSyntaxErr).toBe(false);
      expect(appliedSchemaErr).toBe(false);
      expect(editor.getState().history).toHaveLength(3);
      expect(editor.getState().invalidManualEdit?.rawJson).toBe(JSON.stringify({ wrong: true }));
      await expect(editor.runUserMessage('Help!')).rejects.toThrow(/invalid manual JSON/i);

      // Manually restoring the JSON to Gondolin clears all trailing invalid entries via revert.
      const resolved = await editor.applyManualJsonEdit(JSON.stringify(validNext, null, 2));
      expect(resolved).toBe(true);
      expect(editor.getState().invalidManualEdit).toBeUndefined();
      expect(editor.getState().history).toHaveLength(1);
      expect(editor.getState().currentObject!.name).toBe('Gondolin');
      expect(editor.getState().isDirty).toBe(true);

      // Reverting the valid manual edit brings state back to initial Rivendell.
      const returnedPrompt = await editor.revertLatest();
      expect(returnedPrompt).toBeUndefined();
      expect(editor.getState().currentObject).toEqual(map);
      expect(editor.getState().history).toEqual([]);
      expect(editor.getState().isDirty).toBe(false);
    });

    it('reverts multi-turn AI history returning the reverted user prompt and supports discardChanges & notifyPossibleManualChange', async () => {
      const map = createWorldMapFixture();
      let step = 0;

      const { editor, setExternalState } = createEditorHarness(map, worldMapSchema, async () => {
        step += 1;
        return {
          message: `Rename ${step}`,
          patch: [{ op: 'replace', path: '/name', value: `Step ${step}` }],
        };
      });

      await editor.initialize();
      await editor.runUserMessage('First prompt');
      await editor.runUserMessage('Second prompt');
      expect(editor.getState().currentObject!.name).toBe('Step 2');

      const revertedPrompt = await editor.revertFromIndex(0);
      expect(revertedPrompt).toBe('First prompt');
      expect(editor.getState().currentObject).toEqual(map);
      expect(editor.getState().history).toEqual([]);
      expect(editor.getState().isDirty).toBe(false);

      // Out-of-band external change
      setExternalState({ ...map, description: 'Changed externally' });
      expect(await editor.notifyPossibleManualChange()).toBe(true);
      expect(editor.getState().history).toHaveLength(1);
      expect(editor.getState().isDirty).toBe(true);

      await editor.discardChanges();
      expect(editor.getState().currentObject).toEqual(map);
      expect(editor.getState().history).toEqual([]);
      expect(editor.getState().isDirty).toBe(false);
    });
  });
});

describe('objectEditorPromptChainSpec', () => {
  it('renders both leading and trailing system prompts and parses <json_patch> responses', async () => {
    const chain = new PromptTemplateChain({
      ...objectEditorPromptChainSpec,
      groupSettingsBridge: SettingsBridge.createInMemory(
        chainSpecsToGroupDefaultData([objectEditorPromptChainSpec])
      ),
    });

    const context = {
      settings: {},
      globalWritableContext: {},
      objectEditorTargetTitle: 'World Map',
      objectEditorJsonSchema: JSON.stringify(z.toJSONSchema(worldMapSchema), null, 2),
    };

    const rendered = await chain.render(context);
    expect(rendered).toHaveLength(2);
    expect(rendered[0]?.role).toBe('system');
    expect(rendered[0]?.content).toContain('"readOnly": true');
    expect(rendered[0]?.content).toContain('<object_json_schema>');
    expect(rendered[1]?.role).toBe('system');
    expect(rendered[1]?.content).toContain('World Map');

    const parsedPlain = await chain.parse(
      'Renamed the map.\n\n<json_patch>\n[{"op":"replace","path":"/name","value":"Lothlorien"}]\n</json_patch>',
      context
    );
    expect(parsedPlain).toEqual({
      message: 'Renamed the map.',
      patch: [{ op: 'replace', path: '/name', value: 'Lothlorien' }],
    });

    const parsedFenced = await chain.parse(
      'No changes needed.\n\n<json_patch>\n```json\n[]\n```\n</json_patch>',
      context
    );
    expect(parsedFenced).toEqual({
      message: 'No changes needed.',
      patch: [],
    });

    await expect(chain.parse('No patch block included here.', context)).resolves.toEqual({
      message: 'No patch block included here.',
      patch: [],
    });

    await expect(
      chain.parse('First\n<json_patch>[]</json_patch>\nSecond\n<json_patch>[]</json_patch>', context)
    ).rejects.toThrow(/at most one <json_patch>/i);
  });
});

describe('bidirectional relationships & draft character delegate', () => {
  it('supports bidirectional relationship schema formatting/readOnly guards and draft character editing', async () => {
    const schema = createBidirectionalRelationshipSchema('Alice', 'Bob');
    const aToB = createRelationshipFixture();
    const bToA = {
      ...createRelationshipFixture(),
      fromId: aToB.toId,
      toId: aToB.fromId,
      descriptor: 'rival',
    };

    const harness = createEditorHarness({ aToB, bToA }, schema, async () => ({
      message: 'Updated both directions.',
      patch: [
        { op: 'replace', path: '/aToB/memory', value: 'Shared umbrella in the rain.' },
        { op: 'replace', path: '/bToA/familiarity', value: 60 },
      ],
    }));

    await harness.editor.initialize();
    await harness.editor.runUserMessage('Update both directions.');

    const names = harness.editor.getState().history[0]!.humanReadableChanges.map((c) => c.name);
    expect(names).toHaveLength(2);
    expect(names).toEqual(
      expect.arrayContaining([
        'Character Relationship -> Alice → Bob -> Memory',
        'Character Relationship -> Bob → Alice -> Familiarity',
      ])
    );

    let currentDraft = createBlankCharacter();
    const draftBinding = createCharacterDraftSessionBinding({
      getDraft: () => currentDraft,
      setDraft: (next) => {
        currentDraft = next;
      },
    });
    const draftEditor = new ObjectEditor(draftBinding.delegate);
    await draftBinding.acquireLock(new AbortController().signal);
    await draftEditor.initialize();
    await draftEditor.applyManualJsonEdit(
      JSON.stringify({ ...currentDraft, firstName: 'Seraphina' }, null, 2)
    );
    await draftBinding.commitChanges(draftEditor.getState().currentObject!, draftEditor.getState().isDirty);
    expect(currentDraft.firstName).toBe('Seraphina');
  });
});
