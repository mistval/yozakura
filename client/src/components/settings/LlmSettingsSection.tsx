import { useState } from 'react';
import { useSettingsModal } from './SettingsModalContext.js';
import { LLM_DEFAULTS } from '../../engine/settings/llm_defaults.js';
import { useSettingsStore, type LLMOptionsGroup } from '../../state/settings_store.js';
import { useModalScroll } from '../ui/Modal.js';
import CheckboxSettingRow from './ui/CheckboxSettingRow.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { useLlmConnectionTest } from '../../hooks/useLlmConnectionTest.js';
import { useTextareaPasteWarningGate } from './pasteWarning/useTextareaPasteWarningGate.js';
import { newId } from '../../util/id.js';
import { readModelFromMetaOptions, writeModelToMetaOptions } from './meta_options_model.js';
import DeleteButton from '../ui/DeleteButton.js';

type ConfigDraft = LLMOptionsGroup;
const DEFAULT_LLM_META_OPTIONS_SOURCE = JSON.stringify(LLM_DEFAULTS, null, 2);

function maskToken(token: string) {
  if (token.length <= 8) return '••••••••';
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

function formatMetaOptionsPreview(source: string | undefined) {
  const parsed = JSON.parse(source || '{}') as Record<string, unknown>;
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return '(none)';
  }

  const preview = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ');

  return entries.length > 3 ? `${preview}, ...` : preview;
}

function formatResponsePreParserPreview(source: string | undefined) {
  const trimmedSource = source?.trim();
  if (!trimmedSource) {
    return '(inherit)';
  }

  const firstNonEmptyLine =
    trimmedSource
      .split('\n')
      .map((line) => line.trim())
      .find((line) => Boolean(line)) || trimmedSource;
  if (firstNonEmptyLine.length <= 80) {
    return firstNonEmptyLine;
  }

  return `${firstNonEmptyLine.slice(0, 77)}...`;
}

