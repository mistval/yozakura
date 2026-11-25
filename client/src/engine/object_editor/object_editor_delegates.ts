import z from 'zod';
import { assert, assertNonNullish } from '../../errors/application_error.js';
import { DEFERRED_SYNC, DEFERRED_SYNC_OWNERS, type SyncOptions } from '../../state/ephemeral_state_helper.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';
import { useMapStore } from '../../state/map_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useTemplateRenderLogStore } from '../../state/template_render_log_store.js';
import { newId } from '../../util/id.js';
import { chatCompletion } from '../llm.js';
import { globalParallelJobManager } from '../parallelization/job_manager.js';
import { ParallelJobCancellationError } from '../parallelization/job_manager_types.js';
import { ChatJobTags } from '../parallelization/yozakura_job_manager_types.js';
import { objectEditorPromptChain } from '../prompt_templates/object_editor/group.js';
import { buildObjectEditorContext } from '../prompt_templates/prompt_context_builder.js';
import {
  characterRelationshipSchema,
  characterSchema,
  worldMapSchema,
  type Character,
  type CharacterRelationship,
  type OpenAIChatCompletionRequestMessage,
  type RootPersistedObject,
  type WorldMap,
} from '../types.js';
import { ObjectEditor, type ObjectEditorDelegate, type ObjectEditorState } from './object_editor.js';

/**
 * Builds `executePrompt` and `cancelPendingPrompt` for an `ObjectEditorDelegate`:
 * renders the leading & trailing system prompts, wedges prior conversation history
 * between them, appends the latest user turn after the final system prompt,
 * dispatches via `chatCompletion` / `globalParallelJobManager` with a per-delegate tag
 * for cancellation, and parses `<json_patch>` output.
 */
export function createObjectEditorPromptHandlers<TObjectType>(
  targetTitle: string,
  zodSchema: z.ZodType<TObjectType>
): Pick<ObjectEditorDelegate<TObjectType>, 'executePrompt' | 'cancelPendingPrompt'> {
  let cachedJsonSchemaString: string | undefined;
  const activeJobTag = `object_editor:${newId()}`;
  let cancelledBeforeCompletion = false;

  const getJsonSchemaString = () => {
    cachedJsonSchemaString ??= JSON.stringify(z.toJSONSchema(zodSchema), null, 2);
    return cachedJsonSchemaString;
  };

  return {
    cancelPendingPrompt: () => {
      cancelledBeforeCompletion = true;
      globalParallelJobManager.cancelJobsByTag(activeJobTag);
    },
    executePrompt: async (messages, options) => {
      cancelledBeforeCompletion = false;

      const latestUserMessage = messages.at(-1);
      assertNonNullish(latestUserMessage, 'Expected at least one message for ObjectEditor prompt');
      assert(
        latestUserMessage.role === 'user',
        'Expected the final ObjectEditor prompt message to have role "user"'
      );

      const historyMessages = messages.slice(0, -1);
      const completionRequestId = newId();

      useTemplateRenderLogStore.getState().postTemplateRender({
        completionRequestId,
      });

      const promptContext = buildObjectEditorContext({
        targetTitle,
        jsonSchemaString: getJsonSchemaString(),
      });

      const renderedSystemPrompts = await objectEditorPromptChain.render(promptContext, {
        completionRequestId,
      });
      if (cancelledBeforeCompletion) {
        throw new ParallelJobCancellationError();
      }

      const finalMessages: OpenAIChatCompletionRequestMessage[] = [];
      if (renderedSystemPrompts[0]) {
        finalMessages.push(renderedSystemPrompts[0]);
      }
      finalMessages.push(...historyMessages);
      if (renderedSystemPrompts[1]) {
        finalMessages.push(renderedSystemPrompts[1]);
      }
      finalMessages.push(latestUserMessage);

      const response = await chatCompletion(finalMessages, {
        promptTemplateGroup: objectEditorPromptChain.templateChainId,
        promptContext,
        completionRequestId,
        onTokens: options.onTokens,
        jobConfig: {
          name: `Editing ${targetTitle}`,
          tags: [ChatJobTags.minor, activeJobTag],
        },
      });

      return objectEditorPromptChain.parse(response, promptContext, {
        completionRequestId,
      });
    },
  };
}

