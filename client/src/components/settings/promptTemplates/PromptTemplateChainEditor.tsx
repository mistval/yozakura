import { useMemo, useState } from 'react';
import type { PromptTemplateChain } from '../../../engine/prompt_templates/prompt_template_chain.js';
import type { PromptTemplateOverride } from '../../../state/settings_store.js';
import { useSettingsStore } from '../../../state/settings_store.js';
import RevertableTextSettingsGroup from '../ui/RevertableTextSettingsGroup.js';
import TextSettingEditor from '../ui/TextSettingEditor.js';
import { settingsTooltips } from '../settings_tooltips.js';
import type { PromptExecutionContext } from '../../../engine/prompt_templates/prompt_template_context_fields.js';
import AIAssistantInstructionsButton from '../../ui/AIAssistantInstructionsButton.js';

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
  const [isDirty, setIsDirty] = useState(false);

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
      <AIAssistantInstructionsButton
        title={`${chain.templateChainTitle} Template Group Documentation`}
        getDocumentation={() => chain.getDocumentation()}
        fileNameBase={chain.templateChainId}
        isDirty={isDirty}
      />

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
    </>
  );
}
