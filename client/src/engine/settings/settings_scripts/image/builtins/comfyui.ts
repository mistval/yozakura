import { getErrorMessage } from '../../../../../errors/error_util.js';
import { newId } from '../../../../../util/id.js';
import type { ControlsContext, SettingsScriptControl, SettingsScriptHelpers } from '../../settings_script.js';
import type { ImageGenerationResult, ImageGenerationSettingsScript } from '../image_script_types.js';
import { readErrorText, urlToImageStream } from './shared.js';

type ComfyOption = { name: string; value: string };

type ComfyConnectData = {
  models: ComfyOption[];
  samplers: ComfyOption[];
  schedulers: ComfyOption[];
  vaes: ComfyOption[];
};
type ComfyImageRef = { filename: string; subfolder?: string; type?: string };

type ComfyHistoryEntry = {
  status?: { status_str?: string };
  outputs?: Record<string, { images?: ComfyImageRef[] }>;
};

function baseUrl(url: string | undefined): string {
  return (url ?? '').trim().replace(/\/+$/, '');
}

function asStringArray(node: unknown): string[] {
  return Array.isArray(node) ? node.filter((item): item is string => typeof item === 'string') : [];
}

function tidyModelName(name: string): string {
  return name.replace(/\.[^.]*$/, '').replaceAll('_', ' ');
}

function extractObjectInfo(data: any): ComfyConnectData {
  const required = (className: string): any => data?.[className]?.input?.required ?? {};
  const ckpts = asStringArray(required('CheckpointLoaderSimple').ckpt_name?.[0]).map((value) => ({
    value,
    name: tidyModelName(value),
  }));

  const unets = asStringArray(required('UNETLoader').unet_name?.[0]).map((value) => ({
    value,
    name: `UNet: ${tidyModelName(value)}`,
  }));

  const ggufs = asStringArray(required('UnetLoaderGGUF').unet_name?.[0]).map((value) => ({
    value,
    name: `GGUF: ${tidyModelName(value)}`,
  }));

  const samplers = asStringArray(required('KSampler').sampler_name?.[0]).map((value) => ({
    value,
    name: value,
  }));

  const schedulers = asStringArray(required('KSampler').scheduler?.[0]).map((value) => ({
    value,
    name: value,
  }));

  const vaes = asStringArray(required('VAELoader').vae_name?.[0]).map((value) => ({ value, name: value }));

  return { models: [...ckpts, ...unets, ...ggufs], samplers, schedulers, vaes };
}

// Replaces the *quoted* token `"%key%"`: numeric values land unquoted (real numbers),
// text/string values are JSON-stringified (quoted + escaped). Missing tokens are ignored.
function substituteWorkflowTokens(
  workflow: string,
  tokens: Record<string, { value: string; numeric: boolean }>
): string {
  let result = workflow;
  for (const [key, spec] of Object.entries(tokens)) {
    const replacement = spec.numeric ? spec.value : JSON.stringify(spec.value);
    result = result.replaceAll(`"%${key}%"`, replacement);
  }

  return result;
}

function positiveIntToken(raw: string | undefined, fallback: number): string {
  const value = Math.trunc(Number(raw));
  return String(Number.isFinite(value) && value > 0 ? value : fallback);
}

function floatToken(raw: string | undefined, fallback: number): string {
  const value = Number(raw);
  return String(Number.isFinite(value) ? value : fallback);
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Image generation aborted.'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Image generation aborted.'));
      },
      { once: true }
    );
  });
}

function collectImages(outputs: ComfyHistoryEntry['outputs']): ComfyImageRef[] {
  const images: ComfyImageRef[] = [];
  for (const output of Object.values(outputs ?? {})) {
    for (const image of output.images ?? []) {
      if (image.type !== 'temp') {
        images.push(image);
      }
    }
  }
  return images;
}

