export const cloudflareImageScript = {
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
      label: 'Scene width',
      default: '1216',
      min: 256,
      max: 2048,
      step: 64,
      tooltipHtml: 'Used for in-chat scene images (Stable Diffusion models only).',
    },
    {
      id: 'sceneHeight',
      type: 'number',
      label: 'Scene height',
      default: '832',
      min: 256,
      max: 2048,
      step: 64,
    },
    {
      id: 'cardWidth',
      type: 'number',
      label: 'Card width',
      default: '832',
      min: 256,
      max: 2048,
      step: 64,
      tooltipHtml: 'Used for character card portraits (Stable Diffusion models only).',
    },
    {
      id: 'cardHeight',
      type: 'number',
      label: 'Card height',
      default: '1216',
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
    { id: 'testConnection', type: 'button', title: 'Test Connection' },
  ],

  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId !== 'testConnection') {
      return { result: 'failure', resultDescription: 'Unknown button: ' + buttonId };
    }
    const accountId = (controlValues.accountId || '').trim();
    const apiToken = (controlValues.apiToken || '').trim();
    const model = controlValues.model || '@cf/black-forest-labs/flux-1-schnell';
    if (!accountId)
      return { result: 'failure', resultDescription: 'Enter your Cloudflare Account ID first.' };
    if (!apiToken) return { result: 'failure', resultDescription: 'Enter your Cloudflare API token first.' };

    const url =
      'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/ai/run/' + model;
    try {
      const response = await helpers.proxiedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiToken },
        body: JSON.stringify({ prompt: 'a small red circle on a white background' }),
      });
      if (response.ok) {
        return {
          result: 'success',
          resultDescription:
            'Connected to Cloudflare Workers AI and generated a test image with ' + model + '.',
        };
      }
      let detail = 'HTTP ' + response.status;
      try {
        const t = await response.text();
        try {
          const j = JSON.parse(t);
          const msgs = (j.errors || [])
            .map(function (e) {
              return e && e.message;
            })
            .filter(Boolean);
          if (msgs.length) detail += ' \u2013 ' + msgs.join('; ');
          else if (t) detail += ' \u2013 ' + t.slice(0, 200);
        } catch (e) {
          if (t) detail += ' \u2013 ' + t.slice(0, 200);
        }
      } catch (e) {}
      return { result: 'failure', resultDescription: 'Connection failed: ' + detail };
    } catch (e) {
      return {
        result: 'failure',
        resultDescription: 'Connection failed: ' + (e && e.message ? e.message : String(e)),
      };
    }
  },

  async generateImages(controlValues, request, helpers) {
    const accountId = (controlValues.accountId || '').trim();
    const apiToken = (controlValues.apiToken || '').trim();
    const model = controlValues.model || '@cf/black-forest-labs/flux-1-schnell';
    if (!accountId) throw new Error('Cloudflare Account ID is required.');
    if (!apiToken) throw new Error('Cloudflare API token is required.');

    // promptType may be a plain string or an object with .promptType depending on context.
    const promptType = (request.context && request.context.promptType) || request.context || 'scene';
    const isCard = promptType === 'character_card';
    const isFlux = /flux/i.test(model);

    const num = function (v, fallback) {
      if (v === undefined || v === null || String(v).trim() === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const width = isCard ? num(controlValues.cardWidth, 832) : num(controlValues.sceneWidth, 1216);
    const height = isCard ? num(controlValues.cardHeight, 1216) : num(controlValues.sceneHeight, 832);
    const stepsRaw = num(controlValues.steps, isFlux ? 8 : 20);
    const guidance = num(controlValues.guidance, 7.5);
    const seedRaw = (controlValues.seed || '').trim();

    const body = { prompt: request.prompt };
    if (seedRaw !== '') {
      const s = Number(seedRaw);
      if (Number.isFinite(s)) body.seed = Math.trunc(s);
    }
    if (isFlux) {
      body.steps = Math.max(1, Math.min(8, Math.round(stepsRaw)));
    } else {
      body.num_steps = Math.max(1, Math.min(20, Math.round(stepsRaw)));
      body.guidance = guidance;
      body.width = Math.round(width);
      body.height = Math.round(height);
      const neg = (controlValues.negativePrompt || '').trim();
      if (neg) body.negative_prompt = neg;
    }

    const url =
      'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/ai/run/' + model;
    const response = await helpers.proxiedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = 'HTTP ' + response.status;
      try {
        const errText = await response.text();
        try {
          const errJson = JSON.parse(errText);
          const msgs = (errJson.errors || [])
            .map(function (e) {
              return e && e.message;
            })
            .filter(Boolean);
          if (msgs.length) detail += ' \u2013 ' + msgs.join('; ');
          else if (errText) detail += ' \u2013 ' + errText.slice(0, 300);
        } catch (e) {
          if (errText) detail += ' \u2013 ' + errText.slice(0, 300);
        }
      } catch (e) {}
      throw new Error('Cloudflare image generation failed: ' + detail);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    // Stable Diffusion family: raw image bytes (already PNG) -> stream straight through.
    if (contentType.indexOf('image/') === 0) {
      return [{ readableStream: response.body }];
    }

    // FLUX family / JSON envelope: { result: { image: "<base64>" } }
    const data = await response.json();
    const base64 = (data && data.result && data.result.image) || (data && data.image);
    if (!base64) {
      throw new Error('Cloudflare response did not contain image data.');
    }

    const clean = String(base64).indexOf(',') !== -1 ? String(base64).split(',').pop() : String(base64);
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // FLUX returns JPEG; re-encode to PNG (best effort) so saved files match the assumed format.
    try {
      if (typeof document !== 'undefined' && typeof createImageBitmap !== 'undefined') {
        const bitmap = await createImageBitmap(new Blob([bytes]));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        if (bitmap.close) bitmap.close();
        const pngBlob = await new Promise(function (resolve, reject) {
          canvas.toBlob(function (b) {
            b ? resolve(b) : reject(new Error('PNG encode failed'));
          }, 'image/png');
        });
        return [{ readableStream: pngBlob.stream ? pngBlob.stream() : new Response(pngBlob).body }];
      }
    } catch (e) {
      // Fall through to returning the raw decoded bytes.
    }
    return [{ readableStream: new Response(bytes).body }];
  },
};
