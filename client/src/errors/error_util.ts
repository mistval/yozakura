import { serializeError } from 'serialize-error';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }

  return JSON.stringify(serializeError(error));
}
