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
    manifest: StagedManifest;
    images: StagedImageEntry[];
  };

  return {
    success: true,
    manifest: data.manifest,
    images: data.images,
  };
}

export async function cancelImport(): Promise<void> {
  await fetch('/api/import/cancel', {
    method: 'POST',
  });
}

