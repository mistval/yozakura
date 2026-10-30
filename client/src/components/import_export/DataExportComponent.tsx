import { useState, useEffect, useMemo, useCallback } from 'react';
import TreeDataViewer, { type TreeNode } from '../ui/TreeDataViewer.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useMapStore } from '../../state/map_store.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';
import { useSettingsStore } from '../../state/settings_store.js';
import { buildExportPayload, sanitizeExportFilename, TreeEntityIds } from './exportPayloadBuilder.js';
import { requestDataExport, type ExportResult } from '../../backend_bridge/export_api.js';

function getDefaultExportName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `yozakura_export_${dateStr}`;
}

export type DataExportComponentProps = {
  onExportStateChange?: (isExporting: boolean) => void;
};

export default function DataExportComponent({ onExportStateChange }: DataExportComponentProps) {
  const [exportName, setExportName] = useState<string>(() => getDefaultExportName());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState<boolean>(false);
  const [exportResult, setExportResult] = useState<ExportResult | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState<boolean>(false);

  const scenarioSummaries = useScenarioStore((s) => s.scenarioSummaries);
  const scenarioSummariesLoaded = useScenarioStore((s) => s.scenarioSummariesAreLoaded);
  const maps = useMapStore((s) => s.maps);
  const mapsLoaded = useMapStore((s) => s.mapsAreLoaded);
  const globalCharacters = useGlobalCharactersStore((s) => s.globalCharacters);
  const globalCharactersLoaded = useGlobalCharactersStore((s) => s.globalCharactersAreLoaded);
  const templateGroupData = useSettingsStore((s) => s.templateGroupData);

  // Notify parent of export progress
  useEffect(() => {
    onExportStateChange?.(isExporting);
  }, [isExporting, onExportStateChange]);

  // Ensure stores are populated
  useEffect(() => {
    if (!scenarioSummariesLoaded) {
      void useScenarioStore.getState().refreshScenarioSummaries();
    }
    if (!mapsLoaded) {
      void useMapStore.getState().refreshMaps();
    }
    if (!globalCharactersLoaded) {
      void useGlobalCharactersStore.getState().refresh();
    }
  }, [scenarioSummariesLoaded, mapsLoaded, globalCharactersLoaded]);

  // Construct tree roots using centralized TreeEntityIds
  const roots = useMemo<TreeNode[]>(() => {
    const treeRoots: TreeNode[] = [];

    // 1. Scenarios Root
    const scenariosRoot: TreeNode = {
      id: TreeEntityIds.rootScenarios(),
      label: 'Scenarios',
      subtitle: `(${scenarioSummaries.length} available)`,
      getChildren: async () => {
        return scenarioSummaries.map((summary) => {
          const scenId = summary.scenario.id;
          return {
            id: TreeEntityIds.scenario(scenId),
            label: `${summary.userCharacterName} on ${summary.mapName}`,
            subtitle: `Turn ${summary.scenario.turnNumber}`,
            getChildren: async () => [
              {
                id: TreeEntityIds.map(summary.scenario.mapId),
                label: `Map: ${summary.mapName}`,
                subtitle: 'Aliased to global map',
              },
              {
                id: TreeEntityIds.scenarioCharacters(scenId),
                label: 'Characters',
                subtitle: 'Scenario character definitions and cards',
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
                subtitle: 'Global memories, relationship graphs and summaries',
              },
              {
                id: TreeEntityIds.scenarioConversations(scenId),
                label: 'Conversation Logs',
                subtitle: 'Chat logs, participants and images',
              },
              {
                id: TreeEntityIds.scenarioTurn(scenId),
                label: 'Active Conversation State',
                subtitle: 'Current turn runtime state',
              },
            ],
          };
        });
      },
    };
    treeRoots.push(scenariosRoot);

    // 2. Maps Root
    const mapsRoot: TreeNode = {
      id: TreeEntityIds.rootMaps(),
      label: 'Maps',
      subtitle: `(${maps.length} available)`,
      getChildren: async () => {
        return maps.map((map) => ({
          id: TreeEntityIds.map(map.id),
          label: map.name,
          subtitle: `${map.locations.length} locations, ${map.zones.length} zones`,
        }));
      },
    };
    treeRoots.push(mapsRoot);

    // 3. Global Characters Root
    const charactersRoot: TreeNode = {
      id: TreeEntityIds.rootCharacters(),
      label: 'Global Characters',
      subtitle: `(${globalCharacters.length} available)`,
      getChildren: async () => {
        return globalCharacters.map((char) => ({
          id: TreeEntityIds.character(char.id),
          label: `${char.firstName} ${char.lastName}`.trim() || 'Unnamed Character',
          subtitle: char.internalDescription,
        }));
      },
    };
    treeRoots.push(charactersRoot);

    // 4. Settings & Prompt Templates Root
    const promptChainsExist = Object.values(templateGroupData).some(
      (g) => Object.keys(g.templateChains).length > 0
    );

    if (promptChainsExist) {
      const settingsRoot: TreeNode = {
        id: TreeEntityIds.rootSettings(),
        label: 'Settings & Prompts',
        getChildren: async () => [
          {
            id: TreeEntityIds.rootPromptTemplates(),
            label: 'Prompt Templates',
            getChildren: async () => {
              const groupNodes: TreeNode[] = [];
              for (const [groupId, group] of Object.entries(templateGroupData)) {
                const chainEntries = Object.entries(group.templateChains);
                if (chainEntries.length === 0) continue;

                groupNodes.push({
                  id: TreeEntityIds.promptGroup(groupId),
                  label: groupId,
                  getChildren: async () => {
                    return chainEntries.map(([chainId, chain]) => ({
                      id: TreeEntityIds.promptChain(chainId),
                      label: chain.title || chainId,
                      subtitle: chain.description,
                      ...(chain.parserSource
                        ? { badge: { text: 'Executable Code', variant: 'warning' as const } }
                        : {}),
                    }));
                  },
                });
              }
              return groupNodes;
            },
          },
        ],
      };
      treeRoots.push(settingsRoot);
    }

    return treeRoots;
  }, [scenarioSummaries, maps, globalCharacters, templateGroupData]);

  const executeExport = useCallback(
    async (overwrite = false) => {
      setIsExporting(true);
      setErrorMessage(undefined);
      setExportResult(undefined);

      try {
        const payload = buildExportPayload({
          exportName,
          overwrite,
          selectedIds,
          scenarios: scenarioSummaries,
          maps,
          globalCharacters,
          templateGroupData,
        });

        const result = await requestDataExport(payload);

        if (!result.success) {
          if ('alreadyExists' in result && result.alreadyExists) {
            setOverwriteConfirmOpen(true);
          } else if ('error' in result) {
            setErrorMessage(result.error);
          }
        } else {
          setExportResult(result);
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown export error');
      } finally {
        setIsExporting(false);
      }
    },
    [exportName, selectedIds, scenarioSummaries, maps, globalCharacters, templateGroupData]
  );

  const handleCopyPath = () => {
    if (exportResult && exportResult.success) {
      void navigator.clipboard.writeText(exportResult.filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const finalZipFilename = sanitizeExportFilename(exportName);

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <label htmlFor="export-name" className="block text-sm font-medium text-primary mb-1">
          Export Archive Name
        </label>
        <div className="flex items-center gap-2">
          <input
            id="export-name"
            type="text"
            value={exportName}
            onChange={(e) => setExportName(e.target.value)}
            className="flex-1 rounded border border-border-default bg-surface px-3 py-1.5 text-sm text-primary focus:ring-focus-ring disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="my_export"
            disabled={isExporting}
          />
        </div>
        <div className="text-xs text-secondary mt-1">
          Will be saved to{' '}
          <code className="text-secondary-strong">&lt;dataDir&gt;/data_exports/{finalZipFilename}</code>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-primary mb-2">Select Items to Export</div>
        <TreeDataViewer
          roots={roots}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          disabled={isExporting}
          renderControls={(selection) => (
            <div className="flex items-center justify-between text-xs text-secondary">
              <span>{selection.selectedIds.size} items selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selection.selectAll()}
                  className="hover:text-primary underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                  disabled={isExporting}
                >
                  Select All
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => selection.clearAll()}
                  className="hover:text-primary underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                  disabled={isExporting}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {isExporting && (
        <div className="p-3 bg-surface border border-border-default rounded text-sm flex items-center gap-3 text-primary font-medium animate-pulse">
          <span className="text-base animate-spin inline-block">⟳</span>
          <span>Exporting data to {finalZipFilename}... Please wait.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-danger-bg text-danger-text border border-danger-border rounded text-sm">
          {errorMessage}
        </div>
      )}

      {exportResult && exportResult.success && (
        <div className="p-4 bg-success-bg text-success-text border border-success-border rounded space-y-2 text-sm">
          <div className="font-semibold">✓ Export completed successfully!</div>
          <div className="text-xs break-all">
            Saved to:{' '}
            <code className="font-mono bg-surface-subtle px-1 py-0.5 rounded">{exportResult.filePath}</code>
          </div>
          <div>
            <button
              type="button"
              onClick={handleCopyPath}
              disabled={isExporting}
              className="px-2 py-1 bg-surface border border-border-default rounded text-xs text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? 'Copied to clipboard!' : 'Copy Full Path'}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
        <button
          type="button"
          onClick={() => executeExport(false)}
          disabled={isExporting || selectedIds.size === 0}
          className="px-4 py-2 bg-button-emphasized-bg text-button-emphasized-text font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isExporting ? 'Exporting...' : 'Export Selected Data'}
        </button>
      </div>

      <ConfirmDialog
        open={overwriteConfirmOpen}
        title="Export File Already Exists"
        message={`The file "${finalZipFilename}" already exists in the data_exports folder. Do you want to overwrite it?`}
        confirmLabel="Overwrite"
        cancelLabel="Cancel"
        confirmDisabled={isExporting}
        onConfirm={() => {
          setOverwriteConfirmOpen(false);
          void executeExport(true);
        }}
        onClose={() => {
          if (!isExporting) setOverwriteConfirmOpen(false);
        }}
      />
    </div>
  );
}
