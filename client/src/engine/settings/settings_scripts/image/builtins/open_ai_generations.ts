import type { ImageGenerationResult, ImageGenerationSettingsScript } from '../image_script_types';

export const openAiImageGenerationsImageScript: ImageGenerationSettingsScript = {
  id: 'openai-images-or-similar',
  name: 'OpenAI Images Generations Style (Including NanoGPT and Similar)',
  ftueControlIds: ['url', 'apiKey', 'model', 'testConnection'],
  controls: () => [
    {
      id: 'url',
      type: 'string',
      label: 'API URL',
      width: 'full',
      default: 'https://api.openai.com/v1/images/generations',
      tooltipHtml:
        'The image-generations endpoint, following the OpenAI Images API shape. Defaults to OpenAI; change it for any other compatible provider (e.g. <code>https://nano-gpt.com/v1/images/generations</code>).',
    },
    {
      id: 'apiKey',
      type: 'password',
      label: 'API Key',
      width: 'full',
      placeholder: 'your provider API key',
      tooltipHtml: 'Sent as an <code>Authorization: Bearer</code> token.',
    },
    {
      id: 'model',
      type: 'string',
      label: 'Model',
      width: 'full',
      default: 'gpt-image-1',
      tooltipHtml:
        'Model name for your provider, e.g. <code>gpt-image-1</code> or <code>dall-e-3</code> for OpenAI. Other providers use their own image model slugs.',
    },
    {
      id: 'sceneWidth',
      type: 'number',
      label: 'Chat image width (px)',
      default: '1536',
      min: 64,
      step: 8,
      tooltipHtml:
        'Width for in-chat scene images. Valid sizes are provider/model-specific — e.g. gpt-image-1 accepts 1024×1024, 1536×1024, 1024×1536; DALL·E 3 accepts 1024×1024, 1792×1024, 1024×1792. Use Extra parameters to override per-model if you get a 400.',
    },
    {
      id: 'sceneHeight',
      type: 'number',
      label: 'Chat image height (px)',
      default: '1024',
      min: 64,
      step: 8,
    },
    {
      id: 'cardWidth',
      type: 'number',
      label: 'Character card width (px)',
      default: '1024',
      min: 64,
      step: 8,
      tooltipHtml: 'Width for character card portraits.',
    },
    {
      id: 'cardHeight',
      type: 'number',
      label: 'Character card height (px)',
      default: '1536',
      min: 64,
      step: 8,
    },
    {
      id: 'extraParams',
      type: 'json',
      label: 'Extra parameters (JSON)',
      width: 'full',
      default: '{}',
      tooltipHtml:
        'Merged into the request body. Use for provider-specific options, e.g. <code>{ "seed": 42, "num_inference_steps": 30, "guidance_scale": 7.5 }</code>, or <code>{ "negative_prompt": "blurry, watermark" }</code> on providers that support it. These override the defaults above (including <code>size</code>).',
    },
    {
      id: 'testConnection',
      type: 'button',
      title: 'Test Connection',
    },
  ],

  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId !== 'testConnection') {
      return { result: 'failure', resultDescription: 'Unknown button: ' + buttonId };
    }
    if (!controlValues.apiKey) {
      return { result: 'failure', resultDescription: 'Please enter your API key first.' };
    }

    let modelsUrl;

    try {
      modelsUrl = controlValues.url!.replace(/images\/generations\/?$/i, 'models');
      new URL(modelsUrl); // throws if the configured URL isn't valid
    } catch (e) {
      return { result: 'failure', resultDescription: 'Invalid API URL: ' + controlValues.url };
    }

    try {
      const response = await helpers.proxiedFetch(modelsUrl, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + controlValues.apiKey },
      });

      if (response.ok) {
        return { result: 'success', resultDescription: 'Connection OK — the API key was accepted.' };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          result: 'failure',
          resultDescription: 'Authentication failed (HTTP ' + response.status + '). Check your API key.',
        };
      }
      return { result: 'failure', resultDescription: 'Unexpected response: HTTP ' + response.status };
    } catch (e) {
      return {
        result: 'failure',
        resultDescription: 'Request failed: ' + (e as Error).message,
      };
    }
  },

  async generateImages(controlValues, request, helpers): Promise<ImageGenerationResult[]> {
    const isCard = request.context.promptType === 'character_card';
    const width = Math.round(Number(isCard ? controlValues.cardWidth : controlValues.sceneWidth));
    const height = Math.round(Number(isCard ? controlValues.cardHeight : controlValues.sceneHeight));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Invalid width/height for ' + (isCard ? 'character card' : 'scene') + '.');
    }

    const body = {
      model: controlValues.model,
      prompt: request.prompt,
      n: 1,
      size: width + 'x' + height,
    };

    const rawExtra = (controlValues.extraParams || '').trim();
    if (rawExtra) {
      let extra;
      try {
        extra = JSON.parse(rawExtra);
      } catch (e) {
        const error = e as Error;
        throw new Error('Extra parameters is not valid JSON: ' + error.message);
      }
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        Object.assign(body, extra);
      }
    }

    const response = await helpers.proxiedFetch(controlValues.url!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + controlValues.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch (e) {}
      throw new Error(
        'Image generation failed: HTTP ' + response.status + (detail ? ' — ' + detail.slice(0, 500) : '')
      );
    }

    const data = await response.json();
    const item = data && Array.isArray(data.data) ? data.data[0] : undefined;
    if (!item) {
      throw new Error('The API returned no image data.');
    }

    // Hosted URL (e.g. DALL·E default): download it through the proxy and stream the bytes.
    if (item.url) {
      const imgResponse = await helpers.proxiedFetch(item.url, { method: 'GET' });
      if (!imgResponse.ok) {
        throw new Error('Failed to download generated image: HTTP ' + imgResponse.status);
      }
      return [{ readableStream: imgResponse.body! }];
    }

    if (item.b64_json) {
      const base64 = String(item.b64_json).split(',').pop();
      const binary = atob(base64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return [{ readableStream: new Response(bytes).body! }];
    }

    throw new Error('The API response contained neither a url nor b64_json.');
  },
};
