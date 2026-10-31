export type StagedManifest = {
  exportName: string;
  dbUserVersion: number;
};

export type StagedImageEntry =
  | {
      zipPath: string;
      kind: 'global_character_card';
    }
  | {
      zipPath: string;
      kind: 'scenario_character_card' | 'chat_image';
      scenarioId: string;
    };

export type StageImportResult =
  | {
      success: true;
      sessionId: string;
      manifest: StagedManifest;
      images: StagedImageEntry[];
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
    const data = (await response.json().catch(() => ({ error: 'Failed to stage import' }))) as {
      error?: string;
    };
    return {
      success: false,
      error: data.error || `Staging failed with status ${response.status}`,
    };
  }

  const data = (await response.json()) as {
    ok: boolean;
    sessionId: string;
    manifest: StagedManifest;
    images: StagedImageEntry[];
  };

  return {
    success: true,
    sessionId: data.sessionId,
    manifest: data.manifest,
    images: data.images,
  };
}

export type SqlStatementEntry =
  | string
  | {
      statement: string;
      params?: unknown[];
    };

export type ImportCommitPayload = {
  sessionId: string;
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
    const data = (await response.json().catch(() => ({ error: 'Failed to commit import' }))) as {
      error?: string;
    };
    return {
      success: false,
      error: data.error || `Commit failed with status ${response.status}`,
    };
  }

  const data = (await response.json()) as {
    ok: boolean;
    backupFilename?: string;
  };

  return {
    success: true,
    ...(data.backupFilename ? { backupFilename: data.backupFilename } : {}),
  };
}

export async function cancelImport(): Promise<void> {
  await fetch('/api/import/cancel', {
    method: 'POST',
  });
}
