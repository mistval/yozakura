import z from 'zod';
import { assert, assertNonNullish } from '../../errors/application_error.js';
import { IMMEDIATE_SYNC, type SyncOptions } from '../../state/ephemeral_state_helper.js';
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
  type WorldMap,
} from '../types.js';
import type { ObjectEditorDelegate } from './object_editor.js';

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

export function createWorldMapObjectEditorDelegate(mapId: string): ObjectEditorDelegate<WorldMap> {
  return {
    zodSchema: worldMapSchema,
    getObjectCurrentState: async () => {
      const map = useMapStore.getState().mapsById[mapId];
      assertNonNullish(map, `WorldMap not found: ${mapId}`);
      return map;
    },
    writeObjectState: (nextMap) => {
      useMapStore.getState().saveMap(nextMap);
    },
    ...createObjectEditorPromptHandlers('World Map', worldMapSchema),
  };
}

export function createScenarioCharacterObjectEditorDelegate(
  characterId: string,
  syncOptions: SyncOptions = IMMEDIATE_SYNC
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
  characterId: string
): ObjectEditorDelegate<Character> {
  return {
    zodSchema: characterSchema,
    getObjectCurrentState: async () => {
      const character = useGlobalCharactersStore.getState().globalCharactersById[characterId];
      assertNonNullish(character, `Global character not found: ${characterId}`);
      return character;
    },
    writeObjectState: async (nextCharacter) => {
      await useGlobalCharactersStore.getState().saveGlobalCharacter(nextCharacter);
    },
    ...createObjectEditorPromptHandlers('Character', characterSchema),
  };
}

export function createCharacterRelationshipObjectEditorDelegate(
  fromId: string,
  toId: string,
  syncOptions: SyncOptions = IMMEDIATE_SYNC
): ObjectEditorDelegate<CharacterRelationship> {
  return {
    zodSchema: characterRelationshipSchema,
    getObjectCurrentState: () =>
      useScenarioCharacterRelationshipStore.getState().getCharacterRelationship(fromId, toId),
    writeObjectState: (nextRelationship) =>
      useScenarioCharacterRelationshipStore
        .getState()
        .ephemeralStateHelper.stageUpdatedEntity(nextRelationship, syncOptions),
    ...createObjectEditorPromptHandlers('Character Relationship', characterRelationshipSchema),
  };
}
