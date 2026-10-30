import { useState, useEffect, useMemo, useCallback } from 'react';
import TreeDataViewer, { type TreeNode } from '../ui/TreeDataViewer.js';
import { importStagingDatabase } from '../../backend_bridge/database.js';
import {
  stageImportArchive,
  cancelImport,
  commitImport,
  type StagedManifest,
  type StagedImageEntry,
} from '../../backend_bridge/import_api.js';
import { TreeEntityIds } from './exportPayloadBuilder.js';
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
          importStagingDatabase.loadScenarioSummaries(),
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

        // Pre-select ALL present items by default on import
        const initialSelected = new Set<string>();

        // Select root categories and their descendants
        if (scenarios.length > 0) {
          initialSelected.add(TreeEntityIds.rootScenarios());
          for (const s of scenarios) {
            const scenId = s.scenario.id;
            initialSelected.add(TreeEntityIds.scenario(scenId));
            initialSelected.add(TreeEntityIds.scenarioMap(scenId, s.scenario.mapId));
            initialSelected.add(TreeEntityIds.scenarioCharacters(scenId));
            initialSelected.add(TreeEntityIds.scenarioGroups(scenId));
            initialSelected.add(TreeEntityIds.scenarioSchedules(scenId));
            initialSelected.add(TreeEntityIds.scenarioMemories(scenId));
            initialSelected.add(TreeEntityIds.scenarioConversations(scenId));
            initialSelected.add(TreeEntityIds.scenarioTurn(scenId));
          }
        }

        if (maps.length > 0) {
          initialSelected.add(TreeEntityIds.rootMaps());
          for (const m of maps) {
            initialSelected.add(TreeEntityIds.map(m.id));
          }
        }

        if (globalCharacters.length > 0) {
          initialSelected.add(TreeEntityIds.rootCharacters());
          for (const c of globalCharacters) {
            initialSelected.add(TreeEntityIds.character(c.id));
          }
        }

        const promptChainEntries = Object.values(templateGroupData).flatMap((g) =>
          Object.keys(g.templateChains)
        );
        if (promptChainEntries.length > 0) {
          initialSelected.add(TreeEntityIds.rootSettings());
          initialSelected.add(TreeEntityIds.rootPromptTemplates());
          for (const [groupId, group] of Object.entries(templateGroupData)) {
            initialSelected.add(TreeEntityIds.promptGroup(groupId));
            for (const chainId of Object.keys(group.templateChains)) {
              initialSelected.add(TreeEntityIds.promptChain(chainId));
            }
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

  // Selected entities decomposition
  const selectedScenarioIds = useMemo(() => {
    if (!stagedData) return [];
    return stagedData.scenarios
      .map((s) => s.scenario.id)
      .filter((id) => selectedIds.has(TreeEntityIds.scenario(id)));
  }, [stagedData, selectedIds]);

  const selectedScenarioCharactersIds = useMemo(() => {
    return selectedScenarioIds.filter((id) => selectedIds.has(TreeEntityIds.scenarioCharacters(id)));
  }, [selectedScenarioIds, selectedIds]);

  const selectedScenarioGroupsIds = useMemo(() => {
    return selectedScenarioIds.filter((id) => selectedIds.has(TreeEntityIds.scenarioGroups(id)));
  }, [selectedScenarioIds, selectedIds]);

  const selectedScenarioSchedulesIds = useMemo(() => {
    return selectedScenarioGroupsIds.filter((id) => selectedIds.has(TreeEntityIds.scenarioSchedules(id)));
  }, [selectedScenarioGroupsIds, selectedIds]);

  const selectedScenarioMemoriesIds = useMemo(() => {
    return selectedScenarioCharactersIds.filter((id) => selectedIds.has(TreeEntityIds.scenarioMemories(id)));
  }, [selectedScenarioCharactersIds, selectedIds]);

  const selectedScenarioConversationsIds = useMemo(() => {
    return selectedScenarioIds.filter((id) => selectedIds.has(TreeEntityIds.scenarioConversations(id)));
  }, [selectedScenarioIds, selectedIds]);

  const selectedScenarioTurnIds = useMemo(() => {
    return selectedScenarioCharactersIds.filter((id) => selectedIds.has(TreeEntityIds.scenarioTurn(id)));
  }, [selectedScenarioCharactersIds, selectedIds]);

  const selectedMapIds = useMemo(() => {
    if (!stagedData) return [];
    return stagedData.maps
      .map((m) => m.id)
      .filter((id) => {
        const isDirectlySelected = selectedIds.has(TreeEntityIds.map(id));
        const isScenarioMapSelected = stagedData.scenarios.some(
          (s) => s.scenario.mapId === id && selectedIds.has(TreeEntityIds.scenarioMap(s.scenario.id, id))
        );
        return isDirectlySelected || isScenarioMapSelected;
      });
  }, [stagedData, selectedIds]);

  const selectedGlobalCharacterIds = useMemo(() => {
    if (!stagedData) return [];
    return stagedData.globalCharacters
      .map((c) => c.id)
      .filter((id) => selectedIds.has(TreeEntityIds.character(id)));
  }, [stagedData, selectedIds]);

  const selectedTemplateChainIds = useMemo(() => {
    if (!stagedData) return [];
    return Object.values(stagedData.templateGroupData).flatMap((group) =>
      Object.keys(group.templateChains).filter((chainId) =>
        selectedIds.has(TreeEntityIds.promptChain(chainId))
      )
    );
  }, [stagedData, selectedIds]);

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
    const treeRoots: TreeNode[] = [];

    // 1. Scenarios (only if present in archive)
    if (stagedData.scenarios.length > 0) {
      treeRoots.push({
        id: TreeEntityIds.rootScenarios(),
        label: 'Scenarios',
        subtitle: `(${stagedData.scenarios.length} in archive)`,
        getChildren: async () => {
          return stagedData.scenarios.map((summary) => {
            const scenId = summary.scenario.id;
            return {
              id: TreeEntityIds.scenario(scenId),
              label: `${summary.userCharacterName} on ${summary.mapName}`,
              subtitle: `Turn ${summary.scenario.turnNumber}`,
              getChildren: async () => {
                const children: TreeNode[] = [];

                if (summary.scenario.mapId) {
                  children.push({
                    id: TreeEntityIds.scenarioMap(scenId, summary.scenario.mapId),
                    label: `Map: ${summary.mapName}`,
                    subtitle: 'Map used by this scenario',
                  });
                }

                children.push(
                  {
                    id: TreeEntityIds.scenarioCharacters(scenId),
                    label: 'Characters',
                    subtitle: 'Scenario characters and portraits',
                  },
                  {
                    id: TreeEntityIds.scenarioGroups(scenId),
                    label: 'Character Groups',
                    subtitle: 'Zones and groups',
                  },
                  {
                    id: TreeEntityIds.scenarioSchedules(scenId),
                    label: 'Group Schedules',
                    subtitle: 'Requires Character Groups',
                  },
                  {
                    id: TreeEntityIds.scenarioMemories(scenId),
                    label: 'Memories & Relationships',
                    subtitle: 'Pairwise memories and relationships',
                  },
                  {
                    id: TreeEntityIds.scenarioConversations(scenId),
                    label: 'Conversation Logs',
                    subtitle: 'Chat logs and participants',
                  },
                  {
                    id: TreeEntityIds.scenarioTurn(scenId),
                    label: 'Active Conversation State',
                    subtitle: 'Saved turn runtime state',
                  }
                );

                return children;
              },
            };
          });
        },
      });
    }

    // 2. Maps (only if present in archive)
    if (stagedData.maps.length > 0) {
      treeRoots.push({
        id: TreeEntityIds.rootMaps(),
        label: 'Maps',
        subtitle: `(${stagedData.maps.length} in archive)`,
        getChildren: async () => {
          return stagedData.maps.map((map) => ({
            id: TreeEntityIds.map(map.id),
            label: map.name,
            subtitle: `${map.locations.length} locations, ${map.zones.length} zones`,
          }));
        },
      });
    }

    // 3. Global Characters (only if present in archive)
    if (stagedData.globalCharacters.length > 0) {
      treeRoots.push({
        id: TreeEntityIds.rootCharacters(),
        label: 'Global Characters',
        subtitle: `(${stagedData.globalCharacters.length} in archive)`,
        getChildren: async () => {
          return stagedData.globalCharacters.map((char) => ({
            id: TreeEntityIds.character(char.id),
            label: `${char.firstName} ${char.lastName}`.trim() || 'Unnamed Character',
            subtitle: char.internalDescription,
          }));
        },
      });
    }

    // 4. Prompt Templates (only if template chains present in archive)
    const promptChainEntries = Object.entries(stagedData.templateGroupData).filter(
      ([, group]) => Object.keys(group.templateChains).length > 0
    );

    if (promptChainEntries.length > 0) {
      treeRoots.push({
        id: TreeEntityIds.rootSettings(),
        label: 'Settings & Prompts',
        getChildren: async () => [
          {
            id: TreeEntityIds.rootPromptTemplates(),
            label: 'Prompt Templates',
            getChildren: async () => {
              return promptChainEntries.map(([groupId, group]) => ({
                id: TreeEntityIds.promptGroup(groupId),
                label: groupId,
                getChildren: async () => {
                  return Object.entries(group.templateChains).map(([chainId, chain]) => ({
                    id: TreeEntityIds.promptChain(chainId),
                    label: chain.title || chainId,
                    subtitle: chain.description,
                    badge: chain.parserSource
                      ? { text: 'Executable Code', variant: 'warning' as const }
                      : undefined,
                  }));
                },
              }));
            },
          },
        ],
      });
    }

    return treeRoots;
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
