import { useState, useEffect, useMemo, useCallback } from 'react';
import TreeDataViewer, { type TreeNode } from '../ui/TreeDataViewer.js';
import { collectDescendantIds } from '../ui/tree_selection.js';
import { importStagingDatabase, mainDatabase } from '../../backend_bridge/database.js';
import {
  stageImportArchive,
  cancelImport,
  commitImport,
  type StagedManifest,
  type StagedImageEntry,
} from '../../backend_bridge/import_api.js';
import { decomposeSelection } from './importExportCommon.js';
import { buildImportExportTreeRoots } from './treeBuilder.js';
import { templateGroupDataSchema } from '../../engine/prompt_templates/template_types.js';
import type { ScenarioSummary, WorldMap, Character } from '../../engine/types.js';
import { detectConflicts, type ConflictAction, type EntityConflict } from './importConflictResolver.js';
import ImportConflictModal from './ImportConflictModal.js';
import { validateStagedData } from './importValidation.js';
import { prepareStagingAndBuildCommitPayload } from './importCommitPayloadBuilder.js';
import { useMapStore } from '../../state/map_store.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useSettingsStore } from '../../state/settings_store.js';
import { z } from 'zod';

export type DataImportComponentProps = {
  onImportStateChange?: (isProcessing: boolean) => void;
};

type StagedData = {
  sessionId: string;
  manifest: StagedManifest;
  images: StagedImageEntry[];
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
  templateGroupData: z.infer<typeof templateGroupDataSchema>;
};

