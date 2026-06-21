import type { ImageGenerationSettingsScript } from '../image_script_types';

const DEFAULT_MODEL = '@cf/black-forest-labs/flux-1-schnell';

const buildEndpoint = (accountId: string, model: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;

/** Pull a human-readable detail out of a Cloudflare error response body. */
const extractErrorDetail = (text: string): string => {
  try {
    const messages: string[] =
      JSON.parse(text)
        ?.errors?.map((e: { message?: string }) => e?.message)
        .filter(Boolean) ?? [];
    if (messages.length) return messages.join('; ');
  } catch {
    /* not JSON, fall through to the raw text */
  }
  return text.slice(0, 300);
};

export const cloudflareImageScript: ImageGenerationSettingsScript = {
  id: 'cloudflare-workers-ai',
  name: 'Cloudflare Workers AI',
  ftueControlIds: ['accountId', 'apiToken', 'testConnection', 'model'],
  controls: () => [
    {
      id: 'accountId',
      type: 'string',
      label: 'Cloudflare Account ID',
      width: 'full',
      placeholder: 'e.g. 0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p',
      tooltipHtml:
        'Found in the Cloudflare dashboard on the <b>Workers &amp; Pages</b> overview page (right sidebar), or in the dashboard URL after <code>/accounts/</code>.',
    },
    {
      id: 'apiToken',
      type: 'password',
      label: 'API Token',
      width: 'full',
      tooltipHtml:
        'Create at dash.cloudflare.com &rarr; <b>My Profile</b> &rarr; <b>API Tokens</b>. The token needs the <b>Workers AI</b> permission (Read &amp; Run / Edit).',
    },
    {
      id: 'model',
      type: 'string',
      label: 'Model',
      width: 'full',
      default: DEFAULT_MODEL,
      placeholder: DEFAULT_MODEL,
      tooltipHtml:
        'Any Workers AI <b>text-to-image</b> model ID, e.g. @cf/black-forest-labs/flux-1-schnell<br />Browse the full catalog <a href="https://developers.cloudflare.com/workers-ai/models/?tasks=Text-to-Image">here</a>',
    },
    {
      id: 'sceneWidth',
      type: 'number',
      label: 'Chat image width (px)',
      default: '1024',
      min: 256,
      max: 2048,
      step: 64,
      tooltipHtml: 'Used for in-chat scene images (Stable Diffusion style only).',
    },
    {
      id: 'sceneHeight',
      type: 'number',
      label: 'Chat image height (px)',
      default: '1024',
      min: 256,
      max: 2048,
      step: 64,
    },
    {
      id: 'cardWidth',
      type: 'number',
      label: 'Character card width (px)',
      default: '512',
      min: 256,
      max: 2048,
      step: 64,
      tooltipHtml: 'Used for character card portraits (Stable Diffusion style only).',
    },
    {
      id: 'cardHeight',
      type: 'number',
      label: 'Character card height',
      default: '768',
      min: 256,
      max: 2048,
      step: 64,
    },
    {
      id: 'steps',
      type: 'number',
      label: 'Steps',
      default: '20',
      min: 1,
      max: 20,
      step: 1,
      tooltipHtml: 'Diffusion steps. The max for FLUX models is 8, Stable Diffusion is 20.',
    },
    {
      id: 'guidance',
      type: 'number',
      label: 'Guidance (CFG Scale)',
      default: '7.5',
      min: 0,
      max: 20,
      step: 0.5,
      tooltipHtml:
        'How strongly the image should follow the prompt. Sent in Stable Diffusion style; ignored for FLUX.',
    },
    {
      id: 'seed',
      type: 'number',
      label: 'Seed (blank = random)',
      placeholder: 'leave blank for random',
      tooltipHtml: 'Fix a number to make generations reproducible. Leave blank for a random seed each time.',
    },
    {
      id: 'negativePrompt',
      type: 'string',
      label: 'Negative prompt (SD style only)',
      width: 'full',
      placeholder: 'blurry, lowres, extra limbs, watermark, text',
      tooltipHtml: 'Things to avoid. Sent in Stable Diffusion style; ignored for FLUX.',
    },
    { id: 'testConnection', type: 'button', title: 'Generate Test Image' },
  ],

  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId !== 'testConnection') {
      return { result: 'failure', resultDescription: `Unknown button: ${buttonId}` };
    }
    const accountId = controlValues.accountId?.trim() ?? '';
    const apiToken = controlValues.apiToken?.trim() ?? '';
    const model = controlValues.model?.trim() || DEFAULT_MODEL;
    if (!accountId)
      return { result: 'failure', resultDescription: 'Enter your Cloudflare Account ID first.' };
    if (!apiToken) return { result: 'failure', resultDescription: 'Enter your Cloudflare API token first.' };

    try {
      const response = await helpers.proxiedFetch(buildEndpoint(accountId, model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ prompt: 'a small image' }),
      });
      if (response.ok) {
        return {
          result: 'success',
          resultDescription: `Connected to Workers AI and generated a test image with ${model}.`,
        };
      }
      const detail = extractErrorDetail(await response.text().catch(() => ''));
      return {
        result: 'failure',
        resultDescription: `Connection failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`,
      };
    } catch (e) {
      return {
        result: 'failure',
        resultDescription: `Connection failed: ${(e as Error | undefined)?.message ?? String(e)}`,
      };
    }
  },

  async generateImages(controlValues, request, helpers) {
    const accountId = controlValues.accountId?.trim() ?? '';
    const apiToken = controlValues.apiToken?.trim() ?? '';
    const model = controlValues.model?.trim() || DEFAULT_MODEL;
    if (!accountId) throw new Error('Cloudflare Account ID is required.');
    if (!apiToken) throw new Error('Cloudflare API token is required.');

    // promptType may be a plain string or an object with .promptType depending on context.
    const promptType = request.context?.promptType ?? request.context ?? 'scene';
    const isCard = promptType === 'character_card';

    const num = <TFallbackType>(v: string | undefined, fallback: TFallbackType) => {
      const t = v?.trim() ?? '';
      if (t === '') return fallback;
      const n = Number(t);
      return Number.isFinite(n) ? n : fallback;
    };

    const width = isCard ? num(controlValues.cardWidth, 512) : num(controlValues.sceneWidth, 1024);
    const height = isCard ? num(controlValues.cardHeight, 768) : num(controlValues.sceneHeight, 1024);
    const steps = num(controlValues.steps, 8);
    const seed = num(controlValues.seed, null);

    const body: Record<string, unknown> = { prompt: request.prompt };
    if (seed !== null) body.seed = Math.trunc(seed);
    body.steps = Math.max(1, Math.min(8, Math.round(steps)));
    body.num_steps = Math.max(1, Math.min(20, Math.round(steps)));
    body.guidance = num(controlValues.guidance, 7.5);
    body.width = Math.round(width);
    body.height = Math.round(height);
    const neg = controlValues.negativePrompt?.trim();
    if (neg) body.negative_prompt = neg;

    const response = await helpers.proxiedFetch(buildEndpoint(accountId, model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = extractErrorDetail(await response.text().catch(() => ''));
      throw new Error(
        `Cloudflare image generation failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`
      );
    }

    // Output format is read from the actual response, not assumed from the chosen style:
    // Stable Diffusion returns raw image bytes (already PNG) -> stream straight through.
    if ((response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) {
      const body = response.body;
      if (!body) {
        throw new Error('Response without body from Cloudflare');
      }
      return [{ readableStream: body }];
    }

    // FLUX returns a JSON envelope: { result: { image: "<base64>" } }
    const data = await response.json();
    const base64 = data?.result?.image ?? data?.image;
    if (!base64) throw new Error('Cloudflare response did not contain image data.');

    const bytes = Uint8Array.from(atob(base64.includes(',') ? base64.split(',').pop() : base64), (c) =>
      c.charCodeAt(0)
    );

    // FLUX returns JPEG; re-encode to a real PNG so Yozakura can write its metadata into it.
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
    );

    const readableStream = pngBlob.stream?.() ?? new Response(pngBlob).body;
    return [{ readableStream }];
  },
};