function ConfigEditor({
  config,
  onSave,
  onCancel,
}: {
  config: ConfigDraft;
  onSave: (config: ConfigDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    ...config,
    name: config.name || '',
    llmUrl: config.llmUrl || '',
    llmAuthToken: config.llmAuthToken || '',
    responsePreParserSource: config.responsePreParserSource || '',
    rule: config.rule || '',
    llmMetaOptionsSource: config.llmMetaOptions || DEFAULT_LLM_META_OPTIONS_SOURCE,
  });

  const [showToken, setShowToken] = useState(false);
  const [saveError, setSaveError] = useState('');
  const {
    loading: connectionTestLoading,
    error: connectionTestError,
    success: connectionTestSuccess,
    testConnection,
  } = useLlmConnectionTest();
  const { onPasteWithWarning, warningModal } = useTextareaPasteWarningGate({});

  const invalid = !draft.name.trim();

  const handleSave = () => {
    const trimmedRule = draft.rule.trim();
    if (trimmedRule) {
      try {
        new Function('context', `return (${trimmedRule});`);
      } catch (error) {
        setSaveError(`Rule is invalid JavaScript: ${getErrorMessage(error)}`);
        return;
      }
    }

    let llmMetaOptions: unknown;
    try {
      llmMetaOptions = JSON.parse(draft.llmMetaOptionsSource);
    } catch (error) {
      setSaveError(`LLM Meta Options must be valid JSON: ${getErrorMessage(error)}`);
      return;
    }

    if (!llmMetaOptions || typeof llmMetaOptions !== 'object' || Array.isArray(llmMetaOptions)) {
      setSaveError('LLM Meta Options must be a JSON object.');
      return;
    }

    const trimmedUrl = draft.llmUrl.trim();
    const trimmedToken = draft.llmAuthToken.trim();
    const trimmedResponsePreParserSource = draft.responsePreParserSource.trim();

    if (trimmedResponsePreParserSource) {
      let maybeParser: unknown;
      try {
        maybeParser = new Function(`return (${trimmedResponsePreParserSource});`)();
      } catch (error) {
        setSaveError(`Response Pre-parser is invalid JavaScript: ${getErrorMessage(error)}`);
        return;
      }

      if (typeof maybeParser !== 'function') {
        setSaveError('Response Pre-parser must evaluate to a function.');
        return;
      }
    }

    setSaveError('');
    onSave({
      id: draft.id,
      name: draft.name.trim(),
      rule: trimmedRule,
      llmMetaOptions: JSON.stringify(llmMetaOptions, null, 2),
      ...(trimmedUrl ? { llmUrl: trimmedUrl } : {}),
      ...(trimmedToken ? { llmAuthToken: trimmedToken } : {}),
      ...(trimmedResponsePreParserSource ? { responsePreParserSource: trimmedResponsePreParserSource } : {}),
    });
  };

  const handleTestConnection = () => testConnection(draft.llmUrl.trim(), draft.llmAuthToken.trim());

  return (
    <div className="space-y-2">
      <div>
        <SettingFieldLabel
          text="Name"
          htmlFor={`llm-config-name-${config.id}`}
          tooltipHtml={settingsTooltips['llm.name']}
        />
        <input
          id={`llm-config-name-${config.id}`}
          value={draft.name}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, name: event.target.value }) satisfies typeof prev)
          }
          placeholder="Local 12B"
          className="rounded-input"
        />
      </div>

      <div>
        <SettingFieldLabel
          text="Completions API URL"
          htmlFor={`llm-config-url-${config.id}`}
          tooltipHtml={settingsTooltips['llm.url']}
        />
        <input
          id={`llm-config-url-${config.id}`}
          value={draft.llmUrl}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, llmUrl: event.target.value }) satisfies typeof prev)
          }
          placeholder="http://localhost:5001/v1/chat/completions"
          className="rounded-input"
        />
      </div>

      <div>
        <SettingFieldLabel
          text="Bearer Token (optional)"
          htmlFor={`llm-config-auth-${config.id}`}
          tooltipHtml={settingsTooltips['llm.authToken']}
        />
        <div className="flex gap-2">
          <input
            id={`llm-config-auth-${config.id}`}
            type={showToken ? 'text' : 'password'}
            value={draft.llmAuthToken}
            onChange={(event) =>
              setDraft(
                (prev) =>
                  ({
                    ...prev,
                    llmAuthToken: event.target.value,
                  }) satisfies typeof prev
              )
            }
            placeholder="Bearer token"
            className="rounded-input"
          />
          <button
            type="button"
            onClick={() => setShowToken((prev) => !prev)}
            className="shrink-0 px-2 py-1 border rounded-sm"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <SettingFieldLabel
          text="Rule (optional)"
          htmlFor={`llm-config-rule-${config.id}`}
          tooltipHtml={settingsTooltips['llm.rule']}
        />
        <input
          id={`llm-config-rule-${config.id}`}
          value={draft.rule}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, rule: event.target.value }) satisfies typeof prev)
          }
          placeholder="context.promptTemplateGroup === 'gen_intelligent_next_speaker_select'"
          className="rounded-input"
          onPaste={(event) => {
            onPasteWithWarning(event, {
              value: draft.rule,
              applyValue: (val) => {
                setDraft((prev) => ({ ...prev, rule: val }) satisfies typeof prev);
              },
            });
          }}
        />
        <div className="text-xs text-muted mt-1">
          e.g. context.promptTemplateGroup === 'gen_intelligent_next_speaker_select'
        </div>
      </div>

      <div>
        <SettingFieldLabel
          text="Model (optional)"
          htmlFor={`llm-config-model-${config.id}`}
          tooltipHtml={settingsTooltips['llm.model']}
        />
        <input
          id={`llm-config-model-${config.id}`}
          value={readModelFromMetaOptions(draft.llmMetaOptionsSource)}
          onChange={(event) =>
            setDraft(
              (prev) =>
                ({
                  ...prev,
                  llmMetaOptionsSource: writeModelToMetaOptions(
                    prev.llmMetaOptionsSource,
                    event.target.value
                  ),
                }) satisfies typeof prev
            )
          }
          placeholder="deepseek/deepseek-chat"
          className="rounded-input"
        />
      </div>

      <div>
        <SettingFieldLabel
          text="LLM Meta Options (JSON)"
          htmlFor={`llm-config-meta-${config.id}`}
          tooltipHtml={settingsTooltips['llm.metaOptions']}
        />
        <textarea
          id={`llm-config-meta-${config.id}`}
          rows={10}
          value={draft.llmMetaOptionsSource}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, llmMetaOptionsSource: event.target.value }) satisfies typeof prev)
          }
          className="rounded-input font-mono text-sm"
        />
      </div>

      <div>
        <SettingFieldLabel
          text="Response Pre-parser (optional)"
          htmlFor={`llm-config-response-pre-parser-${config.id}`}
          tooltipHtml={settingsTooltips['llm.responsePreParser']}
        />
        <textarea
          id={`llm-config-response-pre-parser-${config.id}`}
          rows={8}
          value={draft.responsePreParserSource}
          onChange={(event) =>
            setDraft(
              (prev) => ({ ...prev, responsePreParserSource: event.target.value }) satisfies typeof prev
            )
          }
          className="rounded-input font-mono text-sm"
          onPaste={(event) => {
            onPasteWithWarning(event, {
              value: draft.responsePreParserSource,
              applyValue: (val) => {
                setDraft((prev) => ({ ...prev, responsePreParserSource: val }) satisfies typeof prev);
              },
            });
          }}
        />
        <div className="text-xs text-muted mt-1">
          Must evaluate to <code>(response) =&gt; string</code>. Leave blank to inherit.
        </div>
      </div>

      {saveError && <div className="error-card">{saveError}</div>}
      {connectionTestError && <div className="error-card">{connectionTestError}</div>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleSave} disabled={invalid} className="px-3 py-1 border rounded-sm">
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1 border rounded-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleTestConnection()}
          disabled={connectionTestLoading}
          className="px-3 py-1 border rounded-sm"
        >
          {connectionTestLoading ? 'Testing...' : 'Test Connection'}
        </button>
        {connectionTestSuccess && (
          <p className="text-sm text-secondary self-center">✓ Connection successful.</p>
        )}
      </div>
      {warningModal}
    </div>
  );
}