export function createWorldMapObjectEditorDelegate(
  mapId: string,
  syncOptions: SyncOptions = DEFERRED_SYNC
): ObjectEditorDelegate<WorldMap> {
  return {
    zodSchema: worldMapSchema,
    getObjectCurrentState: async () => {
      const map = useMapStore.getState().mapsById[mapId];
      assertNonNullish(map, `WorldMap not found: ${mapId}`);
      return map;
    },
    writeObjectState: (nextMap) =>
      useMapStore.getState().ephemeralStateHelper.stageUpdatedEntity(nextMap, syncOptions),
    ...createObjectEditorPromptHandlers('World Map', worldMapSchema),
  };
}

export function createScenarioCharacterObjectEditorDelegate(
  characterId: string,
  syncOptions: SyncOptions = DEFERRED_SYNC
): ObjectEditorDelegate<Character> {
  return {
    zodSchema: characterSchema,
    getObjectCurrentState: async () =>
      useScenarioCharacterStore.getState().getRequiredCharacterById(characterId),
    writeObjectState: (nextCharacter) =>
      useScenarioCharacterStore
        .getState()
        .ephemeralStateHelper.stageUpdatedEntity(nextCharacter, syncOptions),
    ...createObjectEditorPromptHandlers('Character', characterSchema),
  };
}

export function createGlobalCharacterObjectEditorDelegate(
  characterId: string,
  syncOptions: SyncOptions = DEFERRED_SYNC
): ObjectEditorDelegate<Character> {
  return {
    zodSchema: characterSchema,
    getObjectCurrentState: async () => {
      const character = useGlobalCharactersStore.getState().globalCharactersById[characterId];
      assertNonNullish(character, `Global character not found: ${characterId}`);
      return character;
    },
    writeObjectState: (nextCharacter) =>
      useGlobalCharactersStore.getState().ephemeralStateHelper.stageUpdatedEntity(nextCharacter, syncOptions),
    ...createObjectEditorPromptHandlers('Character', characterSchema),
  };
}

export interface CharacterDraftAccessor {
  getDraft: () => Character;
  setDraft: (nextCharacter: Character) => void;
}

export interface BidirectionalCharacterRelationship {
  aToB: CharacterRelationship;
  bToA: CharacterRelationship;
}

function getCharacterName(characterId: string): string {
  const character = useScenarioCharacterStore.getState().scenarioCharactersById[characterId];
  return formatCharacterDisplayName(character, characterId);
}

export function createBidirectionalRelationshipSchema(
  nameA: string,
  nameB: string
): z.ZodType<BidirectionalCharacterRelationship> {
  return z
    .object({
      aToB: characterRelationshipSchema.meta({
        title: `${nameA} → ${nameB}`,
      }),
      bToA: characterRelationshipSchema.meta({
        title: `${nameB} → ${nameA}`,
      }),
    })
    .meta({ title: 'Character Relationship' });
}

export function createCharacterDraftObjectEditorDelegate(
  accessor: CharacterDraftAccessor
): ObjectEditorDelegate<Character> {
  let workingDraft = accessor.getDraft();

  return {
    zodSchema: characterSchema,
    getObjectCurrentState: async () => workingDraft,
    writeObjectState: (nextCharacter) => {
      workingDraft = nextCharacter;
    },
    ...createObjectEditorPromptHandlers('Character', characterSchema),
  };
}

export function createCharacterRelationshipObjectEditorDelegate(
  idA: string,
  idB: string,
  syncOptions: SyncOptions = DEFERRED_SYNC,
  zodSchema: z.ZodType<BidirectionalCharacterRelationship> = createBidirectionalRelationshipSchema(
    getCharacterName(idA),
    getCharacterName(idB)
  )
): ObjectEditorDelegate<BidirectionalCharacterRelationship> {
  return {
    zodSchema,
    getObjectCurrentState: async () => {
      const store = useScenarioCharacterRelationshipStore.getState();
      const [aToB, bToA] = await Promise.all([
        store.getCharacterRelationship(idA, idB),
        store.getCharacterRelationship(idB, idA),
      ]);
      return { aToB, bToA };
    },
    writeObjectState: (nextPair) =>
      useScenarioCharacterRelationshipStore
        .getState()
        .ephemeralStateHelper.stageUpdatedEntities([nextPair.aToB, nextPair.bToA], syncOptions),
    ...createObjectEditorPromptHandlers('Character Relationship', zodSchema),
  };
}

export type ObjectEditorTarget =
  | { kind: 'world_map'; mapId: string }
  | { kind: 'scenario_character'; characterId: string }
  | { kind: 'global_character'; characterId: string }
  | { kind: 'character_draft'; accessor: CharacterDraftAccessor }
  | { kind: 'character_relationship'; fromId: string; toId: string };

