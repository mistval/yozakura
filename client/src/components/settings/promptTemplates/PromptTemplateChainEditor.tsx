import { useMemo, useState } from 'react';
import type { PromptTemplateChain } from '../../../engine/prompt_templates/prompt_template_chain.js';
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
  const [isDirty, setIsDirty] = useState(false);
  const chainData = chain.settingsBridge.use();
  const defaultChainData = chain.settingsBridge.getDefault();

  const savedValues = useMemo(() => {
    const next: Record<string, string> = {
      [getParserSourceKey()]: chainData.parserSource ?? '',
    };

    for (const { template } of chain.templates) {
      next[getTemplateBodyKey(template.templateId)] =
        chainData.templates[template.templateId]?.templateString ?? template.defaultTemplateString;
    }

    return next;
  }, [chain, chainData]);

  const defaultValues = useMemo(() => {
    const next: Record<string, string> = {
      [getParserSourceKey()]: defaultChainData.parserSource ?? '',
    };

    for (const { template } of chain.templates) {
      next[getTemplateBodyKey(template.templateId)] =
        defaultChainData.templates[template.templateId]?.templateString ?? template.defaultTemplateString;
    }

    return next;
  }, [chain, defaultChainData]);

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
    chain.settingsBridge.set({
      parserSource: draftValues[getParserSourceKey()],
      templates: Object.fromEntries(
        chain.templates.map(({ template }) => [
          template.templateId,
          {
            templateString:
              draftValues[getTemplateBodyKey(template.templateId)] ?? template.defaultTemplateString,
          },
        ])
      ),
    });

    return undefined;
  };

  const handleRevertToDefault = () => {
    chain.settingsBridge.resetToDefault();
  };

  return (
    <>
      <AIAssistantInstructionsButton
        title={`${chainData.title} Template Group Documentation`}
        getDocumentation={() => chain.getDocumentation()}
        fileNameBase={chain.templateChainId}
        isDirty={isDirty}
        instructions="Reading and writing templates is hard. Copy these instructions into a powerful LLM, describe the edits you want, and let it do the work for you. The instructions document is different for each prompt group and contains your templates and parser, so you don't need to copy-paste them separately."
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
