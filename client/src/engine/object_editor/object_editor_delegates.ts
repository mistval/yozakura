import z from 'zod';
import { assert, assertNonNullish } from '../../errors/application_error.js';
import {
  commitDeferredSyncForOwner,
  DEFERRED_SYNC,
  DEFERRED_SYNC_OWNERS,
  discardDeferredSyncForOwner,
  type SyncOptions,
} from '../../state/ephemeral_state_helper.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';
import { useMapStore } from '../../state/map_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useTemplateRenderLogStore } from '../../state/template_render_log_store.js';
import { newId } from '../../util/id.js';
import type { QueryParamsMap } from '../../util/queryParams.js';
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

export interface ObjectEditorSession {
  targetTitle: string;
  fileNameBase: string;
  useState: <TReturnType>(selector: (state: ObjectEditorState<unknown>) => TReturnType) => TReturnType;
  getState: () => ObjectEditorState<unknown>;
  useDisplayName: () => string;
  getDisplayName: () => string;
  initialize: () => Promise<void>;
  notifyPossibleManualChange: () => Promise<boolean>;
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
    '4. For any newly added sub-objects or array items that require `id`, you MUST set `id` to a unique snake-case placeholder starting with `new_id_` (matching `^new_id_[a-z0-9_]+$`, e.g., `"new_id_town_square"` or `"new_id_room_2"`), and reuse that same placeholder anywhere else in the JSON that references that new item. You may omit `createdAt` and `updatedAt` (or set them to `""`) and they will be populated automatically.',
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
  finalObject: TObjectType,
  isDirty: boolean
): Promise<void> {
  if (isDirty) {
    await delegate.writeObjectState({
      ...finalObject,
      updatedAt: new Date().toISOString(),
    });
  }
  await commitDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor);
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
    commitChanges: (finalObject, isDirty) => commitPersistedObjectChanges(delegate, finalObject, isDirty),
    discardChanges: () => discardDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor),
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
    commitChanges: (finalObject, isDirty) => commitPersistedObjectChanges(delegate, finalObject, isDirty),
    discardChanges: () => discardDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor),
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
    commitChanges: (finalObject, isDirty) => commitPersistedObjectChanges(delegate, finalObject, isDirty),
    discardChanges: () => discardDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor),
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
      await commitDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor);
    },
    discardChanges: () => discardDeferredSyncForOwner(DEFERRED_SYNC_OWNERS.objectEditor),
    buildExternalAiInstructions: (currentObject) =>
      buildExternalAiInstructions('Character Relationship', zodSchema, currentObject),
  };
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
    notifyPossibleManualChange: () => editor.notifyPossibleManualChange(),
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

export interface ObjectEditorInspectNavigator {
  activeScenarioMapId: string | undefined;
  showMap: (mapId?: string) => void;
  showCharacterOverview: (params: { selectedIds: string[]; scrolldown?: boolean }) => void;
  showCharacterEditor: (characterId: string) => void;
}

interface ObjectEditorEntityDescriptor<TTarget extends ObjectEditorTarget> {
  parseParams: (
    params: URLSearchParams,
    draftAccessor: CharacterDraftAccessor | undefined
  ) => TTarget | undefined;
  toParams: (target: TTarget) => QueryParamsMap;
  getTargetKey: (target: TTarget) => string;
  createSession: (target: TTarget) => ObjectEditorSession;
  inspect?: ((target: TTarget, navigator: ObjectEditorInspectNavigator) => void) | undefined;
}

type ObjectEditorEntityDescriptorMap = {
  [K in ObjectEditorTarget['kind']]: ObjectEditorEntityDescriptor<Extract<ObjectEditorTarget, { kind: K }>>;
};

