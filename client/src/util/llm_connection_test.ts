import { getErrorMessage } from '../errors/error_util.js';

const CHAT_COMPLETIONS_PATH = '/chat/completions';
const MODELS_PATH = '/models';

type UrlRewriteResult =
  | { ok: true; modelsUrl: string }
  | {
      ok: false;
      error: string;
    };

type LlmConnectionTestResult = { ok: true; testedUrl: string } | { ok: false; error: string };

function toModelsEndpointUrl(rawUrl: string): UrlRewriteResult {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return { ok: false, error: 'Connection URL is required.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return { ok: false, error: 'Connection URL is invalid.' };
  }

  const currentPathname = parsedUrl.pathname;
  const matchIndex = currentPathname.lastIndexOf(CHAT_COMPLETIONS_PATH);
  if (matchIndex < 0) {
    return {
      ok: false,
      error:
        'URL is in an unexpected shape. Expected to include /chat/completions. You can proceed if you are sure this URL is correct.',
    };
  }

  parsedUrl.pathname =
    currentPathname.slice(0, matchIndex) +
    MODELS_PATH +
    currentPathname.slice(matchIndex + CHAT_COMPLETIONS_PATH.length);

  return { ok: true, modelsUrl: parsedUrl.toString() };
}

export async function testLlmConnection(rawUrl: string, authToken: string): Promise<LlmConnectionTestResult> {
  const rewriteResult = toModelsEndpointUrl(rawUrl);
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
        targetUrl: rewriteResult.modelsUrl,
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
        error: `Connection test failed (${response.status} ${response.statusText}). ${JSON.stringify(payload)}`,
      };
    }

    return { ok: true, testedUrl: rewriteResult.modelsUrl };
  } catch (error) {
    return { ok: false, error: `Connection test failed: ${getErrorMessage(error)}` };
  }
}
