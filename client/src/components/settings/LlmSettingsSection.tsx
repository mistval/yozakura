import { useState } from 'react';
import _ from 'lodash';
import z from 'zod';
import { useSettingsModal } from './SettingsModalContext.js';
import { LLM_DEFAULTS } from '../../engine/settings/llm_defaults.js';
import { useSettingsStore, type LLMOptionsGroup } from '../../state/settings_store.js';
import { useModalScroll } from '../ui/Modal.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsDangerousHtmlTooltips, settingsTooltips } from './settings_tooltips.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { useLlmConnectionTest } from '../../hooks/useLlmConnectionTest.js';
import { useTextareaPasteWarningGate } from './pasteWarning/useTextareaPasteWarningGate.js';
import { newId } from '../../util/id.js';
import {
  BASE_DEFAULTS_LLM_CONFIG_ID,
  findBaseDefaultsLLMConfig,
  llmConfigSchema,
  parseLlmMetaOptions,
  type LlmInheritToggleMode,
} from '../../engine/settings/cascading_llm_configs.js';
import CompletionsProviderField from './CompletionsProviderField.js';
import { readModelFromMetaOptions, writeModelToMetaOptions } from './meta_options_model.js';
import DeleteButton from '../ui/DeleteButton.js';
import { SpoilerSection } from '../ui/SpoilerSection.js';
import { useQueryParam } from '../../util/queryParams.js';
import { buildObjectReplacementPatch } from '../../util/settings_merge.js';

type ConfigDraft = LLMOptionsGroup;
const DEFAULT_LLM_META_OPTIONS_SOURCE = JSON.stringify(LLM_DEFAULTS, null, 2);
const inheritToggleSelectSchema = z.enum(['inherit', 'enabled', 'disabled']);
type InheritToggleSelectValue = z.infer<typeof inheritToggleSelectSchema>;

function formatInheritToggleMode(mode: LlmInheritToggleMode | undefined): string {
  if (mode === 'enabled') return 'Enabled';
  if (mode === 'disabled') return 'Disabled';
  return '(inherit)';
}

function InheritToggleSelectField({
  id,
  label,
  tooltip,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tooltip: string;
  value: InheritToggleSelectValue;
  onChange: (nextValue: InheritToggleSelectValue) => void;
}) {
  return (
    <div>
      <SettingFieldLabel text={label} htmlFor={id} tooltip={tooltip} />
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const parsed = inheritToggleSelectSchema.safeParse(event.target.value);
          if (!parsed.success) {
            return;
          }

          onChange(parsed.data);
        }}
        className="rounded-input"
      >
        <option value="inherit">Inherit</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
}