export default function DataImportComponent({ onImportStateChange }: DataImportComponentProps) {
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
  const [isStaging, setIsStaging] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | undefined>(undefined);
  const [stagedData, setStagedData] = useState<StagedData | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingConflicts, setPendingConflicts] = useState<EntityConflict[] | undefined>(undefined);

  const isBusy = isStaging || isCommitting;

  // Notify parent modal of processing progress
  useEffect(() => {
    onImportStateChange?.(isBusy);
  }, [isBusy, onImportStateChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(undefined);
      setSuccessMessage(undefined);
    }
  };

  const handleStageArchive = useCallback(
    async (fileToStage?: File) => {
      const file = fileToStage ?? selectedFile;
      if (!file) return;

      setIsStaging(true);
      setErrorMessage(undefined);
      setSuccessMessage(undefined);

      try {
        const result = await stageImportArchive(file);
        if (!result.success) {
          setErrorMessage(result.error);
          return;
        }

        // Query importStagingDatabase for staged entities
        const [scenarios, maps, globalCharacters, settingsRow] = await Promise.all([
          importStagingDatabase.loadScenarioSummaries().then(s => mainDatabase.augmentSummaryMetadata(s)),
          importStagingDatabase.loadMaps(),
          importStagingDatabase.loadGlobalCharacters(),
          importStagingDatabase.loadKeyValue(
            'settings',
            z.object({
              templateGroupData: templateGroupDataSchema.optional(),
            })
          ),
        ]);

        const templateGroupData = settingsRow?.templateGroupData ?? {};

        const staged: StagedData = {
          sessionId: result.sessionId,
          manifest: result.manifest,
          images: result.images,
          scenarios,
          maps,
          globalCharacters,
          templateGroupData,
        };

        setStagedData(staged);

        // Pre-select ALL present items by default on import via tree roots traversal
        const treeRoots = buildImportExportTreeRoots({
          mode: 'import',
          scenarios,
          maps,
          globalCharacters,
          templateGroupData,
        });

        const initialSelected = new Set<string>();
        for (const root of treeRoots) {
          const ids = await collectDescendantIds(
            root,
            root.id,
            (n) => n.getChildren?.() ?? Promise.resolve([])
          );
          for (const id of ids) {
            initialSelected.add(id);
          }
        }

        setSelectedIds(initialSelected);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? `This import archive is corrupted and cannot be loaded: ${err.message}`
            : 'This import archive is corrupted and cannot be loaded.'
        );
        try {
          await cancelImport();
        } catch {}
        setStagedData(undefined);
        setSelectedFile(undefined);
      } finally {
        setIsStaging(false);
      }
    },
    [selectedFile]
  );

  const handleCancel = async () => {
    setIsStaging(true);
    try {
      await cancelImport();
    } finally {
      setIsStaging(false);
      setStagedData(undefined);
      setSelectedFile(undefined);
      setSelectedIds(new Set());
      setPendingConflicts(undefined);
    }
  };

  // Selected entities decomposition via centralized helper
  const decomposed = useMemo(() => {
    if (!stagedData) return undefined;
    return decomposeSelection({
      selectedIds,
      scenarios: stagedData.scenarios,
      maps: stagedData.maps,
      globalCharacters: stagedData.globalCharacters,
      templateGroupData: stagedData.templateGroupData,
    });
  }, [stagedData, selectedIds]);

  const selectedScenarioIds = decomposed?.selectedScenarioIds ?? [];
  const selectedScenarioCharactersIds = decomposed?.selectedScenarioCharactersIds ?? [];
  const selectedScenarioGroupsIds = decomposed?.selectedScenarioGroupsIds ?? [];
  const selectedScenarioSchedulesIds = decomposed?.selectedScenarioSchedulesIds ?? [];
  const selectedScenarioMemoriesIds = decomposed?.selectedScenarioMemoriesIds ?? [];
  const selectedScenarioConversationsIds = decomposed?.selectedScenarioConversationsIds ?? [];
  const selectedScenarioTurnIds = decomposed?.selectedScenarioTurnIds ?? [];
  const selectedMapIds = decomposed?.selectedMapIds ?? [];
  const selectedGlobalCharacterIds = decomposed?.selectedGlobalCharacterIds ?? [];
  const selectedTemplateChainIds = decomposed?.selectedTemplateChainIds ?? [];

  // Execute commit with given conflict resolutions
  const executeCommit = async (conflictResolutions: Record<string, ConflictAction>) => {
    if (!stagedData) return;

    setIsCommitting(true);
    setErrorMessage(undefined);

    try {
      const payload = await prepareStagingAndBuildCommitPayload({
        sessionId: stagedData.sessionId,
        exportName: stagedData.manifest.exportName,
        selectedScenarioIds,
        selectedScenarioCharactersIds,
        selectedScenarioGroupsIds,
        selectedScenarioSchedulesIds,
        selectedScenarioMemoriesIds,
        selectedScenarioConversationsIds,
        selectedScenarioTurnIds,
        selectedMapIds,
        selectedGlobalCharacterIds,
        conflictResolutions,
        stagedImages: stagedData.images,
        stagedGlobalCharacters: stagedData.globalCharacters,
      });

      const result = await commitImport(payload);
      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }

      // Merge selected template chains into useSettingsStore
      if (selectedTemplateChainIds.length > 0) {
        const currentTemplateGroupData = useSettingsStore.getState().templateGroupData;
        const updated = { ...currentTemplateGroupData };

        for (const [groupId, group] of Object.entries(stagedData.templateGroupData)) {
          const matchingChains: Record<string, (typeof group.templateChains)[string]> = {};
          for (const [chainId, chain] of Object.entries(group.templateChains)) {
            if (selectedTemplateChainIds.includes(chainId)) {
              matchingChains[chainId] = chain;
            }
          }
          if (Object.keys(matchingChains).length > 0) {
            const existingGroup = updated[groupId] ?? {
              id: groupId,
              templateChains: {},
            };
            updated[groupId] = {
              ...existingGroup,
              templateChains: {
                ...existingGroup.templateChains,
                ...matchingChains,
              },
            };
          }
        }

        useSettingsStore.getState().setSettings({
          templateGroupData: updated,
        });
      }

      // Refresh stores
      await Promise.all([
        useMapStore.getState().refreshMaps(),
        useGlobalCharactersStore.getState().refresh(),
        useScenarioStore.getState().refreshScenarioSummaries(),
      ]);

      const overwrittenGlobalCharIds = selectedGlobalCharacterIds.filter(
        (id) => conflictResolutions[id] === 'overwrite'
      );
      if (overwrittenGlobalCharIds.length > 0) {
        useGlobalCharactersStore.getState().bustImageCache(overwrittenGlobalCharIds);
      }

      setSuccessMessage(
        `Import completed successfully! ${
          result.backupFilename ? `(Database backup saved to backups/${result.backupFilename})` : ''
        }`
      );
      setStagedData(undefined);
      setSelectedFile(undefined);
      setSelectedIds(new Set());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to commit import');
    } finally {
      setIsCommitting(false);
    }
  };

  // User clicked "Import Selected Data"
  const handleStartImport = async () => {
    if (!stagedData) return;

    const hasAnySelection =
      selectedScenarioIds.length > 0 ||
      selectedMapIds.length > 0 ||
      selectedGlobalCharacterIds.length > 0 ||
      selectedTemplateChainIds.length > 0;

    if (!hasAnySelection) {
      setErrorMessage('Please select at least one item to import.');
      return;
    }

    setIsCommitting(true);
    setErrorMessage(undefined);

    // 1. Paged Zod Validation
    const validation = await validateStagedData({
      selectedScenarioIds,
      selectedScenarioCharactersIds,
      selectedScenarioGroupsIds,
      selectedScenarioSchedulesIds,
      selectedScenarioMemoriesIds,
      selectedScenarioConversationsIds,
      selectedMapIds,
      selectedGlobalCharacterIds,
      selectedTemplateChainIds,
    });

    if (!validation.valid) {
      setIsCommitting(false);
      setErrorMessage(
        `Validation failed for selected data:\n${validation.errors.slice(0, 5).join('\n')}${
          validation.errors.length > 5 ? `\n...and ${validation.errors.length - 5} more error(s)` : ''
        }`
      );
      return;
    }

    // 2. Conflict Detection
    const selectedMaps = stagedData.maps.filter((m) => selectedMapIds.includes(m.id));
    const selectedGlobalChars = stagedData.globalCharacters.filter((c) =>
      selectedGlobalCharacterIds.includes(c.id)
    );
    const conflicts = detectConflicts(
      selectedMaps,
      selectedGlobalChars,
      useMapStore.getState().mapsById,
      useGlobalCharactersStore.getState().globalCharactersById
    );

    if (conflicts.length > 0) {
      setIsCommitting(false);
      setPendingConflicts(conflicts);
      return;
    }

    // No conflicts, execute commit directly
    await executeCommit({});
  };

  // Build tree roots dynamically based on what actually exists in stagedData
  const roots = useMemo<TreeNode[]>(() => {
    if (!stagedData) return [];
    return buildImportExportTreeRoots({
      mode: 'import',
      scenarios: stagedData.scenarios,
      maps: stagedData.maps,
      globalCharacters: stagedData.globalCharacters,
      templateGroupData: stagedData.templateGroupData,
    });
  }, [stagedData]);

  // View 1: Upload Archive
  if (!stagedData) {
    return (
      <div className="flex flex-col space-y-4">
        {successMessage && (
          <div className="p-3 bg-success-bg text-success-text border border-success-border rounded text-sm">
            {successMessage}
          </div>
        )}

        <div>
          <label htmlFor="import-file" className="block text-sm font-medium text-primary mb-1">
            Choose Yozakura Export Archive
          </label>
          <input
            id="import-file"
            type="file"
            accept=".zip,.yozakura_export.zip"
            onChange={handleFileChange}
            disabled={isBusy}
            className="block w-full text-sm text-secondary file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-border-default file:text-sm file:font-semibold file:bg-surface file:text-primary hover:file:bg-surface-hover file:cursor-pointer disabled:opacity-50"
          />
          <div className="text-xs text-secondary mt-1">
            Select a <code className="text-secondary-strong">.yozakura_export.zip</code> file to inspect and
            stage.
          </div>
        </div>

        {isStaging && (
          <div className="p-4 bg-surface border border-border-default rounded text-sm flex items-center gap-3 text-primary font-medium animate-pulse">
            <span className="text-lg animate-spin inline-block">⟳</span>
            <span>Uploading, migrating, and inspecting archive... Please wait.</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-danger-bg text-danger-text border border-danger-border rounded text-sm whitespace-pre-wrap">
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
          <button
            type="button"
            onClick={() => handleStageArchive()}
            disabled={!selectedFile || isBusy}
            className="px-4 py-2 bg-button-emphasized-bg text-button-emphasized-text font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isStaging ? 'Inspecting...' : 'Inspect & Stage Archive'}
          </button>
        </div>
      </div>
    );
  }

  // View 2: Archive Preview Tree
  return (
    <div className="flex flex-col space-y-4">
      {pendingConflicts && (
        <ImportConflictModal
          open={true}
          conflicts={pendingConflicts}
          onConfirm={(resolutions) => {
            setPendingConflicts(undefined);
            void executeCommit(resolutions);
          }}
          onCancel={() => setPendingConflicts(undefined)}
        />
      )}

      <div className="p-3 bg-surface-subtle border border-border-default rounded flex items-center justify-between">
        <div>
          <div className="font-semibold text-primary text-sm">
            Staged Archive: <span className="font-mono">{stagedData.manifest.exportName}</span>
          </div>
          <div className="text-xs text-secondary">
            Archive Database Version: {stagedData.manifest.dbUserVersion} | Images bundled:{' '}
            {stagedData.images.length}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isBusy}
          className="text-xs px-2 py-1 rounded border border-border-default hover:bg-surface-hover text-secondary hover:text-primary cursor-pointer disabled:opacity-50"
        >
          Cancel &amp; Unstage
        </button>
      </div>

      {isCommitting && (
        <div className="p-4 bg-surface border border-border-default rounded text-sm flex items-center gap-3 text-primary font-medium animate-pulse">
          <span className="text-lg animate-spin inline-block">⟳</span>
          <span>Validating, backing up database, and committing import... Please wait.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-danger-bg text-danger-text border border-danger-border rounded text-sm whitespace-pre-wrap">
          {errorMessage}
        </div>
      )}

      <div>
        <div className="text-sm font-medium text-primary mb-2">Select Items to Import</div>
        <TreeDataViewer
          roots={roots}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          disabled={isBusy}
          renderControls={(selection) => (
            <div className="flex items-center justify-between text-xs text-secondary">
              <span>{selection.selectedIds.size} items selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selection.selectAll()}
                  className="hover:text-primary underline cursor-pointer disabled:opacity-50"
                  disabled={isBusy}
                >
                  Select All
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => selection.clearAll()}
                  className="hover:text-primary underline cursor-pointer disabled:opacity-50"
                  disabled={isBusy}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {roots.length === 0 && (
        <div className="p-4 text-center text-sm text-secondary bg-surface-soft rounded border border-border-default">
          No importable entities found in this archive.
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-default">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isBusy}
          className="px-3 py-1.5 text-sm text-secondary hover:text-primary cursor-pointer disabled:opacity-50"
        >
          Back
        </button>

        <button
          type="button"
          disabled={isBusy || selectedIds.size === 0}
          onClick={handleStartImport}
          className="px-4 py-2 bg-button-emphasized-bg text-button-emphasized-text font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isCommitting ? 'Importing...' : 'Import Selected Data'}
        </button>
      </div>
    </div>
  );
}
