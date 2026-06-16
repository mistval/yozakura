import * as Api from '../backend_bridge/api';
import { assertNonNullish } from '../errors/application_error.js';
import { useSettingsStore } from '../state/settings_store.js';
import { withPhaseTransitionGate } from '../util/phase_transition_gate.js';
import type { Character } from './types.js';

function buildImagePayload(prompt: string, style: 'chat' | 'card', saveTo?: string): Record<string, unknown> {
  const settings = useSettingsStore.getState();

  if (settings.imageApiShape === 'automatic1111') {
    const shapeSettings = settings.imageSettingsForShape.automatic1111;
    const metaOptions = JSON.parse(shapeSettings.metaOptions) as Record<string, unknown>;

    return {
      saveTo,
      imageApiUrl: shapeSettings.url,
      authToken: shapeSettings.authToken,
      imageApiShape: settings.imageApiShape,
      ...metaOptions,
      prompt,
      width:
        style === 'card'
          ? shapeSettings.sizeOptions.cardImageWidth
          : shapeSettings.sizeOptions.chatImageWidth,
      height:
        style === 'card'
          ? shapeSettings.sizeOptions.cardImageHeight
          : shapeSettings.sizeOptions.chatImageHeight,
    };
  } else {
    const shapeSettings = settings.imageSettingsForShape.openRouter;
    const metaOptions = JSON.parse(shapeSettings.metaOptions) as Record<string, unknown>;

    return {
      saveTo,
      imageApiUrl: shapeSettings.url,
      authToken: shapeSettings.authToken,
      imageApiShape: settings.imageApiShape,
      modalities: ['image'],
      image_config: {
        aspect_ratio:
          style === 'card'
            ? shapeSettings.sizeOptions.cardImageAspectRatio
            : shapeSettings.sizeOptions.chatImageAspectRatio,
        image_size:
          style === 'card'
            ? shapeSettings.sizeOptions.cardImageSize
            : shapeSettings.sizeOptions.chatImageSize,
      },
      ...metaOptions,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };
  }
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
  const payload = buildImagePayload(prompt, 'card');

  const result = await Api.generateImage(payload);
  const first = result.images?.[0];

  assertNonNullish(first, `Image API returned empty image array`);
  return `data:image/png;base64,${first}`;
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
}: {
  fullPrompt: string;
  saveTo: string;
}): Promise<string[]> {
  // Pause/abort before the image generation call, honoring the user's NPC-turn pause/stop.
  return withPhaseTransitionGate(async (signal) => {
    const payload = buildImagePayload(fullPrompt, 'chat', saveTo);
    const result = await Api.generateImage(payload, signal);

    return result.files;
  });
}
