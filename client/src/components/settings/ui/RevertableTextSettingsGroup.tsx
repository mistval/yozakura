import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../../errors/error_util.js';
import { etaCompile } from '../../../util/eta.js';

type TextDraftValues = Record<string, string>;

type TextDraftValidation = 'js-function' | 'eta-template';

type RevertableTextSettingsGroupRenderApi = {
  getDraftValue: (draftId: string) => string;
  setDraftValue: (draftId: string, nextValue: string) => void;
};

type RevertableTextSettingsGroupProps = {
  savedValues: TextDraftValues;
  defaultValues?: TextDraftValues;
  onSave: (draftValues: TextDraftValues) => string | undefined | void;
  validations?: Record<string, TextDraftValidation>;
  onRevert?: () => void;
  onRevertToDefault?: (defaultValues: TextDraftValues) => void;
  onIsDirtyChanged?: (isDirty: boolean) => void;
  saveButtonLabel?: string;
  revertButtonLabel?: string;
  revertToDefaultButtonLabel?: string;
  children: (api: RevertableTextSettingsGroupRenderApi) => ReactNode;
};

function isDirtyDraft(savedValues: TextDraftValues, draftValues: TextDraftValues): boolean {
  const keys = new Set(Object.keys(savedValues).concat(Object.keys(draftValues)));
  for (const key of keys) {
    if ((draftValues[key] ?? '') !== (savedValues[key] ?? '')) {
      return true;
    }
  }

  return false;
}

function validateJsFunctionSource(source: string, label: string): string | undefined {
  try {
    const compiled = new Function(`return (${source});`)();
    if (typeof compiled !== 'function') {
      return `${label} must compile to a JavaScript function.`;
    }
  } catch (error) {
    return `${label} is invalid: ${getErrorMessage(error)}`;
  }

  return undefined;
}

function validateEtaTemplateSource(source: string, label: string): string | undefined {
  try {
    etaCompile(source);
  } catch (error) {
    return `${label} is invalid: ${getErrorMessage(error)}`;
  }

  return undefined;
}

const validatorFunctionForType: Record<TextDraftValidation, typeof validateJsFunctionSource> = {
  'js-function': validateJsFunctionSource,
  'eta-template': validateEtaTemplateSource,
};

export default function RevertableTextSettingsGroup({
  savedValues,
  defaultValues,
  onSave,
  validations,
  onRevert,
  onRevertToDefault,
  onIsDirtyChanged,
  saveButtonLabel = 'Save',
  revertButtonLabel = 'Revert',
  revertToDefaultButtonLabel = 'Revert to Default',
  children,
}: RevertableTextSettingsGroupProps) {
  const [draftValues, setDraftValues] = useState<TextDraftValues>(savedValues);
  const [saveError, setSaveError] = useState('');

  const dirty = useMemo(() => isDirtyDraft(savedValues, draftValues), [savedValues, draftValues]);
  const resolvedDefaultValues = useMemo(() => defaultValues ?? savedValues, [defaultValues, savedValues]);
  const getDraftValue = (draftId: string) => draftValues[draftId] ?? '';

  useEffect(() => {
    setDraftValues(savedValues);
  }, [savedValues]);

  useEffect(() => {
    onIsDirtyChanged?.(dirty);
  }, [dirty, onIsDirtyChanged]);

  const setDraftValue = (draftId: string, nextValue: string) => {
    setDraftValues(
      (previous) =>
        ({
          ...previous,
          [draftId]: nextValue,
        }) satisfies typeof previous
    );
  };

  const handleSave = () => {
    for (const [draftId, validation] of Object.entries(validations ?? {})) {
      const source = draftValues[draftId] ?? '';
      const validationError = validatorFunctionForType[validation](source, draftId);

      if (validationError) {
        setSaveError(validationError);
        return;
      }
    }

    const maybeError = onSave(draftValues);
    if (typeof maybeError === 'string' && maybeError) {
      setSaveError(maybeError);
      return;
    }

    setSaveError('');
  };

  const handleRevert = () => {
    setSaveError('');
    setDraftValues(savedValues);
    onRevert?.();
  };

  const handleRevertToDefault = () => {
    setSaveError('');
    setDraftValues(resolvedDefaultValues);
    onRevertToDefault?.(resolvedDefaultValues);
  };

  return (
    <div className="space-y-2">
      {children({
        getDraftValue,
        setDraftValue,
      })}

      {saveError && <div className="error-card">{saveError}</div>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="px-3 py-1 border rounded-sm disabled:opacity-50"
        >
          {saveButtonLabel}
        </button>
        <button
          type="button"
          onClick={handleRevert}
          disabled={!dirty}
          className="px-3 py-1 border rounded-sm disabled:opacity-50"
        >
          {revertButtonLabel}
        </button>
        {onRevertToDefault && (
          <button type="button" onClick={handleRevertToDefault} className="px-3 py-1 border rounded-sm">
            {revertToDefaultButtonLabel}
          </button>
        )}
      </div>
    </div>
  );
}
