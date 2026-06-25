import { z } from 'zod';
import { ApplicationError } from '../errors/application_error';
import _ from 'lodash';
import { omitNilValues } from '../util/types';

type LlmTokenCallback = (fullText: string) => void;

function buildAuthHeader(authToken: string | undefined): string | undefined {
  const trimmed = authToken?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed : `Bearer ${trimmed}`;
}

export type LlmChatOptions = {
  targetUrl?: string | undefined;
  authToken?: string | undefined;
  onTokens?: LlmTokenCallback | undefined;
  signal?: AbortSignal | undefined;
};

const openAIChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
});

function extractStreamChunkText(chunkPayload: unknown): { mode: 'delta' | 'full' | 'none'; text: string } {
  if (!chunkPayload || typeof chunkPayload !== 'object') {
    return { mode: 'none', text: '' };
  }

  const choices = (chunkPayload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { mode: 'none', text: '' };
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') {
    return { mode: 'none', text: '' };
  }

  const delta = (firstChoice as { delta?: unknown }).delta;
  if (delta && typeof delta === 'object' && typeof (delta as { content?: unknown }).content === 'string') {
    return { mode: 'delta', text: (delta as { content: string }).content };
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (
    message &&
    typeof message === 'object' &&
    typeof (message as { content?: unknown }).content === 'string'
  ) {
    return { mode: 'full', text: (message as { content: string }).content };
  }

  return { mode: 'none', text: '' };
}

function buildLlmHttpError(response: Response, responseText: string) {
  const summary = `HTTP Error ${response.status} ${response.statusText} for ${response.url}`;
  const trimmedBody = responseText.trim();
  const bodyPreview = trimmedBody ? `: ${trimmedBody.slice(0, 500)}` : '';
  const message = `${summary}${bodyPreview}`;

  return new Error(message);
}

async function parseLlmStreamingResponse(response: Response, onTokens: LlmTokenCallback): Promise<string> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/event-stream')) {
    const body = await response.text();
    const bodyPreview = body.trim().slice(0, 500);
    throw new Error(
      `Expected a text/event-stream response but received "${contentType || '(none)'}"${bodyPreview}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body was empty.');
  }

  let combinedText = '';
  let pendingBuffer = '';
  let sawDoneMarker = false;
  const decoder = new TextDecoder();

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || !line.startsWith('data:')) {
      return;
    }

    const payload = line.slice(5).trim();
    if (!payload) {
      return;
    }

    if (payload === '[DONE]') {
      sawDoneMarker = true;
      return;
    }

    let parsedPayload = JSON.parse(payload);

    const extracted = extractStreamChunkText(parsedPayload);
    if (extracted.mode === 'delta' && extracted.text) {
      combinedText += extracted.text;
      onTokens(combinedText);
      return;
    }

    if (extracted.mode === 'full') {
      combinedText = extracted.text;
      onTokens(combinedText);
    }
  };

  const processBufferedLines = (flush: boolean) => {
    while (true) {
      const newlineIndex = pendingBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      const line = pendingBuffer.slice(0, newlineIndex);
      pendingBuffer = pendingBuffer.slice(newlineIndex + 1);
      processLine(line);
    }

    if (flush && pendingBuffer.trim()) {
      processLine(pendingBuffer);
      pendingBuffer = '';
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    pendingBuffer += decoder.decode(value, { stream: true });
    processBufferedLines(false);

    if (sawDoneMarker) {
      break;
    }
  }

  pendingBuffer += decoder.decode();
  processBufferedLines(true);

  return combinedText;
}

export async function executeLlmChat(payload: Record<string, unknown>, options: LlmChatOptions = {}) {
  const { targetUrl, authToken, onTokens, signal } = options;
  const streamingRequested = typeof onTokens === 'function';

  if (streamingRequested) {
    onTokens('');
  }

  const requestPayload = {
    ...payload,
    stream: streamingRequested,
  };

  const headers = omitNilValues({
    'Content-Type': 'application/json',
    'X-Target-URL': targetUrl,
    Authorization: buildAuthHeader(authToken),
  });

  const response = await fetch('/api/proxy/fetch', {
    method: 'POST',
    headers: _.omitBy(headers, _.isNil),
    body: JSON.stringify(requestPayload),
    signal: signal ?? null,
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw buildLlmHttpError(response, responseText);
  }

  if (streamingRequested) {
    return parseLlmStreamingResponse(response, onTokens);
  }

  const completion = await parseJSONResponse(openAIChatCompletionSchema, response);
  return completion?.choices?.[0]?.message?.content || '';
}

export async function parseJSONResponse<TZodType>(
  schema: z.Schema<TZodType>,
  response: Response
): Promise<TZodType> {
  if (!response.ok) {
    throw await ApplicationError.fromFetchResponse(response);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Non-JSON response received from ${response.url}`);
  }

  const payload = await response.json();

  return schema.parse(payload);
}
