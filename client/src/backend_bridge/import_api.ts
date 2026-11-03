export type StagedManifest = {
  exportName: string;
  dbUserVersion: number;
};

export type StageImportResult =
  | {
      success: true;
      sessionId: string;
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
  };

  return {
    success: true,
    sessionId: data.sessionId,
    manifest: data.manifest,
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
    const data = (await response.json().catch(() => ({ error: 'Failed to stage prepackaged archive' }))) as {
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
  };

  return {
    success: true,
    sessionId: data.sessionId,
    manifest: data.manifest,
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