export interface ObjectEditorSessionBinding<TObjectType> {
  targetTitle: string;
  fileNameBase: string;
  getEntityDisplayName: (obj: TObjectType | undefined) => string;
  delegate: ObjectEditorDelegate<TObjectType>;
  acquireLock: (abortSignal: AbortSignal) => Promise<void>;
  commitChanges: (finalObject: TObjectType, isDirty: boolean) => Promise<void>;
  discardChanges: () => Promise<void>;
  buildExternalAiInstructions: (currentObject: TObjectType) => string;
}

export type AnyObjectEditorSessionBinding =
  | ObjectEditorSessionBinding<WorldMap>
  | ObjectEditorSessionBinding<Character>
  | ObjectEditorSessionBinding<BidirectionalCharacterRelationship>;

export interface ObjectEditorSession {
  targetTitle: string;
  fileNameBase: string;
  useState: <TReturnType>(selector: (state: ObjectEditorState<unknown>) => TReturnType) => TReturnType;
  getState: () => ObjectEditorState<unknown>;
  useDisplayName: () => string;
  getDisplayName: () => string;
  initialize: () => Promise<void>;
  applyManualJsonEdit: (rawJson: string) => Promise<boolean>;
  runUserMessage: (message: string) => Promise<void>;
  cancelPendingTurn: () => void;
  resetConversation: () => void;
  revertFromIndex: (index: number) => Promise<string | undefined>;
  revertLatest: () => Promise<string | undefined>;
  buildExternalAiInstructions: () => string;
  acquireLock: (abortSignal: AbortSignal) => Promise<void>;
  commitChanges: () => Promise<void>;
  discardChanges: () => Promise<void>;
}

/**
 * Builds self-contained Markdown documentation for an external AI assistant to
 * inspect and return a complete updated JSON object matching `zodSchema`.
 */
export function buildExternalAiInstructions<TObjectType>(
  targetTitle: string,
  zodSchema: z.ZodType<TObjectType>,
  currentObject: TObjectType
): string {
  const jsonSchemaString = JSON.stringify(z.toJSONSchema(zodSchema), null, 2);
  const currentObjectJson = JSON.stringify(currentObject, null, 2);

  return [
    `# ${targetTitle} — External AI Assistant Instructions`,
    '',
    `You are helping the user inspect and edit a **${targetTitle}** JSON object.`,
    '',
    '## Instructions',
    '',
    '1. Review the JSON Schema and Current Object JSON below.',
    '2. When the user asks for changes, return the **complete updated JSON object** inside a single `json` code block (not a partial diff or JSON patch), so the user can paste it directly into the Raw JSON editor.',
    '3. Do **not** modify or remove fields marked `"readOnly": true` on existing objects (such as existing `id`, `createdAt`, or `updatedAt` values).',
    '4. For any newly added sub-objects or array items that require `id`, `createdAt`, or `updatedAt`, you may omit those fields, leave them as empty strings `""`, or generate 18-character lowercase hexadecimal IDs (matching `^[0-9a-f]{18}$`).',
    '5. Preserve all unrelated existing fields and ensure the output strictly conforms to the JSON Schema.',
    '',
    '## JSON Schema',
    '',
    '```json',
    jsonSchemaString,
    '```',
    '',
    '## Current Object JSON',
    '',
    '```json',
    currentObjectJson,
    '```',
  ].join('\n');
}

function formatCharacterDisplayName(character: Character | undefined, fallback: string): string {
  const fullName = [character?.firstName, character?.lastName].filter(Boolean).join(' ');
  return fullName || fallback;
}

async function commitPersistedObjectChanges<TObjectType extends RootPersistedObject>(
  delegate: ObjectEditorDelegate<TObjectType>,
  commitAllChanges: () => Promise<void>,
  finalObject: TObjectType,
  isDirty: boolean
): Promise<void> {
  if (isDirty) {
    await delegate.writeObjectState({
      ...finalObject,
      updatedAt: new Date().toISOString(),
    });
  }
  await commitAllChanges();
}