function maskToken(token: string) {
  if (token.length <= 8) return '••••••••';
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

function formatMetaOptionsPreview(source: string | undefined) {
  const parsed = parseLlmMetaOptions(source || '{}');
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
  const initialTokenStreaming: InheritToggleSelectValue = config.tokenStreamingEnabled ?? 'inherit';
  const initialAppIdentificationHeaders: InheritToggleSelectValue =
    config.appIdentificationHeadersEnabled ?? 'inherit';
  const [draft, setDraft] = useState({
    ...config,
    name: config.name || '',
    llmUrl: config.llmUrl || '',
    llmAuthToken: config.llmAuthToken || '',
    responsePreParserSource: config.responsePreParserSource || '',
    rule: config.rule || '',
    llmMetaOptionsSource: config.llmMetaOptions || DEFAULT_LLM_META_OPTIONS_SOURCE,
    tokenStreamingEnabled: initialTokenStreaming,
    appIdentificationHeadersEnabled: initialAppIdentificationHeaders,
    concurrencyGroupName: config.concurrencyGroupName || '',
    concurrencyGroupLimit: config.concurrencyGroupLimit?.toString() || '',
  });

  const [saveError, setSaveError] = useState('');
  const {
    loading: connectionTestLoading,
    error: connectionTestError,
    success: connectionTestSuccess,
    responsePreview: connectionTestResponsePreview,
    testGenerateText,
  } = useLlmConnectionTest();
  const { onPasteWithWarning, warningModal } = useTextareaPasteWarningGate({});

  const invalid = !draft.name.trim();

  const buildValidatedConfig = (requireName: boolean): ConfigDraft | undefined => {
    const trimmedName = draft.name.trim();
    if (requireName && !trimmedName) {
      setSaveError('Name is required.');
      return undefined;
    }

    const trimmedRule = draft.rule.trim();
    if (trimmedRule) {
      try {
        new Function('context', `return (${trimmedRule});`);
      } catch (error) {
        setSaveError(`Rule is invalid JavaScript: ${getErrorMessage(error)}`);
        return undefined;
      }
    }

    let llmMetaOptions: unknown;
    try {
      llmMetaOptions = JSON.parse(draft.llmMetaOptionsSource);
    } catch (error) {
      setSaveError(`LLM Meta Options must be valid JSON: ${getErrorMessage(error)}`);
      return undefined;
    }

    if (!llmMetaOptions || typeof llmMetaOptions !== 'object' || Array.isArray(llmMetaOptions)) {
      setSaveError('LLM Meta Options must be a JSON object.');
      return undefined;
    }

    const trimmedUrl = draft.llmUrl.trim();
    const trimmedToken = draft.llmAuthToken.trim();
    const trimmedResponsePreParserSource = draft.responsePreParserSource.trim();
    const trimmedConcurrencyGroupName = draft.concurrencyGroupName.trim();
    const parsedLimit = parseInt(draft.concurrencyGroupLimit.trim(), 10);
    const validLimit = !Number.isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

    if (trimmedResponsePreParserSource) {
      let maybeParser: unknown;
      try {
        maybeParser = new Function(`return (${trimmedResponsePreParserSource});`)();
      } catch (error) {
        setSaveError(`Response Pre-parser is invalid JavaScript: ${getErrorMessage(error)}`);
        return undefined;
      }

      if (typeof maybeParser !== 'function') {
        setSaveError('Response Pre-parser must evaluate to a function.');
        return undefined;
      }
    }

    setSaveError('');
    return llmConfigSchema.parse(
      _.omitBy(
        {
          id: draft.id,
          name: trimmedName || config.name || 'Test Config',
          rule: trimmedRule,
          llmMetaOptions: JSON.stringify(llmMetaOptions, null, 2),
          llmUrl: trimmedUrl || undefined,
          llmAuthToken: trimmedToken || undefined,
          responsePreParserSource: trimmedResponsePreParserSource || undefined,
          tokenStreamingEnabled:
            draft.tokenStreamingEnabled !== 'inherit' ? draft.tokenStreamingEnabled : undefined,
          appIdentificationHeadersEnabled:
            draft.appIdentificationHeadersEnabled !== 'inherit'
              ? draft.appIdentificationHeadersEnabled
              : undefined,
          concurrencyGroupName: trimmedConcurrencyGroupName || undefined,
          concurrencyGroupLimit: validLimit,
        },
        _.isUndefined
      )
    );
  };

  const handleSave = () => {
    const validatedConfig = buildValidatedConfig(true);
    if (!validatedConfig) {
      return;
    }
    onSave(validatedConfig);
  };

  const handleTestGenerateText = async () => {
    const validatedConfig = buildValidatedConfig(false);
    if (!validatedConfig) {
      return;
    }

    const testedConfig: ConfigDraft = {
      ...validatedConfig,
      rule: 'true',
    };
    const baseDefaults = findBaseDefaultsLLMConfig(useSettingsStore.getState().llmConfigs);
    const configsToTest =
      config.id !== BASE_DEFAULTS_LLM_CONFIG_ID && baseDefaults
        ? [baseDefaults, testedConfig]
        : [testedConfig];

    await testGenerateText(configsToTest);
  };

  return (
    <div className="space-y-2">
      <div>
        <SettingFieldLabel
          text="Name"
          htmlFor={`llm-config-name-${config.id}`}
          tooltip={settingsTooltips['llm.name']}
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

      <CompletionsProviderField
        idPrefix={`llm-config-${config.id}`}
        url={draft.llmUrl}
        onUrlChange={(nextUrl) => setDraft((prev) => ({ ...prev, llmUrl: nextUrl }) satisfies typeof prev)}
        authToken={draft.llmAuthToken}
        onAuthTokenChange={(nextToken) =>
          setDraft((prev) => ({ ...prev, llmAuthToken: nextToken }) satisfies typeof prev)
        }
        model={readModelFromMetaOptions(draft.llmMetaOptionsSource)}
        onModelChange={(nextModel) =>
          setDraft(
            (prev) =>
              ({
                ...prev,
                llmMetaOptionsSource: writeModelToMetaOptions(prev.llmMetaOptionsSource, nextModel),
              }) satisfies typeof prev
          )
        }
        allowInherit={config.id !== BASE_DEFAULTS_LLM_CONFIG_ID}
        providerTooltip={settingsTooltips['llm.url']}
        tokenTooltip={settingsTooltips['llm.authToken']}
        modelTooltipDangerousHtml={settingsDangerousHtmlTooltips['llm.model']}
      />

      <SpoilerSection title="Advanced Settings" revealedQueryParam="llmoptionsadvanced">
        <div>
          <SettingFieldLabel
            text="LLM Meta Options (JSON)"
            htmlFor={`llm-config-meta-${config.id}`}
            tooltipDangerousHtml={settingsDangerousHtmlTooltips['llm.metaOptions']}
          />
          <textarea
            id={`llm-config-meta-${config.id}`}
            rows={10}
            value={draft.llmMetaOptionsSource}
            onChange={(event) =>
              setDraft(
                (prev) => ({ ...prev, llmMetaOptionsSource: event.target.value }) satisfies typeof prev
              )
            }
            className="rounded-input font-mono text-sm"
          />
        </div>

        <div>
          <SettingFieldLabel
            text="Rule (optional)"
            htmlFor={`llm-config-rule-${config.id}`}
            tooltipDangerousHtml={settingsDangerousHtmlTooltips['llm.rule']}
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
        </div>

        <div className="space-y-3 mt-3">
          <InheritToggleSelectField
            id={`llm-token-streaming-${config.id}`}
            label="Token streaming"
            tooltip={settingsTooltips['llm.tokenStreaming']}
            value={draft.tokenStreamingEnabled}
            onChange={(nextValue) => setDraft((prev) => ({ ...prev, tokenStreamingEnabled: nextValue }))}
          />
          <InheritToggleSelectField
            id={`llm-app-identification-headers-${config.id}`}
            label="App identification headers"
            tooltip={settingsTooltips['llm.appIdentificationHeaders']}
            value={draft.appIdentificationHeadersEnabled}
            onChange={(nextValue) =>
              setDraft((prev) => ({ ...prev, appIdentificationHeadersEnabled: nextValue }))
            }
          />
          <div className="flex gap-3">
            <div className="w-full">
              <SettingFieldLabel
                text="Concurrency Group Name (optional)"
                htmlFor={`llm-config-concurrency-group-${config.id}`}
                tooltip={settingsTooltips['llm.concurrencyGroupName']}
              />
              <input
                id={`llm-config-concurrency-group-${config.id}`}
                value={draft.concurrencyGroupName}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, concurrencyGroupName: event.target.value }))
                }
                placeholder="default_llm"
                className="rounded-input"
              />
            </div>

            <div className="w-full">
              <SettingFieldLabel
                text="Concurrency Group Limit (optional)"
                htmlFor={`llm-config-concurrency-limit-${config.id}`}
                tooltip={settingsTooltips['llm.concurrencyGroupLimit']}
              />
              <input
                id={`llm-config-concurrency-limit-${config.id}`}
                type="number"
                min={1}
                value={draft.concurrencyGroupLimit}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, concurrencyGroupLimit: event.target.value }))
                }
                placeholder="2"
                className="rounded-input"
              />
            </div>
          </div>

          <div>
            <SettingFieldLabel
              text="Response Pre-parser (optional)"
              htmlFor={`llm-config-response-pre-parser-${config.id}`}
              tooltipDangerousHtml={settingsDangerousHtmlTooltips['llm.responsePreParser']}
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
        </div>
      </SpoilerSection>

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
          onClick={() => void handleTestGenerateText()}
          disabled={connectionTestLoading}
          className="px-3 py-1 border rounded-sm"
        >
          {connectionTestLoading ? 'Testing...' : 'Test Generation'}
        </button>
        {connectionTestSuccess && (
          <p className="text-sm text-secondary self-center">
            ✓ Model responded: &ldquo;{connectionTestResponsePreview}&rdquo;
          </p>
        )}
      </div>
      {warningModal}
    </div>
  );
}

