import { useEffect, useState } from 'react';
import type {
  ButtonHandlerResult,
  SettingsControlValues,
  SettingsScriptControlsDefinition,
  SettingsScriptHelpers,
} from '../../../engine/settings/settings_scripts/settings_script.js';
import {
  getControlDefault,
  resolveControls,
  resolveControlValues,
  resetScriptControlValues,
  setControlValue,
  setCustomScriptSource,
  useSettingsScriptSection,
} from '../../../engine/settings/settings_scripts/settings_scripts_store.js';
import {
  CUSTOM_SCRIPT_ID,
  makeTextFileGroupKey,
} from '../../../engine/settings/settings_scripts/settings_scripts_state.js';
import { createProxiedFetch } from '../../../backend_bridge/proxied_fetch.js';
import { loadUserTextFileContent } from '../../../backend_bridge/database.js';
import Modal from '../../ui/Modal.js';
import TextSettingEditor from '../ui/TextSettingEditor.js';
import SettingsScriptControls from './SettingsScriptControls.js';

export type ControlScript = {
  controls?: SettingsScriptControlsDefinition | undefined;
  buttonHandler?:
    | ((
        buttonId: string,
        controlValues: SettingsControlValues,
        helpers: SettingsScriptHelpers
      ) => Promise<ButtonHandlerResult>)
    | undefined;
};

export type ResolvedControlScript = { ok: true; script: ControlScript } | { ok: false; error: string };

type CustomScriptSettingsProps = {
  sectionId: string;
  resolveScript: (selectedScriptId: string, customScriptSource: string) => ResolvedControlScript;
  getDocumentation: () => string;
  documentationTitle: string;
  customSourceLabel?: string;
  customSourceTooltipHtml?: string;
  visibleControlIds?: string[] | undefined;
};

export default function CustomScriptSettings({
  sectionId,
  resolveScript,
  getDocumentation,
  documentationTitle,
  customSourceLabel = 'Custom Script',
  customSourceTooltipHtml,
  visibleControlIds,
}: CustomScriptSettingsProps) {
  const section = useSettingsScriptSection(sectionId);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [documentation, setDocumentation] = useState('');
  const [buttonData, setButtonData] = useState<Record<string, unknown>>({});

  const selectedScriptId = section.selectedScriptId;
  const isCustom = selectedScriptId === CUSTOM_SCRIPT_ID;
  const resolved = resolveScript(selectedScriptId, section.customScriptSource);
  const storedValues = section.controlValues[selectedScriptId] ?? {};

  useEffect(() => {
    setButtonData({});
  }, [selectedScriptId]);

  const controls = resolved.ok
    ? resolveControls(resolved.script.controls, { controlValues: storedValues, buttonData })
    : [];

  const makeHelpers = (): SettingsScriptHelpers => ({
    proxiedFetch: createProxiedFetch(undefined),
    abortSignal: undefined,
    loadUserTextFile: (controlId, fileId) =>
      loadUserTextFileContent(makeTextFileGroupKey(sectionId, selectedScriptId, controlId), fileId),
  });

  const handleButtonClick = async (buttonId: string): Promise<ButtonHandlerResult> => {
    if (!resolved.ok) {
      return { result: 'failure', resultDescription: resolved.error };
    }

    if (!resolved.script.buttonHandler) {
      return { result: 'failure', resultDescription: 'This provider has no handler for that button.' };
    }

    const controlValues = resolveControlValues(controls, storedValues);
    const result = await resolved.script.buttonHandler(buttonId, controlValues, makeHelpers());
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
      controlValues: storedValues,
      buttonData: nextButtonData,
    });
    const baselineControls = resolveControls(resolved.script.controls, {
      controlValues: storedValues,
      buttonData: {},
    });

    for (const control of liveControls) {
      if (control.type === 'button' || storedValues[control.id] !== undefined) {
        continue;
      }

      const liveValue = getControlDefault(control);
      if (!liveValue) {
        continue;
      }

      const baseline = baselineControls.find((candidate) => candidate.id === control.id);
      const baselineValue = baseline ? getControlDefault(baseline) : '';
      if (liveValue !== baselineValue) {
        setControlValue(sectionId, selectedScriptId, control.id, liveValue);
      }
    }
  };

  return (
    <div className="space-y-3">
      {isCustom && (
        <>
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

          <TextSettingEditor
            label={customSourceLabel}
            htmlFor={`${sectionId}-custom-script-source`}
            tooltipHtml={customSourceTooltipHtml}
            value={section.customScriptSource}
            onChange={(nextValue) => setCustomScriptSource(sectionId, nextValue)}
            textareaRows={16}
            spellCheck={false}
            enablePasteWarning
          />
        </>
      )}

      {resolved.ok ? (
        <SettingsScriptControls
          controls={controls}
          values={storedValues}
          sectionId={sectionId}
          scriptId={selectedScriptId}
          idPrefix={`${sectionId}-${selectedScriptId}`}
          visibleControlIds={visibleControlIds}
          onChange={(controlId, value) => setControlValue(sectionId, selectedScriptId, controlId, value)}
          onButtonClick={handleButtonClick}
        />
      ) : (
        <div className="error-card">{resolved.error}</div>
      )}

      {!visibleControlIds && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => resetScriptControlValues(sectionId, selectedScriptId)}
            className="px-3 py-1 border rounded-sm"
          >
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
              Copy these instructions into a powerful LLM, tell it which provider you want to support, and let
              it write the script for you. Alternatively, see{' '}
              <a
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-primary"
                href="https://github.com/mistval/yozakura/tree/dev/client/src/engine/settings/settings_scripts/image/builtins"
              >
                here
              </a>{' '}
              where you can find the built-in scripts for reference.
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
              onClick={() => {
                const blob = new Blob([documentation], { type: 'text/markdown;charset=utf-8' });
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `${sectionId}-custom-script-instructions.md`;
                link.click();
                URL.revokeObjectURL(downloadUrl);
              }}
            >
              Download
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
