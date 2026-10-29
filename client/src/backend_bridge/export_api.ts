import type { ExportPayload } from '../components/import_export/exportPayloadBuilder.js';
import { assertNonNullish } from '../errors/application_error.js';

export type ExportResult =
  | { success: true; filePath: string }
  | { success: false; alreadyExists: true; message: string }
  | { success: false; error: string };

export async function requestDataExport(payload: ExportPayload): Promise<ExportResult> {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 409) {
    const data = (await response
      .json()) as {
      message?: string; 
    };

    assertNonNullish(data.message, 'Unexpected response from shape export endpoint: ' + JSON.stringify(data));

    return {
      success: false,
      alreadyExists: true,
      message: data.message,
    };
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({ error: 'Export request failed' }))) as {
      error?: string;
    };
    return {
      success: false,
      error: data.error || `Export failed with status ${response.status}`,
    };
  }

  const data = (await response.json()) as { ok: boolean; filePath: string };
  return {
    success: true,
    filePath: data.filePath,
  };
}
