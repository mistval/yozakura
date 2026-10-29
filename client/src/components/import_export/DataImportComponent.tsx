import { useState, useEffect, useMemo, useCallback } from 'react';
import TreeDataViewer, { type TreeNode } from '../ui/TreeDataViewer.js';
import { importStagingDatabase } from '../../backend_bridge/database.js';
import {
  stageImportArchive,
  cancelImport,
  type StagedManifest,
  type StagedImageEntry,
} from '../../backend_bridge/import_api.js';
import { TreeEntityIds } from './exportPayloadBuilder.js';
import { templateGroupDataSchema } from '../../engine/prompt_templates/template_types.js';
import type { ScenarioSummary, WorldMap, Character } from '../../engine/types.js';
import { z } from 'zod';

export type DataImportComponentProps = {
  onImportStateChange?: (isProcessing: boolean) => void;
};

type StagedData = {
  manifest: StagedManifest;
  images: StagedImageEntry[];
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
  templateGroupData: z.infer<typeof templateGroupDataSchema>;
};

export default function DataImportComponent({ onImportStateChange }: DataImportComponentProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isStaging, setIsStaging] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagedData, setStagedData] = useState<StagedData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Notify parent modal of staging progress
  useEffect(() => {
    onImportStateChange?.(isStaging);
  }, [isStaging, onImportStateChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const handleStageArchive = useCallback(
    async (fileToStage?: File) => {
      const file = fileToStage ?? selectedFile;
      if (!file) return;

      setIsStaging(true);
      setErrorMessage(null);

      try {
        const result = await stageImportArchive(file);
        if (!result.success) {
          setErrorMessage(result.error);
          return;
        }

        // Query importStagingDatabase for staged entities
        const [scenarios, maps, globalCharacters, settingsRow] = await Promise.all([
          importStagingDatabase.loadScenarioSummaries().catch(() => []),
          importStagingDatabase.loadMaps().catch(() => []),
          importStagingDatabase.loadGlobalCharacters().catch(() => []),
          importStagingDatabase
            .loadKeyValue(
              'settings',
              z.object({
                templateGroupData: templateGroupDataSchema.optional(),
              })
            )
            .catch(() => undefined),
        ]);

        const templateGroupData = settingsRow?.templateGroupData ?? {};

        const staged: StagedData = {
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
            initialSelected.add(TreeEntityIds.map(s.scenario.mapId));
            initialSelected.add(TreeEntityIds.scenarioCharacters(scenId));
            initialSelected.add(TreeEntityIds.scenarioGroups(scenId));
            initialSelected.add(TreeEntityIds.scenarioSchedules(scenId));
            initialSelected.add(TreeEntityIds.scenarioMemories(scenId));
            initialSelected.add(TreeEntityIds.scenarioConversations(scenId));
            initialSelected.add(TreeEntityIds.scenarioTurn(scenId));
            initialSelected.add(TreeEntityIds.scenarioEventLogs(scenId));
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
        setErrorMessage(err instanceof Error ? err.message : 'Failed to inspect import archive');
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
      setStagedData(null);
      setSelectedFile(null);
      setSelectedIds(new Set());
    }
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
                    id: TreeEntityIds.map(summary.scenario.mapId),
                    label: `Map: ${summary.mapName}`,
                    subtitle: 'Aliased to map in archive',
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
                  },
                  {
                    id: TreeEntityIds.scenarioEventLogs(scenId),
                    label: 'Event Logs',
                    subtitle: 'Historical simulation event log',
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
        <div>
          <label htmlFor="import-file" className="block text-sm font-medium text-primary mb-1">
            Choose Yozakura Export Archive
          </label>
          <input
            id="import-file"
            type="file"
            accept=".zip,.yozakura_export.zip"
            onChange={handleFileChange}
            disabled={isStaging}
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
          <div className="p-3 bg-danger-bg text-danger-text border border-danger-border rounded text-sm">
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
          <button
            type="button"
            onClick={() => handleStageArchive()}
            disabled={!selectedFile || isStaging}
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
          disabled={isStaging}
          className="text-xs px-2 py-1 rounded border border-border-default hover:bg-surface-hover text-secondary hover:text-primary cursor-pointer disabled:opacity-50"
        >
          Cancel &amp; Unstage
        </button>
      </div>

      <div>
        <div className="text-sm font-medium text-primary mb-2">Select Items to Import</div>
        <TreeDataViewer
          roots={roots}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          disabled={isStaging}
          renderControls={(selection) => (
            <div className="flex items-center justify-between text-xs text-secondary">
              <span>{selection.selectedIds.size} items selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selection.selectAll()}
                  className="hover:text-primary underline cursor-pointer disabled:opacity-50"
                  disabled={isStaging}
                >
                  Select All
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => selection.clearAll()}
                  className="hover:text-primary underline cursor-pointer disabled:opacity-50"
                  disabled={isStaging}
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
          disabled={isStaging}
          className="px-3 py-1.5 text-sm text-secondary hover:text-primary cursor-pointer disabled:opacity-50"
        >
          Back
        </button>

        <button
          type="button"
          disabled={isStaging || selectedIds.size === 0}
          onClick={() => {
            alert('Staging and preview complete! Conflict resolution and commit will occur in Phase 3.');
          }}
          className="px-4 py-2 bg-button-emphasized-bg text-button-emphasized-text font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next: Review &amp; Resolve Conflicts
        </button>
      </div>
    </div>
  );
}
