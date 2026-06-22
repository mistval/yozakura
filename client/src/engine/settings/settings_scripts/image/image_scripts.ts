import { getErrorMessage } from '../../../../errors/error_util.js';
import { automatic1111Script } from './builtins/automatic1111.js';
import { openRouterScript } from './builtins/open_router.js';
import {
  imageGenerationSettingsScriptSchema,
  type ImageGenerationSettingsScript,
} from './image_script_types.js';
import { openAiImageGenerationsImageScript } from './builtins/open_ai_generations.js';
import { comfyuiScript } from './builtins/comfyui.js';
import { cloudflareImageScript } from './builtins/cloudflare.js';

export const BUILTIN_IMAGE_SCRIPTS: ImageGenerationSettingsScript[] = [
  automatic1111Script,
  openRouterScript,
  openAiImageGenerationsImageScript,
  comfyuiScript,
  cloudflareImageScript,
];

export function getBuiltinImageScript(scriptId: string): ImageGenerationSettingsScript | undefined {
  return BUILTIN_IMAGE_SCRIPTS.find((script) => script.id === scriptId);
}

export function getImageScriptOptions(): Array<{ value: string; label: string }> {
  return BUILTIN_IMAGE_SCRIPTS.map((script) => ({ value: script.id, label: script.name }));
}

export function evaluateCustomImageScript(source: string): ImageGenerationSettingsScript {
  const factory = new Function(`return (${source});`);
  const candidate: unknown = factory();
  return validateImageGenerationSettingsScript(candidate);
}

export type ResolvedImageScript =
  | { ok: true; script: ImageGenerationSettingsScript }
  | { ok: false; error: string };

export function resolveImageScript(selectedScriptId: string, source: string): ResolvedImageScript {
  const builtin = getBuiltinImageScript(selectedScriptId);
  if (builtin) {
    return { ok: true, script: builtin };
  }

  if (!source.trim()) {
    return { ok: false, error: 'Enter a custom script to configure this provider.' };
  }

  try {
    return { ok: true, script: evaluateCustomImageScript(source) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export function validateImageGenerationSettingsScript(candidate: unknown): ImageGenerationSettingsScript {
  const parsed = imageGenerationSettingsScriptSchema.parse(candidate);

  if (typeof parsed.generateImages !== 'function') {
    throw new Error('A settings script must export a `generateImages` function.');
  }

  if (parsed.buttonHandler !== undefined && typeof parsed.buttonHandler !== 'function') {
    throw new Error('`buttonHandler` must be a function when provided.');
  }

  if (parsed.controls !== undefined && typeof parsed.controls !== 'function') {
    throw new Error('`controls` must be a function.');
  }

  return parsed as ImageGenerationSettingsScript;
}
