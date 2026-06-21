import type { ImageGenerationSettingsScript } from '../image_script_types.js';
import { authHeader, readErrorText, testConnectionViaProxy, urlToImageStream } from './shared.js';

const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SIZE_OPTIONS = [
  { name: '0.5K (Gemini Only)', value: '0.5K' },
  { name: '1K (Standard Res)', value: '1K' },
  { name: '2K (High Res)', value: '2K' },
  { name: '4K (Ultra Res)', value: '4K' },
];

const ASPECT_OPTIONS = [
  { name: '1:1', value: '1:1' },
  { name: '2:3', value: '2:3' },
  { name: '3:2', value: '3:2' },
  { name: '3:4', value: '3:4' },
  { name: '4:3', value: '4:3' },
  { name: '4:5', value: '4:5' },
  { name: '5:4', value: '5:4' },
  { name: '9:16', value: '9:16' },
  { name: '16:9', value: '16:9' },
  { name: '21:9', value: '21:9' },
  { name: '1:4 (Gemini Only)', value: '1:4' },
  { name: '4:1 (Gemini Only)', value: '4:1' },
  { name: '1:8 (Gemini Only)', value: '1:8' },
  { name: '8:1 (Gemini Only)', value: '8:1' },
];

const API_URL_TOOLTIP =
  'Image API endpoint URL. For OpenRouter (or similar), use the <code>/v1/chat/completions</code> endpoint.';
const AUTH_TOKEN_TOOLTIP =
  'Optional bearer token sent as <code>Authorization: Bearer &lt;token&gt;</code>. Required for most cloud providers.';
const MODEL_TOOLTIP =
  'The image model to request (for example <code>x-ai/grok-imagine-image-quality</code>).';
const META_OPTIONS_TOOLTIP = 'Extra JSON fields merged into every image generation request.';

function testConnectionUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.pathname = parsed.pathname.replace(/\/v1\/chat\/completions$/, '/v1/models');
  return parsed.toString();
}

export const openRouterScript: ImageGenerationSettingsScript = {
  id: 'openRouter',
  name: 'OpenAI Completions Style (Including OpenRouter and Similar)',
  ftueControlIds: ['url', 'authToken', 'model', 'testConnection'],
  controls: () => [
    {
      id: 'url',
      type: 'string',
      label: 'Image API URL',
      default: DEFAULT_URL,
      width: 'full',
      tooltipHtml: API_URL_TOOLTIP,
    },
    {
      id: 'authToken',
      type: 'password',
      label: 'Bearer Token (optional)',
      width: 'full',
      tooltipHtml: AUTH_TOKEN_TOOLTIP,
    },
    {
      id: 'model',
      type: 'string',
      label: 'Model (optional)',
      width: 'full',
      placeholder: 'x-ai/grok-imagine-image-quality',
      tooltipHtml: MODEL_TOOLTIP,
    },
    {
      id: 'metaOptions',
      type: 'json',
      label: 'Meta Options (JSON)',
      default: '{}',
      width: 'full',
      tooltipHtml: META_OPTIONS_TOOLTIP,
    },
    {
      id: 'chatImageSize',
      type: 'dropdown_select',
      label: 'Chat Image Size',
      default: '1K',
      options: SIZE_OPTIONS,
    },
    {
      id: 'chatImageAspectRatio',
      type: 'dropdown_select',
      label: 'Chat Image Aspect Ratio',
      default: '1:1',
      options: ASPECT_OPTIONS,
    },
    {
      id: 'cardImageSize',
      type: 'dropdown_select',
      label: 'Card Image Size',
      default: '1K',
      options: SIZE_OPTIONS,
    },
    {
      id: 'cardImageAspectRatio',
      type: 'dropdown_select',
      label: 'Card Image Aspect Ratio',
      default: '2:3',
      options: ASPECT_OPTIONS,
    },
    { id: 'testConnection', type: 'button', title: 'Test Connection' },
  ],

  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId === 'testConnection') {
      return testConnectionViaProxy(
        testConnectionUrl(controlValues.url ?? ''),
        controlValues.authToken,
        helpers
      );
    }
    return { result: 'failure', resultDescription: `Unknown button: ${buttonId}` };
  },

  async generateImages(controlValues, { prompt, context }, helpers) {
    const metaOptions = JSON.parse(controlValues.metaOptions ?? '{}');
    const isCard = context.promptType === 'character_card';
    const model = controlValues.model?.trim();

    const body = {
      modalities: ['image'],
      image_config: {
        aspect_ratio: isCard ? controlValues.cardImageAspectRatio : controlValues.chatImageAspectRatio,
        image_size: isCard ? controlValues.cardImageSize : controlValues.chatImageSize,
      },
      model,
      messages: [{ role: 'user', content: prompt }],
      ...metaOptions,
    };

    const response = await helpers.proxiedFetch(controlValues.url ?? '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(controlValues.authToken) },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await readErrorText(response, 'image generation'));
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };

    const urls = (data.choices ?? []).flatMap((choice) =>
      (choice.message?.images ?? []).flatMap((image) => (image.image_url?.url ? [image.image_url.url] : []))
    );

    return Promise.all(urls.map(async (url) => ({ readableStream: await urlToImageStream(url, helpers) })));
  },
};
