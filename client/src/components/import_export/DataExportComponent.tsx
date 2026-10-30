import { useState, useEffect, useMemo, useCallback } from 'react';
import TreeDataViewer, { type TreeNode } from '../ui/TreeDataViewer.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useMapStore } from '../../state/map_store.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';
import { useSettingsStore } from '../../state/settings_store.js';
import { buildExportPayload, sanitizeExportFilename } from './exportPayloadBuilder.js';
import { buildImportExportTreeRoots } from './treeBuilder.js';
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
    return buildImportExportTreeRoots({
      mode: 'export',
      scenarios: scenarioSummaries,
      maps,
      globalCharacters,
      templateGroupData,
    });
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
