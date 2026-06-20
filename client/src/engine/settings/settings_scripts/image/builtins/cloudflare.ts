import type { ImageGenerationSettingsScript } from '../image_script_types';

export const cloudflareImageScript: ImageGenerationSettingsScript = {
  id: 'cloudflare-workers-ai',
  name: 'Cloudflare Workers AI',
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
      type: 'dropdown_select',
      label: 'Model',
      width: 'full',
      default: '@cf/black-forest-labs/flux-1-schnell',
      tooltipHtml:
        'FLUX models are fast/high-quality, output JPEG (re-encoded to PNG here), and <i>ignore</i> width/height/guidance/negative prompt. Stable Diffusion models output PNG and honour all of those, with up to 20 steps.',
      options: [
        { name: 'FLUX.1 [schnell] (fast, recommended)', value: '@cf/black-forest-labs/flux-1-schnell' },
        { name: 'Stable Diffusion XL Base 1.0', value: '@cf/stabilityai/stable-diffusion-xl-base-1.0' },
        { name: 'SDXL Lightning (ByteDance)', value: '@cf/bytedance/stable-diffusion-xl-lightning' },
        { name: 'DreamShaper 8 LCM', value: '@cf/lykon/dreamshaper-8-lcm' },
      ],
    },
    {
      id: 'sceneWidth',
      type: 'number',
      label: 'Chat image width (px)',
      default: '1024',
      min: 256,
      max: 2048,
      step: 64,
      tooltipHtml: 'Used for in-chat scene images (Stable Diffusion models only).',
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
      tooltipHtml: 'Used for character card portraits (Stable Diffusion models only).',
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
      tooltipHtml:
        'Diffusion steps. Automatically clamped to the model limit: FLUX caps at 8, Stable Diffusion at 20.',
    },
    {
      id: 'guidance',
      type: 'number',
      label: 'Guidance (SD only)',
      default: '7.5',
      min: 0,
      max: 20,
      step: 0.5,
      tooltipHtml:
        'How strongly the image should follow the prompt. Used by Stable Diffusion models; ignored by FLUX.',
    },
    {
      id: 'negativePrompt',
      type: 'string',
      label: 'Negative prompt (SD only)',
      width: 'full',
      placeholder: 'blurry, lowres, extra limbs, watermark, text',
      tooltipHtml: 'Things to avoid. Used by Stable Diffusion models; ignored by FLUX.',
    },
    {
      id: 'seed',
      type: 'number',
      label: 'Seed (blank = random)',
      placeholder: 'leave blank for random',
      tooltipHtml: 'Fix a number to make generations reproducible. Leave blank for a random seed each time.',
    },
    { id: 'testConnection', type: 'button', title: 'Test Connection (will generate small image)' },
  ],

  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId !== 'testConnection') {
      return { result: 'failure', resultDescription: `Unknown button: ${buttonId}` };
    }
    const accountId = controlValues.accountId?.trim() ?? '';
    const apiToken = controlValues.apiToken?.trim() ?? '';
    const model = controlValues.model || '@cf/black-forest-labs/flux-1-schnell';
    if (!accountId)
      return { result: 'failure', resultDescription: 'Enter your Cloudflare Account ID first.' };
    if (!apiToken) return { result: 'failure', resultDescription: 'Enter your Cloudflare API token first.' };

    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
    try {
      const response = await helpers.proxiedFetch(url, {
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
      const text = await response.text().catch(() => '');
      let detail = '';
      try {
        detail = (
          JSON.parse(text)
            ?.errors?.map((e: Error) => e?.message)
            .filter(Boolean) ?? []
        ).join('; ');
      } catch {
        /* not JSON */
      }
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
    const model = controlValues.model || '@cf/black-forest-labs/flux-1-schnell';
    if (!accountId) throw new Error('Cloudflare Account ID is required.');
    if (!apiToken) throw new Error('Cloudflare API token is required.');

    // promptType may be a plain string or an object with .promptType depending on context.
    const promptType = request.context?.promptType ?? request.context ?? 'scene';
    const isCard = promptType === 'character_card';
    const isFlux = /flux/i.test(model);

    const num = <TFallbackType>(v: string | undefined, fallback: TFallbackType) => {
      const t = v?.trim() ?? '';
      if (t === '') return fallback;
      const n = Number(t);
      return Number.isFinite(n) ? n : fallback;
    };

    const width = isCard ? num(controlValues.cardWidth, 832) : num(controlValues.sceneWidth, 1216);
    const height = isCard ? num(controlValues.cardHeight, 1216) : num(controlValues.sceneHeight, 832);
    const steps = num(controlValues.steps, isFlux ? 8 : 20);
    const seed = num(controlValues.seed, null);

    const body: Record<string, unknown> = { prompt: request.prompt };
    if (seed !== null) body.seed = Math.trunc(seed);
    if (isFlux) {
      body.steps = Math.max(1, Math.min(8, Math.round(steps)));
    } else {
      body.num_steps = Math.max(1, Math.min(20, Math.round(steps)));
      body.guidance = num(controlValues.guidance, 7.5);
      body.width = Math.round(width);
      body.height = Math.round(height);
      const neg = controlValues.negativePrompt?.trim();
      if (neg) body.negative_prompt = neg;
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
    const response = await helpers.proxiedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let detail = text.slice(0, 300);
      try {
        const msgs =
          JSON.parse(text)
            ?.errors?.map((e: Error) => e?.message)
            .filter(Boolean) ?? [];
        if (msgs.length) detail = msgs.join('; ');
      } catch {
        /* not JSON, keep raw text */
      }
      throw new Error(
        `Cloudflare image generation failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`
      );
    }

    // Stable Diffusion family: raw image bytes (already PNG) -> stream straight through.
    if ((response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) {
      const body = response.body;
      if (!body) {
        throw new Error(`Response without body from CloudFlare`);
      }

      return [{ readableStream: body }];
    }

    // FLUX family / JSON envelope: { result: { image: "<base64>" } }
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