async function pollForImages(
  base: string,
  promptId: string,
  helpers: SettingsScriptHelpers
): Promise<ComfyImageRef[]> {
  const timeoutMs = 3 * 60 * 1000;
  const intervalMs = 1000;
  const startedAt = Date.now();

  while (true) {
    if (helpers.abortSignal?.aborted) {
      throw new Error('Image generation aborted.');
    }

    const response = await helpers.proxiedFetch(`${base}/history/${promptId}`, { method: 'GET' });
    if (response.ok) {
      const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
      const entry = history[promptId];
      if (entry) {
        if (entry.status?.status_str === 'error') {
          throw new Error('ComfyUI reported an execution error. Check the ComfyUI console for details.');
        }

        const images = collectImages(entry.outputs);
        if (images.length > 0) {
          return images;
        }

        throw new Error('ComfyUI finished but produced no images. Ensure the workflow has a SaveImage node.');
      }
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for ComfyUI to finish (3 minutes).');
    }

    await delay(intervalMs, helpers.abortSignal);
  }
}

function comfyControls({ buttonData }: ControlsContext): SettingsScriptControl[] {
  const connect = (buttonData.connect ?? {}) as Partial<ComfyConnectData>;

  return [
    {
      id: 'url',
      type: 'string',
      label: 'ComfyUI URL',
      width: 'full',
      default: 'http://127.0.0.1:8188',
      tooltipHtml: 'Base URL of your ComfyUI server.',
    },
    {
      id: 'connect',
      type: 'button',
      title: 'Connect',
      tooltipHtml: 'Loads your available models, samplers, schedulers and VAEs from ComfyUI.',
    },
    { id: 'model', type: 'dropdown_select', label: 'Model', options: connect.models ?? [] },
    { id: 'vae', type: 'dropdown_select', label: 'VAE', options: connect.vaes ?? [] },
    { id: 'sampler', type: 'dropdown_select', label: 'Sampling method', options: connect.samplers ?? [] },
    { id: 'scheduler', type: 'dropdown_select', label: 'Scheduler', options: connect.schedulers ?? [] },
    { id: 'steps', type: 'number', label: 'Sampling steps', default: '20', min: 1 },
    { id: 'cfgScale', type: 'number', label: 'CFG scale', default: '7', min: 0, step: 0.5 },
    { id: 'denoise', type: 'number', label: 'Denoising strength', default: '1', min: 0, max: 1, step: 0.01 },
    {
      id: 'clipSkip',
      type: 'number',
      label: 'CLIP skip',
      default: '1',
      min: 1,
      tooltipHtml:
        'A1111-style positive value (1 = no skip). Sent to ComfyUI as a negative stop_at_clip_layer.',
    },
    { id: 'seed', type: 'number', label: 'Seed (-1 = random)', default: '-1' },
    { id: 'sceneWidth', type: 'number', label: 'Chat image width (px)', default: '1024', min: 64, step: 8 },
    { id: 'sceneHeight', type: 'number', label: 'Chat image height (px)', default: '1024', min: 64, step: 8 },
    { id: 'cardWidth', type: 'number', label: 'Character card width (px)', default: '832', min: 64, step: 8 },
    {
      id: 'cardHeight',
      type: 'number',
      label: 'Character card height (px)',
      default: '1216',
      min: 64,
      step: 8,
    },
    { id: 'negativePrompt', type: 'string', label: 'Negative prompt', width: 'full' },
    {
      id: 'workflow',
      type: 'text_file_list',
      label: 'Workflow',
      width: 'full',
      default: 'comfyui-default',
      tooltipHtml:
        'ComfyUI API-format workflow JSON with %placeholder% tokens (%prompt%, %model%, %seed%, %steps%, …).',
    },
  ];
}

