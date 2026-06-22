import { useEffect, useState } from 'react';
import type {
  ButtonHandlerResult,
  ScriptSectionDescriptor,
  ScriptSelection,
  SettingsScriptHelpers,
} from '../../../engine/settings/settings_scripts/settings_script.js';
import {
  getControlDefault,
  resolveControls,
  resolveControlValues,
} from '../../../engine/settings/settings_scripts/settings_scripts_store.js';
import {
  customScriptGroupKey,
  makeTextFileGroupKey,
} from '../../../engine/settings/settings_scripts/settings_scripts_state.js';
import { createProxiedFetch } from '../../../backend_bridge/proxied_fetch.js';
import { loadUserTextFileContent } from '../../../backend_bridge/database.js';
import { createSeededRandom } from '../../../engine/settings/settings_scripts/seeded_random.js';
import Modal from '../../ui/Modal.js';
import DeleteButton from '../../ui/DeleteButton.js';
import SettingsScriptControls from './SettingsScriptControls.js';
import { useUserTextFileList } from './useUserTextFileList.js';

const NEW_CUSTOM_OPTION = '__new_custom_script__';

type CustomScriptSettingsProps = {
  descriptor: ScriptSectionDescriptor;
  selection: ScriptSelection;
  visibleControlIds?: string[] | undefined;
};