export function createWorldMapSessionBinding(mapId: string): ObjectEditorSessionBinding<WorldMap> {
  const delegate = createWorldMapObjectEditorDelegate(mapId, DEFERRED_SYNC);
  return {
    targetTitle: 'World Map',
    fileNameBase: `world_map_${mapId}_ai_instructions`,
    getEntityDisplayName: (map) => map?.name || 'World Map',
    delegate,
    acquireLock: async (abortSignal) => {
      const map = useMapStore.getState().mapsById[mapId];
      assertNonNullish(map, `WorldMap not found: ${mapId}`);
      await useMapStore
        .getState()
        .waitToLockEntitiesForDeferredSync([map], DEFERRED_SYNC_OWNERS.objectEditor, abortSignal);
    },
    commitChanges: (finalObject, isDirty) =>
      commitPersistedObjectChanges(
        delegate,
        () => useMapStore.getState().commitAllChanges(),
        finalObject,
        isDirty
      ),
    discardChanges: () => useMapStore.getState().discardPendingChanges(),
    buildExternalAiInstructions: (currentObject) =>
      buildExternalAiInstructions('World Map', worldMapSchema, currentObject),
  };
}

export function createScenarioCharacterSessionBinding(
  characterId: string
): ObjectEditorSessionBinding<Character> {
  const delegate = createScenarioCharacterObjectEditorDelegate(characterId, DEFERRED_SYNC);
  return {
    targetTitle: 'Scenario Character',
    fileNameBase: `scenario_character_${characterId}_ai_instructions`,
    getEntityDisplayName: (character) => formatCharacterDisplayName(character, 'Character'),
    delegate,
    acquireLock: async (abortSignal) => {
      const character = useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
      await useScenarioCharacterStore
        .getState()
        .waitToLockEntitiesForDeferredSync([character], DEFERRED_SYNC_OWNERS.objectEditor, abortSignal);
    },
    commitChanges: (finalObject, isDirty) =>
      commitPersistedObjectChanges(
        delegate,
        () => useScenarioCharacterStore.getState().commitAllChanges(),
        finalObject,
        isDirty
      ),
    discardChanges: () => useScenarioCharacterStore.getState().discardPendingChanges(),
    buildExternalAiInstructions: (currentObject) =>
      buildExternalAiInstructions('Scenario Character', characterSchema, currentObject),
  };
}

export function createGlobalCharacterSessionBinding(
  characterId: string
): ObjectEditorSessionBinding<Character> {
  const delegate = createGlobalCharacterObjectEditorDelegate(characterId, DEFERRED_SYNC);
  return {
    targetTitle: 'Global Character',
    fileNameBase: `global_character_${characterId}_ai_instructions`,
    getEntityDisplayName: (character) => formatCharacterDisplayName(character, 'Character'),
    delegate,
    acquireLock: async (abortSignal) => {
      const character = useGlobalCharactersStore.getState().globalCharactersById[characterId];
      assertNonNullish(character, `Global character not found: ${characterId}`);
      await useGlobalCharactersStore
        .getState()
        .waitToLockEntitiesForDeferredSync([character], DEFERRED_SYNC_OWNERS.objectEditor, abortSignal);
    },
    commitChanges: (finalObject, isDirty) =>
      commitPersistedObjectChanges(
        delegate,
        () => useGlobalCharactersStore.getState().commitAllChanges(),
        finalObject,
        isDirty
      ),
    discardChanges: () => useGlobalCharactersStore.getState().discardPendingChanges(),
    buildExternalAiInstructions: (currentObject) =>
      buildExternalAiInstructions('Global Character', characterSchema, currentObject),
  };
}

export function createCharacterDraftSessionBinding(
  accessor: CharacterDraftAccessor
): ObjectEditorSessionBinding<Character> {
  const delegate = createCharacterDraftObjectEditorDelegate(accessor);
  const initialId = accessor.getDraft().id;
  return {
    targetTitle: 'Character',
    fileNameBase: `character_${initialId || 'draft'}_ai_instructions`,
    getEntityDisplayName: (character) => formatCharacterDisplayName(character, 'New Character'),
    delegate,
    acquireLock: async () => {},
    commitChanges: async (finalObject, isDirty) => {
      if (isDirty) {
        accessor.setDraft(finalObject);
      }
    },
    discardChanges: async () => {},
    buildExternalAiInstructions: (currentObject) =>
      buildExternalAiInstructions('Character', characterSchema, currentObject),
  };
}