const OBJECT_EDITOR_ENTITY_DESCRIPTORS: ObjectEditorEntityDescriptorMap = {
  world_map: {
    parseParams: (params) => {
      const mapId = params.get('oe_id');
      return mapId ? { kind: 'world_map', mapId } : undefined;
    },
    toParams: (target) => ({
      oe_type: 'world_map',
      oe_id: target.mapId,
    }),
    getTargetKey: (target) => `world_map:${target.mapId}`,
    createSession: (target) => createSessionFromBinding(createWorldMapSessionBinding(target.mapId)),
    inspect: (target, navigator) => {
      navigator.showMap(navigator.activeScenarioMapId === target.mapId ? undefined : target.mapId);
    },
  },
  scenario_character: {
    parseParams: (params) => {
      const characterId = params.get('oe_id');
      return characterId ? { kind: 'scenario_character', characterId } : undefined;
    },
    toParams: (target) => ({
      oe_type: 'scenario_character',
      oe_id: target.characterId,
    }),
    getTargetKey: (target) => `scenario_character:${target.characterId}`,
    createSession: (target) =>
      createSessionFromBinding(createScenarioCharacterSessionBinding(target.characterId)),
    inspect: (target, navigator) => {
      navigator.showCharacterOverview({ selectedIds: [target.characterId], scrolldown: true });
    },
  },
  global_character: {
    parseParams: (params) => {
      const characterId = params.get('oe_id');
      return characterId ? { kind: 'global_character', characterId } : undefined;
    },
    toParams: (target) => ({
      oe_type: 'global_character',
      oe_id: target.characterId,
    }),
    getTargetKey: (target) => `global_character:${target.characterId}`,
    createSession: (target) =>
      createSessionFromBinding(createGlobalCharacterSessionBinding(target.characterId)),
    inspect: (target, navigator) => {
      navigator.showCharacterEditor(target.characterId);
    },
  },
  character_draft: {
    parseParams: (_params, draftAccessor) =>
      draftAccessor ? { kind: 'character_draft', accessor: draftAccessor } : undefined,
    toParams: () => ({
      oe_type: 'character_draft',
    }),
    getTargetKey: () => 'character_draft',
    createSession: (target) => createSessionFromBinding(createCharacterDraftSessionBinding(target.accessor)),
    inspect: undefined,
  },
  character_relationship: {
    parseParams: (params) => {
      const fromId = params.get('oe_from');
      const toId = params.get('oe_to');
      return fromId && toId ? { kind: 'character_relationship', fromId, toId } : undefined;
    },
    toParams: (target) => ({
      oe_type: 'character_relationship',
      oe_from: target.fromId,
      oe_to: target.toId,
    }),
    getTargetKey: (target) => `character_relationship:${target.fromId}:${target.toId}`,
    createSession: (target) =>
      createSessionFromBinding(createCharacterRelationshipSessionBinding(target.fromId, target.toId)),
    inspect: (target, navigator) => {
      navigator.showCharacterOverview({
        selectedIds: [target.fromId, target.toId],
        scrolldown: true,
      });
    },
  },
};

export const OBJECT_EDITOR_OWNED_KEYS = ['oe_type', 'oe_id', 'oe_from', 'oe_to'] as const;

function isObjectEditorKind(value: string): value is ObjectEditorTarget['kind'] {
  return Object.hasOwn(OBJECT_EDITOR_ENTITY_DESCRIPTORS, value);
}

function withEntityDescriptor<TReturn>(
  target: ObjectEditorTarget,
  fn: <K extends ObjectEditorTarget['kind']>(
    descriptor: ObjectEditorEntityDescriptor<Extract<ObjectEditorTarget, { kind: K }>>,
    narrowedTarget: Extract<ObjectEditorTarget, { kind: K }>
  ) => TReturn
): TReturn {
  switch (target.kind) {
    case 'world_map':
      return fn(OBJECT_EDITOR_ENTITY_DESCRIPTORS.world_map, target);
    case 'scenario_character':
      return fn(OBJECT_EDITOR_ENTITY_DESCRIPTORS.scenario_character, target);
    case 'global_character':
      return fn(OBJECT_EDITOR_ENTITY_DESCRIPTORS.global_character, target);
    case 'character_draft':
      return fn(OBJECT_EDITOR_ENTITY_DESCRIPTORS.character_draft, target);
    case 'character_relationship':
      return fn(OBJECT_EDITOR_ENTITY_DESCRIPTORS.character_relationship, target);
  }
}

export function parseObjectEditorTarget(
  params: URLSearchParams,
  draftAccessor: CharacterDraftAccessor | undefined
): ObjectEditorTarget | undefined {
  const isOpen = params.has('objecteditor') && params.get('objecteditor') !== 'false';
  if (!isOpen) {
    return undefined;
  }

  const type = params.get('oe_type');
  if (!type || !isObjectEditorKind(type)) {
    return undefined;
  }

  return OBJECT_EDITOR_ENTITY_DESCRIPTORS[type].parseParams(params, draftAccessor);
}

export function serializeObjectEditorTarget(target: ObjectEditorTarget): QueryParamsMap {
  return withEntityDescriptor(target, (descriptor, narrowedTarget) => descriptor.toParams(narrowedTarget));
}

export function getObjectEditorTargetKey(target: ObjectEditorTarget): string {
  return withEntityDescriptor(target, (descriptor, narrowedTarget) =>
    descriptor.getTargetKey(narrowedTarget)
  );
}

export function canInspectObjectEditorTarget(target: ObjectEditorTarget): boolean {
  return withEntityDescriptor(target, (descriptor) => Boolean(descriptor.inspect));
}

export function inspectObjectEditorTarget(
  target: ObjectEditorTarget,
  navigator: ObjectEditorInspectNavigator
): void {
  withEntityDescriptor(target, (descriptor, narrowedTarget) => {
    descriptor.inspect?.(narrowedTarget, navigator);
  });
}

export function createObjectEditorSession(target: ObjectEditorTarget): ObjectEditorSession {
  return withEntityDescriptor(target, (descriptor, narrowedTarget) =>
    descriptor.createSession(narrowedTarget)
  );
}