export default function CustomScriptSettings({
  descriptor,
  selection,
  visibleControlIds,
}: CustomScriptSettingsProps) {
  const {
    sectionId,
    builtinOptions,
    resolveScript,
    getDocumentation,
    documentationTitle,
    enableCustom = false,
  } = descriptor;
  const { selectedScriptId, controlValues, onSelectScript, onSetControlValue, onResetControlValues } =
    selection;
  const customScripts = useUserTextFileList(customScriptGroupKey(sectionId));
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [documentation, setDocumentation] = useState('');
  const [buttonData, setButtonData] = useState<Record<string, unknown>>({});
  const [customSource, setCustomSource] = useState('');

  const isBuiltin = builtinOptions.some((option) => option.value === selectedScriptId);
  const selectedCustom = customScripts.files.find((file) => file.id === selectedScriptId);
  const isCustomSelected = enableCustom && !isBuiltin && Boolean(selectedScriptId);

  useEffect(() => {
    setButtonData({});
  }, [selectedScriptId]);

  useEffect(() => {
    if (!isCustomSelected) {
      setCustomSource('');
      return;
    }

    let cancelled = false;
    void (async () => {
      const text = await customScripts.loadContent(selectedScriptId);
      if (!cancelled) {
        setCustomSource(text ?? '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCustomSelected, selectedScriptId, customScripts.loadContent]);

  const resolved = resolveScript(selectedScriptId, isCustomSelected ? customSource : '');
  const selectedDescription = resolved.ok ? resolved.script.description : undefined;
  const controls = resolved.ok
    ? resolveControls(resolved.script.controls, { controlValues, buttonData })
    : [];

  const makeHelpers = (): SettingsScriptHelpers => ({
    proxiedFetch: createProxiedFetch(undefined),
    abortSignal: undefined,
    loadUserTextFile: (controlId, fileId) =>
      loadUserTextFileContent(makeTextFileGroupKey(sectionId, selectedScriptId, controlId), fileId),
    createSeededRandom,
  });

  const handleButtonClick = async (buttonId: string): Promise<ButtonHandlerResult> => {
    if (!resolved.ok) {
      return { result: 'failure', resultDescription: resolved.error };
    }

    if (!resolved.script.buttonHandler) {
      return { result: 'failure', resultDescription: 'This provider has no handler for that button.' };
    }

    const liveControlValues = resolveControlValues(controls, controlValues);
    const result = await resolved.script.buttonHandler(buttonId, liveControlValues, makeHelpers());
    if (result.data !== undefined) {
      const nextButtonData = { ...buttonData, [buttonId]: result.data };
      setButtonData(nextButtonData);
      persistButtonResolvedValues(nextButtonData);
    }
    return result;
  };

  const persistButtonResolvedValues = (nextButtonData: Record<string, unknown>): void => {
    if (!resolved.ok) {
      return;
    }

    const liveControls = resolveControls(resolved.script.controls, {
      controlValues,
      buttonData: nextButtonData,
    });
    const baselineControls = resolveControls(resolved.script.controls, { controlValues, buttonData: {} });

    for (const control of liveControls) {
      if (control.type === 'button' || controlValues[control.id] !== undefined) {
        continue;
      }

      const liveValue = getControlDefault(control);
      if (!liveValue) {
        continue;
      }

      const baseline = baselineControls.find((candidate) => candidate.id === control.id);
      const baselineValue = baseline ? getControlDefault(baseline) : '';
      if (liveValue !== baselineValue) {
        onSetControlValue(control.id, liveValue);
      }
    }
  };

  const handleProviderChange = async (next: string) => {
    if (next === NEW_CUSTOM_OPTION) {
      const id = await customScripts.create('Untitled script');
      if (id) {
        onSelectScript(id);
      }
      return;
    }
    onSelectScript(next);
  };

  const handleDeleteCustom = async () => {
    if (!selectedCustom) {
      return;
    }
    const nextId = await customScripts.remove(selectedCustom.id);
    onSelectScript(nextId ?? builtinOptions[0]?.value ?? '');
  };

  return (
    <div className="space-y-3">
      {enableCustom && (
        <select
          aria-label="Script provider"
          value={selectedScriptId}
          onChange={(event) => void handleProviderChange(event.target.value)}
          className="rounded-input"
        >
          {!isBuiltin && !selectedCustom && selectedScriptId && (
            <option value={selectedScriptId}>{selectedScriptId}</option>
          )}
          {builtinOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {customScripts.files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.fileName}
            </option>
          ))}
          <option value={NEW_CUSTOM_OPTION}>+ New custom script…</option>
        </select>
      )}

      {selectedDescription && <div className="border rounded-sm p-3">{selectedDescription}</div>}

      {isCustomSelected && selectedCustom && (
        <div className="space-y-2 bordered-section">
          <div className="flex gap-2 items-center">
            <input
              aria-label="Custom script name"
              value={selectedCustom.fileName}
              onChange={(event) =>
                void customScripts.save(selectedCustom.id, event.target.value, customSource)
              }
              className="rounded-input"
            />
            <DeleteButton
              onConfirm={handleDeleteCustom}
              disabled={customScripts.busy}
              confirmTitle="Delete Script"
              confirmLabel="Delete Script"
              label="Delete script"
              confirmMessage={`Delete script "${selectedCustom.fileName || 'Untitled script'}"? This cannot be undone.`}
            />
          </div>

          <button
            type="button"
            className="px-3 py-1 border rounded-sm w-full h-12 button-emphasized"
            onClick={() => {
              setDocumentation(getDocumentation());
              setDocumentationOpen(true);
            }}
          >
            🤖 AI Assistant Instructions 🗒️
          </button>

          <textarea
            aria-label="Custom script source"
            rows={16}
            spellCheck={false}
            value={customSource}
            onChange={(event) => setCustomSource(event.target.value)}
            onBlur={() => void customScripts.save(selectedCustom.id, selectedCustom.fileName, customSource)}
            className="rounded-input font-mono text-sm w-full"
          />

          {customScripts.error && <div className="error-card">{customScripts.error}</div>}
        </div>
      )}

      {resolved.ok ? (
        <SettingsScriptControls
          controls={controls}
          values={controlValues}
          sectionId={sectionId}
          scriptId={selectedScriptId}
          idPrefix={`${sectionId}-${selectedScriptId}`}
          visibleControlIds={visibleControlIds}
          onChange={(controlId, value) => onSetControlValue(controlId, value)}
          onButtonClick={handleButtonClick}
        />
      ) : (
        <div className="error-card">{resolved.error}</div>
      )}

      {!visibleControlIds && (
        <div className="flex justify-end">
          <button type="button" onClick={onResetControlValues} className="px-3 py-1 border rounded-sm">
            Reset to Default
          </button>
        </div>
      )}

      <Modal
        open={documentationOpen}
        onClose={() => setDocumentationOpen(false)}
        className="flex items-center justify-center p-4"
      >
        <div className="bg-emphasized rounded-sm p-4 w-full max-w-4xl space-y-3">
          <header className="space-y-2">
            <h3 className="font-semibold">{documentationTitle}</h3>
            <p className="text-sm text-secondary">
              Copy these instructions into a powerful LLM, tell it what you want the script to do, and let it
              write the script for you.
            </p>
          </header>

          <textarea
            rows={20}
            readOnly
            value={documentation}
            spellCheck={false}
            className="rounded-input font-mono text-xs w-full"
          />

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              className="px-3 py-1 border rounded-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(documentation);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              className="px-3 py-1 border rounded-sm"
              onClick={() => setDocumentationOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
