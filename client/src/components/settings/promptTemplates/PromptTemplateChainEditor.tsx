import { useMemo, useState } from 'react';
import type { PromptTemplateChain } from '../../../engine/prompt_templates/prompt_template_chain.js';
import type { PromptTemplateOverride } from '../../../state/settings_store.js';
import { useSettingsStore } from '../../../state/settings_store.js';
import Modal from '../../ui/Modal.js';
import RevertableTextSettingsGroup from '../ui/RevertableTextSettingsGroup.js';
import TextSettingEditor from '../ui/TextSettingEditor.js';
import { settingsTooltips } from '../settings_tooltips.js';
import type { PromptExecutionContext } from '../../../engine/prompt_templates/prompt_template_context_fields.js';

type PromptTemplateChainEditorProps = {
  chain: PromptTemplateChain<PromptExecutionContext, unknown>;
};

function getTemplateBodyKey(templateId: string): string {
  return `templateBody:${templateId}`;
}

function getParserSourceKey(): string {
  return 'parserSource';
}

export default function PromptTemplateChainEditor({ chain }: PromptTemplateChainEditorProps) {
  const promptParserOverrides = useSettingsStore((s) => s.promptParserOverrides);
  const promptTemplateOverrides = useSettingsStore((s) => s.promptTemplateOverrides);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [documentation, setDocumentation] = useState('');

  const parserSource = promptParserOverrides[chain.parser?.parserOverrideSettingId ?? '']?.source;
  const resolvedParserSource = parserSource ?? chain.parser?.defaultParserSource ?? '';

  const savedValues = useMemo(() => {
    const next: Record<string, string> = {
      [getParserSourceKey()]: resolvedParserSource,
    };

    for (const { template } of chain.templates) {
      next[getTemplateBodyKey(template.templateId)] =
        promptTemplateOverrides[template.templateId]?.templateString ?? template.defaultTemplateString;
    }

    return next;
  }, [chain, resolvedParserSource, promptTemplateOverrides]);

  const defaultValues = useMemo(() => {
    const next: Record<string, string> = {
      [getParserSourceKey()]: chain.parser?.defaultParserSource ?? '',
    };

    for (const { template } of chain.templates) {
      next[getTemplateBodyKey(template.templateId)] = template.defaultTemplateString;
    }

    return next;
  }, [chain]);

  const validations = useMemo(() => {
    const next: Record<string, 'eta-template' | 'js-function'> = {};

    if (chain.parser) {
      next[getParserSourceKey()] = 'js-function';
    }

    for (const { template } of chain.templates) {
      next[getTemplateBodyKey(template.templateId)] = 'eta-template';
    }

    return next;
  }, [chain]);

  const handleSave = (draftValues: Record<string, string>) => {
    setSettings((previous) => {
      const nextTemplateOverrides = {
        ...previous.promptTemplateOverrides,
      };
      const nextParserOverrides = {
        ...previous.promptParserOverrides,
      };

      for (const { template } of chain.templates) {
        const nextOverride: PromptTemplateOverride = {};
        const templateBody =
          draftValues[getTemplateBodyKey(template.templateId)] ?? template.defaultTemplateString;

        if (templateBody !== template.defaultTemplateString) {
          nextOverride.templateString = templateBody;
        }

        if (nextOverride.templateString === undefined) {
          nextTemplateOverrides[template.templateId] = null;
        } else {
          nextTemplateOverrides[template.templateId] = nextOverride;
        }
      }

      if (chain.parser) {
        const nextParserSource = draftValues[getParserSourceKey()] ?? chain.parser.defaultParserSource;
        if (nextParserSource === chain.parser.defaultParserSource) {
          nextParserOverrides[chain.parser.parserOverrideSettingId] = null;
        } else {
          nextParserOverrides[chain.parser.parserOverrideSettingId] = {
            source: nextParserSource,
          };
        }
      }

      return {
        promptTemplateOverrides: nextTemplateOverrides,
        promptParserOverrides: nextParserOverrides,
      };
    });

    return undefined;
  };

  const handleRevertToDefault = () => {
    setSettings((previous) => {
      const nextTemplateOverrides = {
        ...previous.promptTemplateOverrides,
      };
      const nextParserOverrides = {
        ...previous.promptParserOverrides,
      };

      for (const { template } of chain.templates) {
        nextTemplateOverrides[template.templateId] = null;
      }

      if (chain.parser) {
        nextParserOverrides[chain.parser.parserOverrideSettingId] = null;
      }

      return {
        promptTemplateOverrides: nextTemplateOverrides,
        promptParserOverrides: nextParserOverrides,
      };
    });
  };

  return (
    <>
      <header className="space-y-1 flex flex-col gap-2">
        <div className="flex  items-start justify-between gap-3">
          <button
            type="button"
            className="px-3 py-1 border rounded-sm w-full h-12 button-emphasized"
            onClick={() => {
              const documentation = chain.getDocumentation();
              setDocumentation(documentation);
              setDocumentationOpen(true);
            }}
          >
            🤖 AI Assistant Instructions 🗒️
          </button>
        </div>
      </header>

      <RevertableTextSettingsGroup
        savedValues={savedValues}
        defaultValues={defaultValues}
        validations={validations}
        onSave={handleSave}
        onRevertToDefault={handleRevertToDefault}
        onIsDirtyChanged={setIsDirty}
      >
        {({ getDraftValue, setDraftValue }) => (
          <div className="space-y-4">
            {chain.templates.map(({ template }) => (
              <section key={template.templateId} className="rounded-lg border p-4 space-y-3 bg-surface-soft">
                <header className="space-y-1">
                  <h4 className="text-sm font-semibold">{template.templateName}</h4>
                  <p className="text-sm text-secondary">{template.templateDescription}</p>
                </header>

                <TextSettingEditor
                  spellCheck={false}
                  draftId={getTemplateBodyKey(template.templateId)}
                  label="Template Body"
                  htmlFor={`template-body-${chain.templateChainId}-${template.templateId}`}
                  tooltipHtml={settingsTooltips['promptTemplates.templateBody']}
                  value={getDraftValue(getTemplateBodyKey(template.templateId))}
                  onChange={(nextValue) => setDraftValue(getTemplateBodyKey(template.templateId), nextValue)}
                  enablePasteWarning
                />
              </section>
            ))}

            {chain.parser && (
              <section className="rounded-lg border p-4 space-y-3 bg-surface-soft">
                <header className="space-y-1">
                  <h4 className="text-sm font-semibold">Parser Source</h4>
                  <p className="text-sm text-secondary">
                    JavaScript function source used to parse the response from the model. Runs after any
                    parsers setup in LLM Settings that also trigger.
                  </p>
                </header>

                <TextSettingEditor
                  draftId={getParserSourceKey()}
                  spellCheck={false}
                  label="Parser Source"
                  htmlFor={`parser-source-${chain.templateChainId}`}
                  value={getDraftValue(getParserSourceKey())}
                  onChange={(nextValue) => setDraftValue(getParserSourceKey(), nextValue)}
                  textareaRows={14}
                  enablePasteWarning
                />
              </section>
            )}
          </div>
        )}
      </RevertableTextSettingsGroup>

      <Modal
        open={documentationOpen}
        onClose={() => setDocumentationOpen(false)}
        className="flex items-center justify-center p-4"
      >
        <div className="bg-emphasized rounded-sm p-4 w-full max-w-4xl space-y-3">
          <header className="space-y-2">
            <h3 className="font-semibold">{chain.templateChainTitle} Template Group Documentation</h3>
            <p className="text-sm text-secondary">
              Reading and writing templates is hard. Copy these instructions into a powerful LLM, describe the
              edits you want, and let it do the work for you. The instructions document is different for each
              prompt group and contains your templates and parser, so you don't need to copy-paste them
              separately.
            </p>
          </header>

          {isDirty && (
            <div className="rounded-sm border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
              You have unsaved template changes. The below instructions document does not include your unsaved
              changes.
            </div>
          )}

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
                link.download = `${chain.templateChainId}.md`;
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
    </>
  );
}
