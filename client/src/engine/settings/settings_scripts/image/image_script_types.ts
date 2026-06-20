import z from 'zod';
import {
  type ButtonHandlerResult,
  type SettingsControlValues,
  type SettingsScriptControlsDefinition,
  type SettingsScriptHelpers,
} from '../settings_script';

export const imageGenerationSettingsScriptSchema = z.object({
  id: z.string().meta({
    description: 'A unique ID for this script. Can be anything, but must be unique.',
  }),
  name: z.string().meta({
    description: 'The display name of the image generation provider (AUTOMATIC1111, OpenRouter, etc).',
  }),
  controls: z.any().optional().meta({
    description:
      'A function `(context) => controls[]` returning the controls to render in the settings UI. `context` is `{ controlValues, buttonData }` (use buttonData to populate dropdowns from a button handler result, e.g. ComfyUI Connect). The user-entered value of each control is passed to generateImages and buttonHandler keyed by control id.',
  }),
  buttonHandler: z.any().optional().meta({
    description:
      'Optional async function `(buttonId, controlValues, helpers)` invoked when a button control is clicked. `controlValues` is a dictionary of id:value pairs (all strings) for the controls declared by this script. `helpers` is `{ proxiedFetch, abortSignal }` (see generateImages). Return `{ "result": "success" | "failure", "resultDescription": "<message shown to the user>" }`.',
  }),
  generateImages: z.any().meta({
    description:
      'Async function `(controlValues, request, helpers)` that performs the image generation and returns the resulting image(s). `controlValues` is a dictionary of id:value pairs (all strings) for the controls declared by this script. `request` is `{ prompt, context }`: `prompt` is the full image prompt string to send to the provider, and `context` is either "scene" (an in-chat image) or "character_card" (a character portrait); use `context` to pick the right size controls. `helpers` is `{ proxiedFetch, abortSignal }`. `proxiedFetch(url, init)` is a fetch-shaped function that routes the request through this app\'s backend to avoid browser CORS restrictions and returns a Response mirroring the upstream status, content-type and body. You may call it more than once (e.g. to download an image URL the API returns, or to poll a job). It is already wired to `abortSignal`, which is also exposed for your own async work. Return an array of result objects, each optionally carrying a `readableStream` (web ReadableStream) of image bytes. Only the first result is used currently; returning an array leaves room for batches later. PNG is assumed for saved images.',
  }),
});

export const imageGenerationSettingsScriptJSONSchema = imageGenerationSettingsScriptSchema.toJSONSchema();

export type ImagePromptType = 'scene' | 'character_card';

export type ImageGenerationRequest = {
  prompt: string;
  context: {
    promptType: ImagePromptType;
  };
};

export type ImageGenerationResult = {
  readableStream?: ReadableStream<Uint8Array> | undefined;
};

export type ImageGenerationSettingsScript = {
  id: string;
  name: string;
  controls?: SettingsScriptControlsDefinition | undefined;
  ftueControlIds?: string[] | undefined;
  buttonHandler?:
    | ((
        buttonId: string,
        controlValues: SettingsControlValues,
        helpers: SettingsScriptHelpers
      ) => Promise<ButtonHandlerResult>)
    | undefined;
  generateImages: (
    controlValues: SettingsControlValues,
    request: ImageGenerationRequest,
    helpers: SettingsScriptHelpers
  ) => Promise<ImageGenerationResult[]>;
};
