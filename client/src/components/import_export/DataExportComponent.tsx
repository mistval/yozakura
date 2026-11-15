import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import TreeDataViewer, { type TreeNode } from '../ui/TreeDataViewer.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useMapStore } from '../../state/map_store.js';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';
import { buildExportPayload, sanitizeExportFilename } from '../../backend_bridge/export_payload_builder.js';
import { buildImportExportTreeRoots } from './tree_builder.js';
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
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState<boolean>(false);
  const [exportResult, setExportResult] = useState<ExportResult | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState<boolean>(false);

  const lastSelectedIdsRef = useRef<Set<string>>(new Set());

  const scenarioSummaries = useScenarioStore((s) => s.scenarioSummaries);
  const maps = useMapStore((s) => s.maps);
  const globalCharacters = useGlobalCharactersStore((s) => s.globalCharacters);

  // Notify parent of export progress
  useEffect(() => {
    onExportStateChange?.(isExporting);
  }, [isExporting, onExportStateChange]);

  // Construct tree roots using centralized TreeEntityIds
  const roots = useMemo<TreeNode[]>(() => {
    return buildImportExportTreeRoots({
      scenarios: scenarioSummaries,
      maps,
      globalCharacters,
    });
  }, [scenarioSummaries, maps, globalCharacters]);

  const executeExport = useCallback(
    async (selectedIds: Set<string>, overwrite = false) => {
      lastSelectedIdsRef.current = selectedIds;
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
    [exportName, scenarioSummaries, maps, globalCharacters]
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

      <div>
        <TreeDataViewer
          roots={roots}
          title="Select Items to Export"
          disabled={isExporting}
          renderControls={({ selectedIds, hasSelection }) => (
            <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
              <button
                type="button"
                onClick={() => void executeExport(selectedIds, false)}
                disabled={isExporting || !hasSelection}
                className="px-4 py-2 bg-button-emphasized-bg text-button-emphasized-text font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isExporting ? 'Exporting...' : 'Export Selected Data'}
              </button>
            </div>
          )}
        />
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
          void executeExport(lastSelectedIdsRef.current, true);
        }}
        onClose={() => {
          if (!isExporting) setOverwriteConfirmOpen(false);
        }}
      />
    </div>
  );
}
