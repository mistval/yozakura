import { z } from 'zod';
import { ApplicationError } from '../errors/application_error';
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
        reasoning_content: z.string().optional(),
      }),
    })
  ),
});

type LlmChatMessage = z.infer<typeof openAIChatCompletionSchema>['choices'][number]['message'];

type ExtractedStreamChunk =
  | { mode: 'delta'; message: Partial<LlmChatMessage> }
  | { mode: 'full'; message: LlmChatMessage }
  | { mode: 'none' };

function extractStreamMessageFields(value: unknown): Partial<LlmChatMessage> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const content = (value as { content?: unknown }).content;
  const reasoningContent = (value as { reasoning_content?: unknown }).reasoning_content;
  if (typeof content !== 'string' && typeof reasoningContent !== 'string') {
    return undefined;
  }

  return {
    ...(typeof content === 'string' ? { content } : {}),
    ...(typeof reasoningContent === 'string' ? { reasoning_content: reasoningContent } : {}),
  };
}

function extractStreamChunkMessage(chunkPayload: unknown): ExtractedStreamChunk {
  if (!chunkPayload || typeof chunkPayload !== 'object') {
    return { mode: 'none' };
  }

  const choices = (chunkPayload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { mode: 'none' };
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') {
    return { mode: 'none' };
  }

  const delta = (firstChoice as { delta?: unknown }).delta;
  const deltaMessage = extractStreamMessageFields(delta);
  if (deltaMessage) {
    return { mode: 'delta', message: deltaMessage };
  }

  const message = (firstChoice as { message?: unknown }).message;
  const fullMessage = extractStreamMessageFields(message);
  if (fullMessage?.content !== undefined) {
    return {
      mode: 'full',
      message: {
        content: fullMessage.content,
        ...(fullMessage.reasoning_content !== undefined
          ? { reasoning_content: fullMessage.reasoning_content }
          : {}),
      },
    };
  }

  return { mode: 'none' };
}

function buildLlmHttpError(response: Response, responseText: string) {
  const summary = `HTTP Error ${response.status} ${response.statusText} for ${response.url}`;
  const trimmedBody = responseText.trim();
  const bodyPreview = trimmedBody ? `: ${trimmedBody.slice(0, 500)}` : '';
  const message = `${summary}${bodyPreview}`;

  return new Error(message);
}

async function parseLlmStreamingResponse(
  response: Response,
  onTokens: LlmTokenCallback
): Promise<LlmChatMessage> {
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

  let combinedMessage: LlmChatMessage = { content: '' };
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

    const extracted = extractStreamChunkMessage(parsedPayload);
    if (extracted.mode === 'delta') {
      if (extracted.message.reasoning_content !== undefined) {
        combinedMessage.reasoning_content =
          (combinedMessage.reasoning_content ?? '') + extracted.message.reasoning_content;
      }

      if (extracted.message.content) {
        combinedMessage.content += extracted.message.content;
        onTokens(combinedMessage.content);
      }

      return;
    }

    if (extracted.mode === 'full') {
      combinedMessage = extracted.message;
      onTokens(combinedMessage.content);
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

  return combinedMessage;
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
    headers,
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
  return completion?.choices?.[0]?.message;
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