export const comfyuiScript: ImageGenerationSettingsScript = {
  id: 'comfyui',
  name: 'ComfyUI',
  ftueControlIds: ['url', 'connect', 'model'],
  controls: comfyControls,

  async buttonHandler(buttonId, controlValues, helpers) {
    if (buttonId !== 'connect') {
      return { result: 'failure', resultDescription: `Unknown button: ${buttonId}` };
    }

    const base = baseUrl(controlValues.url);
    if (!base) {
      return { result: 'failure', resultDescription: 'Set the ComfyUI URL first.' };
    }

    let response: Response;
    try {
      response = await helpers.proxiedFetch(`${base}/object_info`, { method: 'GET' });
    } catch (error) {
      return { result: 'failure', resultDescription: `Connection failed: ${getErrorMessage(error)}` };
    }
    if (!response.ok) {
      return { result: 'failure', resultDescription: `Connection failed (HTTP ${response.status}).` };
    }

    let data: any;
    try {
      data = await response.json();
    } catch (error) {
      return {
        result: 'failure',
        resultDescription: `Could not parse the ComfyUI response: ${getErrorMessage(error)}`,
      };
    }

    const connectData = extractObjectInfo(data);
    return {
      result: 'success',
      resultDescription: `Connected. Loaded ${connectData.models.length} models, ${connectData.samplers.length} samplers, ${connectData.schedulers.length} schedulers, ${connectData.vaes.length} VAEs.`,
      data: connectData,
    };
  },

  async generateImages(controlValues, request, helpers): Promise<ImageGenerationResult[]> {
    const base = baseUrl(controlValues.url);
    if (!base) {
      throw new Error('Set the ComfyUI URL first.');
    }

    const workflowId = controlValues.workflow;
    if (!workflowId) {
      throw new Error('No ComfyUI workflow selected.');
    }

    const workflowText = await helpers.loadUserTextFile('workflow', workflowId);
    if (!workflowText) {
      throw new Error('The selected ComfyUI workflow could not be loaded.');
    }

    const isCard = request.context.promptType === 'character_card';

    const seedInput = Math.trunc(Number(controlValues.seed));
    const seed =
      Number.isFinite(seedInput) && seedInput >= 0 ? seedInput : Math.floor(Math.random() * 2 ** 32);

    const tokens: Record<string, { value: string; numeric: boolean }> = {
      prompt: { value: request.prompt, numeric: false },
      negative_prompt: { value: controlValues.negativePrompt ?? '', numeric: false },
      model: { value: controlValues.model ?? '', numeric: false },
      vae: { value: controlValues.vae ?? '', numeric: false },
      sampler: { value: controlValues.sampler ?? '', numeric: false },
      scheduler: { value: controlValues.scheduler ?? '', numeric: false },
      steps: { value: positiveIntToken(controlValues.steps, 20), numeric: true },
      scale: { value: floatToken(controlValues.cfgScale, 7), numeric: true },
      denoise: { value: floatToken(controlValues.denoise, 1), numeric: true },
      clip_skip: { value: String(-Math.abs(Math.round(Number(controlValues.clipSkip) || 1))), numeric: true },
      seed: { value: String(seed), numeric: true },
      width: {
        value: positiveIntToken(isCard ? controlValues.cardWidth : controlValues.sceneWidth, 1024),
        numeric: true,
      },
      height: {
        value: positiveIntToken(isCard ? controlValues.cardHeight : controlValues.sceneHeight, 1024),
        numeric: true,
      },
    };

    const substituted = substituteWorkflowTokens(workflowText, tokens);
    let graph: unknown;
    try {
      graph = JSON.parse(substituted);
    } catch (error) {
      throw new Error(`Workflow is not valid JSON after substitution: ${getErrorMessage(error)}`);
    }

    const submit = await helpers.proxiedFetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: newId() }),
    });

    if (!submit.ok) {
      throw new Error(await readErrorText(submit, 'ComfyUI'));
    }

    const submitData = (await submit.json()) as { prompt_id?: string };
    if (!submitData.prompt_id) {
      throw new Error('ComfyUI did not return a prompt_id.');
    }

    const images = await pollForImages(base, submitData.prompt_id, helpers);

    return Promise.all(
      images.map(async (image) => {
        const params = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder ?? '',
          type: image.type ?? 'output',
        });
        return { readableStream: await urlToImageStream(`${base}/view?${params.toString()}`, helpers) };
      })
    );
  },
};
