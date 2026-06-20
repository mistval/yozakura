import { z } from 'zod';
import { parseJSONResponse, type LlmChatOptions, executeLlmChat } from './api_helpers';
import { runWithInteractiveRetry } from '../engine/interative_retry';
import { assert } from '../errors/application_error';

const DEFAULT_API_RETRY_HINT =
  'The backend server might not be running or downstream services might be unavailable.';

const zodEmpty = z.object({});

const dbExecResponseType = z.object({
  ok: z.boolean(),
});

const dbAllResponseType = z.object({
  results: z.array(z.array(z.record(z.string(), z.unknown()))),
});

const dbRunResponseType = z.object({});

type DbParameterGroup = unknown[];

export const putFile = (path: string, file: Blob, contentType?: string) =>
  runWithInteractiveRetry({
    operationType: 'api.upload_file',
    hint: DEFAULT_API_RETRY_HINT,
    run: async () => {
      assert(path.startsWith('/api/files/'), 'Can only PUT files starting with /api/files/');

      const response = await fetch(path, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType || (file && file.type) || 'application/octet-stream',
        },
        body: file,
      });

      return parseJSONResponse(zodEmpty, response);
    },
  });

export const deleteFile = (path: string) =>
  runWithInteractiveRetry({
    operationType: 'api.delete_path',
    hint: DEFAULT_API_RETRY_HINT,
    run: async () => {
      assert(path.startsWith('/api/files/'), 'Can only DELETE files starting with /api/files/');

      const response = await fetch(path, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return parseJSONResponse(zodEmpty, response);
    },
  });

export const llmChat = (payload: Record<string, unknown>, options: LlmChatOptions = {}) =>
  executeLlmChat(payload, options);

export async function dbExec(sql: string) {
  const response = await fetch('/api/db/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  return parseJSONResponse(dbExecResponseType, response);
}

export async function dbAll(statement: string, parameterGroups: DbParameterGroup[]) {
  const response = await fetch('/api/db/all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statement, parameterGroups }),
  });
  return parseJSONResponse(dbAllResponseType, response);
}

export async function dbRun(statement: string, parameterGroups: DbParameterGroup[]) {
  const response = await fetch('/api/db/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statement, parameterGroups }),
  });

  return parseJSONResponse(dbRunResponseType, response);
}