export default function LlmSettingsSection() {
  const { setSettingsSection } = useSettingsModal();
  const llmConfigs = useSettingsStore((s) => s.llmConfigs);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const modalScroll = useModalScroll();
  const [editingId, setEditingId] = useQueryParam('llmoptionsid');

  const configs: LLMOptionsGroup[] = Object.values(llmConfigs || {});
  const hasMultipleConfigs = configs.length > 1;

  const updateConfig = (id: string, nextConfig: ConfigDraft) => {
    setSettings((previous) => ({
      llmConfigs: {
        [id]: buildObjectReplacementPatch(previous.llmConfigs?.[id], nextConfig),
      },
    }));
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
        <div className="flex flex-wrap justify-between items-center gap-2">
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
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium min-w-0 wrap-break-word">{config.name}</div>
                      <div className="flex items-center gap-2 shrink-0">
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
                    <div className="text-sm text-muted wrap-break-word">
                      Completions API URL: {config.llmUrl || '(inherit)'}
                    </div>
                    <div className="text-sm text-muted wrap-break-word">
                      Bearer Token: {config.llmAuthToken ? maskToken(config.llmAuthToken) : '(inherit)'}
                    </div>
                    <div className="text-sm text-muted wrap-break-word">Rule: {config.rule || '(none)'}</div>
                    <div className="text-sm text-muted wrap-break-word">
                      Response Pre-parser: {formatResponsePreParserPreview(config.responsePreParserSource)}
                    </div>
                    <div className="text-sm text-muted wrap-break-word">
                      Meta Options: {formatMetaOptionsPreview(config.llmMetaOptions)}
                    </div>
                    {config.concurrencyGroupName && (
                      <div className="text-sm text-muted wrap-break-word">
                        Concurrency: {config.concurrencyGroupName}{' '}
                        {config.concurrencyGroupLimit ? `(Limit: ${config.concurrencyGroupLimit})` : ''}
                      </div>
                    )}
                    <div className="text-sm text-muted wrap-break-word">
                      Token Streaming: {formatInheritToggleMode(config.tokenStreamingEnabled)}
                    </div>
                    <div className="text-sm text-muted wrap-break-word">
                      App Identification Headers:{' '}
                      {formatInheritToggleMode(config.appIdentificationHeadersEnabled)}
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
                      const parsedMetaOptions = parseLlmMetaOptions(config.llmMetaOptions);
                      const hasMetaOptions = Boolean(Object.keys(parsedMetaOptions).length);
                      if (
                        !config.rule &&
                        !config.llmUrl &&
                        !config.llmAuthToken &&
                        !config.responsePreParserSource &&
                        !config.tokenStreamingEnabled &&
                        !config.appIdentificationHeadersEnabled &&
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
