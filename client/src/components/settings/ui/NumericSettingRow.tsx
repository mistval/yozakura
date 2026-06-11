import SettingFieldLabel from './SettingFieldLabel.js';

type NumericSettingRowProps = {
  id: string;
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
  onBlur?: () => void;
  tooltipHtml?: string;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
};

function parseNumericInput(value: string): number | undefined {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
}

export default function NumericSettingRow({
  id,
  label,
  value,
  onChange,
  tooltipHtml,
  min,
  max,
  step,
  className,
  onBlur,
  inputClassName,
  labelClassName,
}: NumericSettingRowProps) {
  const labelProps = {
    text: label,
    htmlFor: id,
    ...(tooltipHtml ? { tooltipHtml } : {}),
    ...(labelClassName ? { className: labelClassName } : {}),
  };

  return (
    <div className={className ?? 'text-xs text-muted flex items-center justify-between gap-3'}>
      <SettingFieldLabel {...labelProps} />
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={String(value)}
        onChange={(event) => {
          const nextValue = parseNumericInput(event.target.value);
          if (nextValue === undefined) return;
          onChange(nextValue);
        }}
        onBlur={() => onBlur?.()}
        className={inputClassName ?? 'w-24 border rounded-sm px-2 py-1'}
      />
    </div>
  );
}
