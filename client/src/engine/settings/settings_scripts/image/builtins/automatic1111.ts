import type { ImageGenerationSettingsScript } from '../image_script_types.js';
import {
  authHeader,
  base64ToBytes,
  bytesToStream,
  readErrorText,
  stripBase64Prefix,
  testConnectionViaProxy,
} from './shared.js';

const DEFAULT_URL = 'http://127.0.0.1:5001/sdui/sdapi/v1/txt2img';

const DEFAULT_META_OPTIONS = JSON.stringify(
  {
    steps: 28,
    sampler_name: 'DPM++ 2M',
    cfg_scale: 5.5,
    batch_size: 1,
    negative_prompt:
      '(low quality, worst quality:1.5), (bad anatomy), lowres, bad composition, fewer digits, text, username, logo, inaccurate eyes, extra digits, fewer digits, extra arms, disfigured, missing arms, too many fingers, fused fingers, missing fingers',
  },
  null,
  2
);

const API_URL_TOOLTIP =
  'Image API endpoint URL. For AUTOMATIC1111, typically the <code>/sdapi/v1/txt2img</code> endpoint.';
const AUTH_TOKEN_TOOLTIP =
  'Optional bearer token sent as <code>Authorization: Bearer &lt;token&gt;</code>. Usually not needed for local AUTOMATIC1111.';
const MODEL_TOOLTIP = 'Optional <code>model</code> field merged into each request body.';
const META_OPTIONS_TOOLTIP =
  'Extra JSON fields merged into every request, e.g. <code>steps</code>, <code>sampler_name</code>, <code>cfg_scale</code>.';

function dimension(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function testConnectionUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.pathname = parsed.pathname.replace(/\/sdapi\/v1\/txt2img$/, '') || '/';
  return parsed.toString();
}

export const automatic1111Script: ImageGenerationSettingsScript = {
  id: 'automatic1111',
  name: 'AUTOMATIC1111 Style',
  ftueControlIds: ['url', 'authToken', 'testConnection'],
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
      placeholder: '',
      tooltipHtml: MODEL_TOOLTIP,
    },
    {
      id: 'metaOptions',
      type: 'json',
      label: 'Meta Options (JSON)',
      default: DEFAULT_META_OPTIONS,
      width: 'full',
      tooltipHtml: META_OPTIONS_TOOLTIP,
    },
    {
      id: 'chatImageWidth',
      type: 'number',
      label: 'Chat image width (px)',
      default: '1024',
      min: 1,
      tooltipHtml: 'Target width (in pixels) for generated chat images.',
    },
    {
      id: 'chatImageHeight',
      type: 'number',
      label: 'Chat image height (px)',
      default: '1024',
      min: 1,
      tooltipHtml: 'Target height (in pixels) for generated chat images.',
    },
    {
      id: 'cardImageWidth',
      type: 'number',
      label: 'Character card width (px)',
      default: '512',
      min: 1,
      tooltipHtml: 'Target width (in pixels) for character card image generation.',
    },
    {
      id: 'cardImageHeight',
      type: 'number',
      label: 'Character card height (px)',
      default: '768',
      min: 1,
      tooltipHtml: 'Target height (in pixels) for character card image generation.',
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
      ...metaOptions,
      ...(model ? { model } : {}),
      prompt,
      width: dimension(isCard ? controlValues.cardImageWidth : controlValues.chatImageWidth),
      height: dimension(isCard ? controlValues.cardImageHeight : controlValues.chatImageHeight),
    };

    const response = await helpers.proxiedFetch(controlValues.url ?? '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(controlValues.authToken) },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await readErrorText(response, 'image generation'));
    }

    const data = (await response.json()) as { images?: string[] };
    const images = Array.isArray(data.images) ? data.images : [];

    return images.map((image) => ({
      readableStream: bytesToStream(base64ToBytes(stripBase64Prefix(image))),
    }));
  },
};