export default function LlmSettingsSection() {
  const { setSettingsSection } = useSettingsModal();
  const llmConfigs = useSettingsStore((s) => s.llmConfigs);
  const tokenStreamingEnabled = useSettingsStore((s) => s.tokenStreamingEnabled);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const modalScroll = useModalScroll();
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  const configs: LLMOptionsGroup[] = Object.values(llmConfigs || {});
  const hasMultipleConfigs = configs.length > 1;

  const updateConfig = (id: string, nextConfig: ConfigDraft) => {
    setSettings({ llmConfigs: { [id]: nextConfig } });
  };

  const addConfig = () => {
    const id = newId();
    setSettings({
      llmConfigs: {
        [id]: {
          id,
          name: 'New Option Group',
          rule: '',
          llmMetaOptions: '{}',
        },
      },
    });

    setEditingId(id);

    if (modalScroll) {
      modalScroll.scrollToBottom('smooth');
    }
  };

  const removeConfig = (id: string) => {
    setSettings((previous) => {
      const configCount = Object.keys(previous.llmConfigs || {}).length;
      if (configCount <= 1) return {};

      return { llmConfigs: { [id]: null } };
    });

    if (editingId === id) {
      setEditingId(undefined);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">LLM Settings</h2>
      </div>

      <div className="bordered-section">
        <CheckboxSettingRow
          id="llm-token-streaming"
          label="Token streaming"
          tooltipHtml={settingsTooltips['llm.tokenStreaming']}
          checked={tokenStreamingEnabled}
          onChange={(nextChecked) => setSettings({ tokenStreamingEnabled: nextChecked })}
        />

        <div className="flex justify-between items-center">
          <h3 className="font-medium">LLM Prompt Options</h3>
          <button type="button" onClick={addConfig} className="px-3 py-1 border rounded-sm">
            Add Option Group
          </button>
        </div>

        <p className="text-sm text-secondary">
          Control LLM prompting meta options on a per-prompt basis. Any options group whose <code>rule</code>{' '}
          evaluates to true will be applied. If you just want to change your global LLM provider or model,
          edit Base Defaults. Anything beyond that is for advanced use cases.
        </p>

        <div className="space-y-3">
          {configs.map((config) => {
            const editing = editingId === config.id;
            const isOnlyConfig = !hasMultipleConfigs;
            const canDelete = !isOnlyConfig;

            return (
              <div key={config.id} className="border rounded-sm p-3 space-y-2 bg-inset">
                {!editing ? (
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-medium">{config.name}</div>
                      <div className="text-sm text-muted">
                        Completions API URL: {config.llmUrl || '(inherit)'}
                      </div>
                      <div className="text-sm text-muted">
                        Bearer Token: {config.llmAuthToken ? maskToken(config.llmAuthToken) : '(inherit)'}
                      </div>
                      <div className="text-sm text-muted">Rule: {config.rule || '(none)'}</div>
                      <div className="text-sm text-muted">
                        Response Pre-parser: {formatResponsePreParserPreview(config.responsePreParserSource)}
                      </div>
                      <div className="text-sm text-muted">
                        Meta Options: {formatMetaOptionsPreview(config.llmMetaOptions)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(config.id)}
                        className="px-3 py-1 border rounded-sm"
                      >
                        Edit
                      </button>
                      <DeleteButton
                        className="px-3 py-1 border rounded-sm"
                        label="Delete"
                        disabled={!canDelete}
                        confirmTitle="Delete Options Group"
                        confirmLabel="Delete"
                        confirmMessage={`Are you sure you want to delete this options group? ("${config.name}")`}
                        onConfirm={() => removeConfig(config.id)}
                      />
                    </div>
                  </div>
                ) : (
                  <ConfigEditor
                    config={config}
                    onSave={(nextConfig) => {
                      updateConfig(config.id, nextConfig);
                      setEditingId(undefined);
                    }}
                    onCancel={() => {
                      setEditingId(undefined);
                      const parsedMetaOptions = JSON.parse(config.llmMetaOptions) as Record<string, unknown>;
                      const hasMetaOptions = Boolean(Object.keys(parsedMetaOptions).length);
                      if (
                        !config.rule &&
                        !config.llmUrl &&
                        !config.llmAuthToken &&
                        !config.responsePreParserSource &&
                        !hasMetaOptions
                      ) {
                        removeConfig(config.id);
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button type="button" className="card-button" onClick={() => setSettingsSection('llm/promptlog')}>
        <p className="text-base font-semibold">Prompt Log</p>
        <p className="text-sm text-secondary">
          Inspect recent raw prompt payloads, transport options, and pre-parser LLM responses.
        </p>
      </button>
    </div>
  );
}
