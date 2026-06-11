import { getErrorMessage } from '../errors/error_util.js';
import type { ImageApiShape } from '../state/settings_store.js';

const AUTOMATIC1111_TXT2IMG_PATH = '/sdapi/v1/txt2img';
const OPENAI_IMAGES_PATH = '/v1/chat/completions';
const OPENAI_MODELS_PATH = '/models';

type UrlRewriteResult =
  | { ok: true; testUrl: string }
  | {
      ok: false;
      error: string;
    };

type ImageConnectionTestResult = { ok: true; testedUrl: string } | { ok: false; error: string };

function toImageTestEndpointUrl(rawUrl: string, shape: ImageApiShape): UrlRewriteResult {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Connection URL is invalid.' };
  }

  const currentPathname = parsedUrl.pathname;

  if (shape === 'automatic1111') {
    if (!currentPathname.endsWith(AUTOMATIC1111_TXT2IMG_PATH)) {
      return {
        ok: false,
        error: `AUTOMATIC1111 URL is in an unexpected shape. Expected to end with ${AUTOMATIC1111_TXT2IMG_PATH}.`,
      };
    }

    const nextPath = currentPathname.replace(new RegExp(`${AUTOMATIC1111_TXT2IMG_PATH}$`), '');
    parsedUrl.pathname = nextPath || '/';
    return { ok: true, testUrl: parsedUrl.toString() };
  }

  if (!currentPathname.endsWith(OPENAI_IMAGES_PATH)) {
    return {
      ok: false,
      error: `OpenAI-compatible image URL is in an unexpected shape. Expected to end with ${OPENAI_IMAGES_PATH}.`,
    };
  }

  const nextPath = currentPathname.replace(new RegExp(`${OPENAI_IMAGES_PATH}$`), OPENAI_MODELS_PATH);
  parsedUrl.pathname = nextPath || '/';
  return { ok: true, testUrl: parsedUrl.toString() };
}

export async function testImageConnection(
  rawUrl: string,
  authToken: string,
  shape: ImageApiShape
): Promise<ImageConnectionTestResult> {
  const rewriteResult = toImageTestEndpointUrl(rawUrl, shape);
  if (!rewriteResult.ok) {
    return { ok: false, error: rewriteResult.error };
  }

  try {
    const response = await fetch('/api/llm/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetUrl: rewriteResult.testUrl,
        authToken,
      }),
    });

    let payload: unknown = undefined;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `Connection test failed (${response.status} ${response.statusText}): ${JSON.stringify(payload)}`,
      };
    }

    return { ok: true, testedUrl: rewriteResult.testUrl };
  } catch (error) {
    return { ok: false, error: `Connection test failed: ${getErrorMessage(error)}` };
  }
}
