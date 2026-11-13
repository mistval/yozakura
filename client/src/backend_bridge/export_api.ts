import { z } from 'zod';
import type { ExportPayload } from './export_payload_builder.js';
import { assertNonNullish } from '../errors/application_error.js';

export type ExportResult =
  | { success: true; filePath: string }
  | { success: false; alreadyExists: true; message: string }
  | { success: false; error: string };

const conflictResponseSchema = z.object({
  message: z.string().optional(),
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
});

const exportSuccessResponseSchema = z.object({
  ok: z.literal(true),
  filePath: z.string(),
});

export async function requestDataExport(payload: ExportPayload): Promise<ExportResult> {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 409) {
    const json: unknown = await response.json();
    const data = conflictResponseSchema.parse(json);

    assertNonNullish(data.message, 'Unexpected response from shape export endpoint: ' + JSON.stringify(json));

    return {
      success: false,
      alreadyExists: true,
      message: data.message,
    };
  }

  if (!response.ok) {
    const json: unknown = await response.json();
    const data = errorResponseSchema.safeParse(json);
    return {
      success: false,
      error: (data.success && data.data.error) || `Export failed with status ${response.status}`,
    };
  }

  const json: unknown = await response.json();
  const data = exportSuccessResponseSchema.parse(json);
  return {
    success: true,
    filePath: data.filePath,
  };
}
