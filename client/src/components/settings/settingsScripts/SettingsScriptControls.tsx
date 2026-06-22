import { useState } from 'react';
import Calendar from 'react-calendar';
import type {
  ButtonHandlerResult,
  SettingsScriptControl,
} from '../../../engine/settings/settings_scripts/settings_script.js';
import { getControlDefault } from '../../../engine/settings/settings_scripts/settings_scripts_store.js';
import { makeTextFileGroupKey } from '../../../engine/settings/settings_scripts/settings_scripts_state.js';
import { safeParseJson } from '../../../util/json.js';
import SettingFieldLabel from '../ui/SettingFieldLabel.js';
import TextFileListField from './TextFileListField.js';

type SettingsScriptControlsProps = {
  controls: SettingsScriptControl[] | undefined;
  values: Record<string, string>;
  onChange: (controlId: string, value: string) => void;
  onButtonClick: (buttonId: string) => Promise<ButtonHandlerResult>;
  idPrefix: string;
  sectionId: string;
  scriptId: string;
  visibleControlIds?: string[] | undefined;
};

function itemClassName(width: 'full' | undefined): string {
  return width === 'full' ? 'basis-full' : 'basis-full md:basis-[calc(50%-0.375rem)] md:grow';
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type FieldChromeProps = {
  label: string;
  tooltipHtml: string | undefined;
  htmlFor: string;
  children: React.ReactNode;
};

function StackedField({ label, tooltipHtml, htmlFor, children }: FieldChromeProps) {
  return (
    <div className="space-y-1">
      <SettingFieldLabel text={label} htmlFor={htmlFor} tooltipHtml={tooltipHtml} />
      {children}
    </div>
  );
}

function InlineField({ label, tooltipHtml, htmlFor, children }: FieldChromeProps) {
  return (
    <div className="text-xs text-muted flex items-center justify-between gap-3">
      <SettingFieldLabel text={label} htmlFor={htmlFor} tooltipHtml={tooltipHtml} />
      {children}
    </div>
  );
}

function ControlField({
  control,
  value,
  onChange,
  onButtonClick,
  htmlFor,
  sectionId,
  scriptId,
}: {
  control: SettingsScriptControl;
  value: string;
  onChange: (value: string) => void;
  onButtonClick: () => Promise<ButtonHandlerResult>;
  htmlFor: string;
  sectionId: string;
  scriptId: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [buttonResult, setButtonResult] = useState<ButtonHandlerResult | undefined>(undefined);

  switch (control.type) {
    case 'string':
      return (
        <StackedField label={control.label ?? control.id} tooltipHtml={control.tooltipHtml} htmlFor={htmlFor}>
          <input
            id={htmlFor}
            value={value}
            placeholder={control.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className="rounded-input"
          />
        </StackedField>
      );

    case 'password':
      return (
        <StackedField label={control.label ?? control.id} tooltipHtml={control.tooltipHtml} htmlFor={htmlFor}>
          <div className="flex gap-2">
            <input
              id={htmlFor}
              type={showPassword ? 'text' : 'password'}
              value={value}
              placeholder={control.placeholder}
              onChange={(event) => onChange(event.target.value)}
              className="rounded-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="shrink-0 px-2 py-1 border rounded-sm"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </StackedField>
      );

    case 'json': {
      const jsonError = value.trim() && safeParseJson(value) === undefined ? 'Must be valid JSON.' : '';
      return (
        <StackedField label={control.label ?? control.id} tooltipHtml={control.tooltipHtml} htmlFor={htmlFor}>
          <textarea
            id={htmlFor}
            rows={8}
            value={value}
            placeholder={control.placeholder}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            className="rounded-input font-mono text-sm"
          />
          {jsonError && <div className="error-card">{jsonError}</div>}
        </StackedField>
      );
    }

    case 'number':
      return (
        <InlineField label={control.label ?? control.id} tooltipHtml={control.tooltipHtml} htmlFor={htmlFor}>
          <input
            id={htmlFor}
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={value}
            placeholder={control.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className="w-28 border rounded-sm px-2 py-1"
          />
        </InlineField>
      );

    case 'dropdown_select': {
      // Keep a previously-saved value selectable even before its options load (e.g. ComfyUI before Connect).
      const hasValue = value === '' || control.options.some((option) => option.value === value);
      return (
        <InlineField label={control.label ?? control.id} tooltipHtml={control.tooltipHtml} htmlFor={htmlFor}>
          <select
            id={htmlFor}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-36 rounded-input"
          >
            {!hasValue && <option value={value}>{value}</option>}
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
        </InlineField>
      );
    }

    case 'calendar': {
      const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;
      return (
        <StackedField label={control.label ?? control.id} tooltipHtml={control.tooltipHtml} htmlFor={htmlFor}>
          <Calendar
            value={selectedDate ?? null}
            onChange={(next) => {
              const date = Array.isArray(next) ? next[0] : next;
              if (date) {
                onChange(toIsoDate(date));
              }
            }}
          />
        </StackedField>
      );
    }

    case 'text_file_list':
      return (
        <TextFileListField
          groupKey={makeTextFileGroupKey(sectionId, scriptId, control.id)}
          label={control.label ?? control.id}
          tooltipHtml={control.tooltipHtml}
          htmlFor={htmlFor}
          value={value}
          onChange={onChange}
        />
      );

    case 'button':
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={buttonLoading}
              onClick={async () => {
                setButtonLoading(true);
                setButtonResult(undefined);
                try {
                  setButtonResult(await onButtonClick());
                } finally {
                  setButtonLoading(false);
                }
              }}
              className="px-3 py-1 border rounded-sm"
            >
              {buttonLoading ? 'Working...' : control.title}
            </button>
            {buttonResult?.result === 'success' && (
              <p className="text-sm text-secondary">✓ {buttonResult.resultDescription}</p>
            )}
          </div>
          {buttonResult?.result === 'failure' && (
            <div className="error-card">{buttonResult.resultDescription}</div>
          )}
        </div>
      );

    default:
      return undefined;
  }
}

export default function SettingsScriptControls({
  controls,
  values,
  onChange,
  onButtonClick,
  idPrefix,
  sectionId,
  scriptId,
  visibleControlIds,
}: SettingsScriptControlsProps) {
  const visibleControls = visibleControlIds
    ? (controls ?? []).filter((control) => visibleControlIds.includes(control.id))
    : controls;

  if (!visibleControls || visibleControls.length === 0) {
    return undefined;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {visibleControls.map((control) => {
        const htmlFor = `${idPrefix}-${control.id}`;
        const value = control.type === 'button' ? '' : (values[control.id] ?? getControlDefault(control));

        return (
          <div key={control.id} className={itemClassName(control.width)}>
            <ControlField
              control={control}
              value={value}
              htmlFor={htmlFor}
              sectionId={sectionId}
              scriptId={scriptId}
              onChange={(nextValue) => onChange(control.id, nextValue)}
              onButtonClick={() => onButtonClick(control.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
