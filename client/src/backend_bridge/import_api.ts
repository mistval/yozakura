import { z } from 'zod';

export const stagedManifestSchema = z.object({
  exportName: z.string(),
  dbUserVersion: z.number(),
});
export type StagedManifest = z.infer<typeof stagedManifestSchema>;

const stageSuccessResponseSchema = z.object({
  ok: z.literal(true),
  manifest: stagedManifestSchema,
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
});

const commitSuccessResponseSchema = z.object({
  ok: z.literal(true),
  backupFilename: z.string().optional(),
});

export type StageImportResult =
  | {
      success: true;
      manifest: StagedManifest;
    }
  | {
      success: false;
      error: string;
    };

export async function stageImportArchive(file: File): Promise<StageImportResult> {
  const response = await fetch('/api/import/stage', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/zip',
    },
    body: file,
  });

  if (!response.ok) {
    const json: unknown = await response.json();
    const parsed = errorResponseSchema.safeParse(json);
    return {
      success: false,
      error: (parsed.success && parsed.data.error) || `Staging failed with status ${response.status}`,
    };
  }

  const json: unknown = await response.json();
  const parsed = stageSuccessResponseSchema.parse(json);

  return {
    success: true,
    manifest: parsed.manifest,
  };
}

export async function stagePrepackagedArchive(prepackagedName: string = 'demo'): Promise<StageImportResult> {
  const response = await fetch('/api/import/stage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prepackagedName }),
  });

  if (!response.ok) {
    const json: unknown = await response.json();
    const parsed = errorResponseSchema.safeParse(json);
    return {
      success: false,
      error: (parsed.success && parsed.data.error) || `Staging failed with status ${response.status}`,
    };
  }

  const json: unknown = await response.json();
  const parsed = stageSuccessResponseSchema.parse(json);

  return {
    success: true,
    manifest: parsed.manifest,
  };
}

export type SqlStatementEntry =
  | string
  | {
      statement: string;
      params?: unknown[];
    };

export type ImportCommitPayload = {
  sqlStatements: SqlStatementEntry[];
  imageCopies: Array<{
    zipPath: string;
    targetRelPath: string;
  }>;
  allowedImageDirectories?: string[];
};

export type CommitImportResult =
  | {
      success: true;
      backupFilename?: string;
    }
  | {
      success: false;
      error: string;
    };

export async function commitImport(payload: ImportCommitPayload): Promise<CommitImportResult> {
  const response = await fetch('/api/import/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const json: unknown = await response.json();
    const parsed = errorResponseSchema.safeParse(json);
    return {
      success: false,
      error: (parsed.success && parsed.data.error) || `Commit failed with status ${response.status}`,
    };
  }

  const json: unknown = await response.json();
  const parsed = commitSuccessResponseSchema.parse(json);

  return {
    success: true,
    ...(parsed.backupFilename ? { backupFilename: parsed.backupFilename } : {}),
  };
}

export async function cancelImport(): Promise<void> {
  await fetch('/api/import/cancel', {
    method: 'POST',
  });
}