export function createCharacterRelationshipSessionBinding(
  idA: string,
  idB: string
): ObjectEditorSessionBinding<BidirectionalCharacterRelationship> {
  const nameA = getCharacterName(idA);
  const nameB = getCharacterName(idB);
  const zodSchema = createBidirectionalRelationshipSchema(nameA, nameB);
  const delegate = createCharacterRelationshipObjectEditorDelegate(idA, idB, DEFERRED_SYNC, zodSchema);

  return {
    targetTitle: 'Character Relationship',
    fileNameBase: `character_relationship_${idA}_${idB}_ai_instructions`,
    getEntityDisplayName: () => `${getCharacterName(idA)} ↔ ${getCharacterName(idB)}`,
    delegate,
    acquireLock: async (abortSignal) => {
      const store = useScenarioCharacterRelationshipStore.getState();
      const [aToB, bToA] = await Promise.all([
        store.getCharacterRelationship(idA, idB),
        store.getCharacterRelationship(idB, idA),
      ]);
      await store.waitToLockEntitiesForDeferredSync(
        [aToB, bToA],
        DEFERRED_SYNC_OWNERS.objectEditor,
        abortSignal
      );
    },
    commitChanges: async (finalPair, isDirty) => {
      if (isDirty) {
        const now = new Date().toISOString();
        await delegate.writeObjectState({
          aToB: { ...finalPair.aToB, updatedAt: now },
          bToA: { ...finalPair.bToA, updatedAt: now },
        });
      }
      await useScenarioCharacterRelationshipStore.getState().commitAllChanges();
    },
    discardChanges: () => useScenarioCharacterRelationshipStore.getState().discardPendingChanges(),
    buildExternalAiInstructions: (currentObject) =>
      buildExternalAiInstructions('Character Relationship', zodSchema, currentObject),
  };
}

export function createObjectEditorSessionBinding(target: ObjectEditorTarget): AnyObjectEditorSessionBinding {
  switch (target.kind) {
    case 'world_map':
      return createWorldMapSessionBinding(target.mapId);
    case 'scenario_character':
      return createScenarioCharacterSessionBinding(target.characterId);
    case 'global_character':
      return createGlobalCharacterSessionBinding(target.characterId);
    case 'character_draft':
      return createCharacterDraftSessionBinding(target.accessor);
    case 'character_relationship':
      return createCharacterRelationshipSessionBinding(target.fromId, target.toId);
  }
}

function createSessionFromBinding<TObjectType>(
  binding: ObjectEditorSessionBinding<TObjectType>
): ObjectEditorSession {
  const editor = new ObjectEditor(binding.delegate);

  return {
    targetTitle: binding.targetTitle,
    fileNameBase: binding.fileNameBase,
    useState: (selector) => editor.useState(selector),
    getState: () => editor.getState(),
    useDisplayName: () => editor.useState((state) => binding.getEntityDisplayName(state.currentObject)),
    getDisplayName: () => binding.getEntityDisplayName(editor.getState().currentObject),
    initialize: () => editor.initialize(),
    applyManualJsonEdit: (rawJson) => editor.applyManualJsonEdit(rawJson),
    runUserMessage: (message) => editor.runUserMessage(message),
    cancelPendingTurn: () => editor.cancelPendingTurn(),
    resetConversation: () => editor.resetConversation(),
    revertFromIndex: (index) => editor.revertFromIndex(index),
    revertLatest: () => editor.revertLatest(),
    buildExternalAiInstructions: () => {
      const currentObject = editor.getState().currentObject;
      assertNonNullish(currentObject, 'ObjectEditor must be initialized before building AI instructions');
      return binding.buildExternalAiInstructions(currentObject);
    },
    acquireLock: (abortSignal) => binding.acquireLock(abortSignal),
    commitChanges: async () => {
      const { currentObject, isDirty } = editor.getState();
      assertNonNullish(currentObject, 'ObjectEditor must be initialized before committing changes');
      await binding.commitChanges(currentObject, isDirty);
    },
    discardChanges: () => binding.discardChanges(),
  };
}

export function createObjectEditorSession(target: ObjectEditorTarget): ObjectEditorSession {
  switch (target.kind) {
    case 'world_map':
      return createSessionFromBinding(createWorldMapSessionBinding(target.mapId));
    case 'scenario_character':
      return createSessionFromBinding(createScenarioCharacterSessionBinding(target.characterId));
    case 'global_character':
      return createSessionFromBinding(createGlobalCharacterSessionBinding(target.characterId));
    case 'character_draft':
      return createSessionFromBinding(createCharacterDraftSessionBinding(target.accessor));
    case 'character_relationship':
      return createSessionFromBinding(createCharacterRelationshipSessionBinding(target.fromId, target.toId));
  }
}
