import * as Api from '../backend_bridge/api';
import { createProxiedFetch } from '../backend_bridge/proxied_fetch.js';
import { loadUserTextFileContent } from '../backend_bridge/database.js';
import { assertNonNullish } from '../errors/application_error.js';
import { runWithInteractiveRetry } from './interative_retry.js';
import { useSettingsStore } from '../state/settings_store.js';
import type { Character } from './types.js';
import type { SettingsScriptHelpers } from './settings/settings_scripts/settings_script.js';
import { resolveImageScript } from './settings/settings_scripts/image/image_scripts.js';
import {
  getSettingsScriptSection,
  resolveControls,
  resolveControlValues,
} from './settings/settings_scripts/settings_scripts_store.js';
import {
  IMAGE_GENERATION_SECTION_ID,
  makeTextFileGroupKey,
} from './settings/settings_scripts/settings_scripts_state.js';
import type { ImagePromptType } from './settings/settings_scripts/image/image_script_types';

const IMAGE_GENERATION_RETRY_HINT =
  'The backend server might not be running or the image provider might be unavailable.';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read generated image.'));
    reader.readAsDataURL(blob);
  });
}

async function dispatchImageGeneration(
  prompt: string,
  promptType: ImagePromptType,
  options: { abortSignal?: AbortSignal | undefined } = {}
): Promise<Blob> {
  return runWithInteractiveRetry({
    operationType: 'api.generate_image',
    hint: IMAGE_GENERATION_RETRY_HINT,
    signal: options.abortSignal,
    run: async () => {
      const section = getSettingsScriptSection(IMAGE_GENERATION_SECTION_ID);
      const resolved = resolveImageScript(section.selectedScriptId, section.customScriptSource);
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }

      const stored = section.controlValues[section.selectedScriptId];
      const controls = resolveControls(resolved.script.controls, {
        controlValues: stored ?? {},
        buttonData: {},
      });

      const controlValues = resolveControlValues(controls, stored);

      const helpers: SettingsScriptHelpers = {
        proxiedFetch: createProxiedFetch(options.abortSignal),
        abortSignal: options.abortSignal,
        loadUserTextFile: (controlId, fileId) =>
          loadUserTextFileContent(
            makeTextFileGroupKey(IMAGE_GENERATION_SECTION_ID, section.selectedScriptId, controlId),
            fileId
          ),
      };

      const results = await resolved.script.generateImages(
        controlValues,
        { prompt, context: { promptType } },
        helpers
      );
      const firstStream = results[0]?.readableStream;
      assertNonNullish(firstStream, 'Image generation returned no image data.');

      const bytes = await new Response(firstStream).arrayBuffer();
      return new Blob([bytes], { type: 'image/png' });
    },
  });
}

function getCharacterWardrobeTags(character: Pick<Character, 'wardrobes'>): string {
  return character.wardrobes
    .filter((wardrobe) => wardrobe.enabled)
    .map((wardrobe) => wardrobe.text.trim())
    .filter(Boolean)
    .join(', ');
}

export async function generateCharacterCard(character: Character): Promise<string> {
  const characterWithFirstWardrobe = {
    ...character,
    wardrobes: character.wardrobes.map((wardrobe, index) => ({
      ...wardrobe,
      enabled: index === 0,
    })),
  };

  const prompt = buildFullPrompt(characterWithFirstWardrobe);
  const blob = await dispatchImageGeneration(prompt, 'character_card');

  return blobToDataUrl(blob);
}

export function buildAppearanceTags(character: Character): string {
  return [character.baseAppearanceTags, getCharacterWardrobeTags(character)].filter(Boolean).join(',');
}

export function buildFullPrompt(character: Character, scenePrompt?: string): string {
  return [useSettingsStore.getState().imagePromptPrefix, buildAppearanceTags(character), scenePrompt]
    .filter(Boolean)
    .join(',');
}

export async function generateChatImage({
  fullPrompt,
  saveTo,
  abortSignal,
}: {
  fullPrompt: string;
  saveTo: string;
  abortSignal?: AbortSignal;
}): Promise<string[]> {
  const blob = await dispatchImageGeneration(fullPrompt, 'scene', { abortSignal });
  const filePath = `/api/files/${saveTo}`;
  await Api.putFile(filePath, blob, 'image/png');

  return [filePath];
}
