import { getErrorMessage } from '../../../../../errors/error_util.js';
import type { ButtonHandlerResult, SettingsScriptHelpers } from '../../settings_script.js';

export function authHeader(token: string | undefined): Record<string, string> {
  const trimmed = token?.trim();
  if (!trimmed) {
    return {};
  }

  return {
    Authorization: trimmed.toLowerCase().startsWith('bearer ') ? trimmed : `Bearer ${trimmed}`,
  };
}

export function stripBase64Prefix(value: string): string {
  return value.split(',').pop() ?? '';
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export async function urlToImageStream(
  url: string,
  helpers: SettingsScriptHelpers
): Promise<ReadableStream<Uint8Array>> {
  if (url.startsWith('data:')) {
    return bytesToStream(base64ToBytes(stripBase64Prefix(url)));
  }

  const response = await helpers.proxiedFetch(url, { method: 'GET' });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download generated image (${response.status} ${response.statusText}).`);
  }
  return response.body;
}

export async function readErrorText(response: Response, label: string): Promise<string> {
  let body = '';
  try {
    body = await response.text();
  } catch {
    // ignore
  }
  return `Error from ${label} provider (${response.status} ${response.statusText}): ${body.slice(0, 500)}`.trim();
}

export async function testConnectionViaProxy(
  testUrl: string,
  authToken: string | undefined,
  helpers: SettingsScriptHelpers
): Promise<ButtonHandlerResult> {
  try {
    const response = await helpers.proxiedFetch(testUrl, {
      method: 'GET',
      headers: authHeader(authToken),
    });

    if (response.ok) {
      return { result: 'success', resultDescription: 'Connection successful.' };
    }

    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore
    }

    return {
      result: 'failure',
      resultDescription:
        `Connection failed (${response.status} ${response.statusText}). ${body.slice(0, 300)}`.trim(),
    };
  } catch (error) {
    return { result: 'failure', resultDescription: `Connection failed: ${getErrorMessage(error)}` };
  }
}
