import z from 'zod';

const DEFAULT_AUTOMATIC1111_IMAGE_API_URL = 'http://127.0.0.1:7860/sdapi/v1/txt2img';
const DEFAULT_OPENAI_COMPLETIONS_IMAGE_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const imageApiShapeSchema = z.enum(['automatic1111', 'openai']);
export type ImageApiShape = z.infer<typeof imageApiShapeSchema>;

export const automatic1111SettingsSchema = z.object({
  url: z.string(),
  authToken: z.string(),
  metaOptions: z.string(),
  sizeOptions: z.object({
    chatImageWidth: z.number(),
    chatImageHeight: z.number(),
    cardImageWidth: z.number(),
    cardImageHeight: z.number(),
  }),
});

export type Automatic1111ImageAPISettings = z.infer<typeof automatic1111SettingsSchema>;

export const openaiSettingsSchema = z.object({
  url: z.string(),
  authToken: z.string(),
  metaOptions: z.string(),
  sizeOptions: z.object({
    chatImageSize: z.string(),
    chatImageAspectRatio: z.string(),
    cardImageSize: z.string(),
    cardImageAspectRatio: z.string(),
  }),
});

export type OpenAIImageAPISettings = z.infer<typeof openaiSettingsSchema>;

export const imageApiShapes = [
  {
    shape: 'automatic1111',
    label: 'AUTOMATIC1111',
    defaultSettings: {
      url: DEFAULT_AUTOMATIC1111_IMAGE_API_URL,
      authToken: '',
      sizeOptions: {
        chatImageWidth: 1024,
        chatImageHeight: 1024,
        cardImageWidth: 512,
        cardImageHeight: 768,
      },
      metaOptions: JSON.stringify(
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
      ),
    } satisfies Automatic1111ImageAPISettings,
  },
  {
    shape: 'openai',
    label: 'OpenAI Compatible Completions (incl. OpenRouter)',
    defaultSettings: {
      url: DEFAULT_OPENAI_COMPLETIONS_IMAGE_API_URL,
      authToken: '',
      metaOptions: JSON.stringify(
        {
          n: 1,
          response_format: 'b64_json',
        },
        null,
        2
      ),
      sizeOptions: {
        chatImageSize: '1K',
        chatImageAspectRatio: '1:1',
        cardImageSize: '1K',
        cardImageAspectRatio: '2:3',
      },
    } satisfies OpenAIImageAPISettings,
  },
] as const;
