type RangeNumberInputProps = {
  id: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (nextValue: number) => void;
  onBlur?: () => void;
};

function parseNumericInput(value: string): number | undefined {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
}

export default function RangeNumberInput({
  id,
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  onBlur,
  onChange,
}: RangeNumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = parseNumericInput(event.target.value);
          if (nextValue === undefined) return;
          onChange(nextValue);
        }}
        onBlur={() => onBlur?.()}
        className="flex-1"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => {
          const nextValue = parseNumericInput(event.target.value);
          if (nextValue === undefined) return;
          onChange(nextValue);
        }}
        onBlur={() => onBlur?.()}
        className="w-24 border rounded-sm px-2 py-1"
      />
    </div>
  );
}
